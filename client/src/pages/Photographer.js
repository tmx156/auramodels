import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { FiUpload, FiFolder, FiX, FiImage, FiCheck, FiTrash2, FiCalendar } from 'react-icons/fi';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { getCloudinaryUrl, getBlurPlaceholder } from '../utils/imageUtils';
import OptimizedImage from '../components/OptimizedImage';

const Photographer = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [photos, setPhotos] = useState([]);
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadDetails, setUploadDetails] = useState({ current: 0, total: 0, currentFileName: '' });
  const [dragActive, setDragActive] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null); // Single lead, not array
  const [showLeadSelector, setShowLeadSelector] = useState(false);
  const [availableLeads, setAvailableLeads] = useState([]);
  const [todaysLeads, setTodaysLeads] = useState([]); // Today's appointments
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [leadSearchQuery, setLeadSearchQuery] = useState('');
  const [assigningPhotos, setAssigningPhotos] = useState(false);
  const selectAllCheckboxRef = useRef(null);
  
  // Pagination state (Pinterest/Instagram style)
  const [hasMorePhotos, setHasMorePhotos] = useState(true);
  const [nextCursor, setNextCursor] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const abortControllerRef = useRef(null);
  const PHOTOS_PER_PAGE = 30; // Optimal for performance (Pinterest uses 20-30)

  // Viewport optimization - only render 20 images at once
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 20 });
  const [imagesPerRow, setImagesPerRow] = useState(6); // Default, will be calculated
  const VISIBLE_IMAGES_COUNT = 20;
  const BUFFER_IMAGES = 5; // Render a few extra above/below for smooth scrolling
  const gridContainerRef = useRef(null);

  // Fetch photographer's photos with cursor-based pagination
  const fetchPhotos = useCallback(async (reset = false, cursor = null) => {
    // Cancel previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    
    try {
      if (reset) {
        setLoadingPhotos(true);
        setPhotos([]);
        setNextCursor(null);
        setHasMorePhotos(true);
      } else {
        setLoadingMore(true);
      }
      
      console.log('📸 Fetching photographer photos...', { cursor, limit: PHOTOS_PER_PAGE });
      
      const response = await axios.get('/api/photos', {
        params: {
          limit: PHOTOS_PER_PAGE,
          cursor: cursor || undefined,
          fields: 'minimal' // Only fetch needed fields
        },
        signal: abortControllerRef.current.signal
      });
      
      console.log('📸 Photos response:', response.data);
      
      if (response.data.success) {
        const newPhotos = response.data.photos || [];
        
        if (reset) {
          setPhotos(newPhotos);
          // Extract unique folders from photos
          const uniqueFolders = [...new Set(
            newPhotos
              .map(p => p.folder_path)
              .filter(Boolean)
          )];
          setFolders(uniqueFolders);
        } else {
          // Deduplicate when merging - only add photos that don't already exist
          setPhotos(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const uniqueNewPhotos = newPhotos.filter(p => !existingIds.has(p.id));
            const merged = [...prev, ...uniqueNewPhotos];
            
            // Extract unique folders from all loaded photos
            const uniqueFolders = [...new Set(
              merged
                .map(p => p.folder_path)
                .filter(Boolean)
            )];
            setFolders(uniqueFolders);
            
            return merged;
          });
        }
        
        // Update pagination state
        setHasMorePhotos(response.data.hasMore || false);
        setNextCursor(response.data.nextCursor || null);
      }
    } catch (error) {
      if (error.name === 'CanceledError' || error.message === 'canceled') {
        console.log('📸 Photo fetch cancelled');
        return;
      }
      console.error('Error fetching photos:', error);
    } finally {
      setLoadingPhotos(false);
      setLoadingMore(false);
    }
  }, [PHOTOS_PER_PAGE]);

  // Load more photos (infinite scroll)
  const loadMorePhotos = useCallback(() => {
    if (!loadingMore && hasMorePhotos && nextCursor) {
      fetchPhotos(false, nextCursor);
    }
  }, [loadingMore, hasMorePhotos, nextCursor, fetchPhotos]);

  // Initial load
  useEffect(() => {
    fetchPhotos(true);
    
    // Cleanup on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Infinite scroll with Intersection Observer
  const loadMoreRef = useRef(null);
  useEffect(() => {
    if (!loadMoreRef.current || !hasMorePhotos || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMorePhotos && !loadingMore) {
          loadMorePhotos();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loadMoreRef.current);

    return () => {
      if (loadMoreRef.current) {
        observer.unobserve(loadMoreRef.current);
      }
    };
  }, [hasMorePhotos, loadingMore, loadMorePhotos]);

  // Calculate images per row based on screen size
  useEffect(() => {
    const calculateImagesPerRow = () => {
      const width = window.innerWidth;
      if (width >= 1280) return 6; // xl
      if (width >= 1024) return 5; // lg
      if (width >= 768) return 4; // md
      if (width >= 640) return 3; // sm
      return 2; // mobile
    };
    
    setImagesPerRow(calculateImagesPerRow());
    
    const handleResize = () => {
      setImagesPerRow(calculateImagesPerRow());
    };
    
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);



  // Handle file upload
  const handleUpload = async (files, folderPath = '') => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    const totalFiles = fileArray.length;

    setUploading(true);
    setUploadProgress(0);
    setUploadDetails({ current: 0, total: totalFiles, currentFileName: '' });

    let uploadedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];

      // Update current file info
      setUploadDetails({
        current: i + 1,
        total: totalFiles,
        currentFileName: file.name.length > 25 ? file.name.substring(0, 22) + '...' : file.name
      });

      const formData = new FormData();
      formData.append('photo', file);
      if (folderPath) {
        formData.append('folderPath', folderPath);
      } else if (selectedFolder) {
        formData.append('folderPath', selectedFolder);
      }

      try {
        // Don't set Content-Type - let axios set it with boundary
        await axios.post('/api/photos/upload', formData);
        uploadedCount++;
      } catch (error) {
        console.error('Upload error:', error);
        failedCount++;
      }

      // Update progress
      setUploadProgress(Math.round(((i + 1) / totalFiles) * 100));
    }

    setUploading(false);
    setUploadProgress(0);
    setUploadDetails({ current: 0, total: 0, currentFileName: '' });

    // Refresh photos (reset pagination)
    fetchPhotos(true);

    // Show result
    if (failedCount > 0) {
      alert(`Uploaded ${uploadedCount} of ${totalFiles} photos. ${failedCount} failed.`);
    } else if (uploadedCount > 0) {
      alert(`Successfully uploaded ${uploadedCount} photo${uploadedCount > 1 ? 's' : ''}!`);
    }
  };

  // Drag and drop handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files);
    }
  };

  // Create new folder
  const createFolder = () => {
    const folderName = prompt('Enter folder name:');
    if (folderName && folderName.trim()) {
      const trimmedFolder = folderName.trim();
      if (!folders.includes(trimmedFolder)) {
        setFolders([...folders, trimmedFolder]);
        setSelectedFolder(trimmedFolder);
      } else {
        alert('Folder already exists');
      }
    }
  };

  // Fetch leads for assignment - auto-loads when modal opens
  const fetchLeads = useCallback(async () => {
    setLoadingLeads(true);
    try {
      console.log('📋 Fetching leads...');
      const response = await axios.get('/api/leads', { params: { limit: 100 } });
      console.log('📋 Leads response:', response.data);

      const allLeads = response.data.leads || response.data || [];
      console.log('📋 Total leads:', allLeads.length);

      if (allLeads.length === 0) {
        console.log('⚠️ No leads returned from API');
        setTodaysLeads([]);
        setAvailableLeads([]);
        return;
      }

      // Sort by most recently updated first
      const sortedLeads = allLeads.sort((a, b) =>
        new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
      );

      console.log('📋 Available leads:', sortedLeads.length);

      // All leads go in todaysLeads for display
      setTodaysLeads(sortedLeads);
      setAvailableLeads([]);
    } catch (error) {
      console.error('❌ Error fetching leads:', error.response?.data || error.message);
    } finally {
      setLoadingLeads(false);
    }
  }, []);

  // Assign photos to a single lead
  const assignPhotosToLead = async () => {
    if (selectedPhotos.length === 0 || !selectedLead) {
      alert('Please select photos and a lead');
      return;
    }

    setAssigningPhotos(true);
    try {
      let successCount = 0;
      for (const photoId of selectedPhotos) {
        try {
          await axios.put(`/api/photos/${photoId}`, {
            leadId: selectedLead.id
          });
          successCount++;
        } catch (error) {
          console.error(`Error assigning photo ${photoId}:`, error);
        }
      }

      if (successCount > 0) {
        setSelectedPhotos([]);
        setSelectedLead(null);
        setShowLeadSelector(false);
        setLeadSearchQuery('');
        fetchPhotos();
      } else {
        alert('Failed to assign photos. Please try again.');
      }
    } catch (error) {
      console.error('Error assigning photos:', error);
      alert('Error assigning photos. Please try again.');
    } finally {
      setAssigningPhotos(false);
    }
  };

  // Delete photo
  const deletePhoto = async (photoId) => {
    if (!window.confirm('Are you sure you want to delete this photo?')) return;
    
    try {
      await axios.delete(`/api/photos/${photoId}`);
      fetchPhotos(true); // Reset pagination after delete
      alert('Photo deleted successfully');
    } catch (error) {
      console.error('Error deleting photo:', error);
      alert('Error deleting photo. Please try again.');
    }
  };

  // Bulk delete selected photos
  const bulkDeletePhotos = async () => {
    if (selectedPhotos.length === 0) return;
    
    const confirmMessage = `Are you sure you want to delete ${selectedPhotos.length} photo(s)? This action cannot be undone.`;
    if (!window.confirm(confirmMessage)) return;
    
    try {
      let successCount = 0;
      let failedCount = 0;
      
      // Delete photos in parallel (but limit concurrency)
      const deletePromises = selectedPhotos.map(async (photoId) => {
        try {
          await axios.delete(`/api/photos/${photoId}`);
          successCount++;
        } catch (error) {
          console.error(`Error deleting photo ${photoId}:`, error);
          failedCount++;
        }
      });
      
      await Promise.all(deletePromises);
      
      // Clear selection and refresh photos
      setSelectedPhotos([]);
      fetchPhotos(true); // Reset pagination after bulk delete
      
      // Show result
      if (failedCount > 0) {
        alert(`Deleted ${successCount} of ${selectedPhotos.length} photos. ${failedCount} failed.`);
      } else {
        alert(`Successfully deleted ${successCount} photo(s)!`);
      }
    } catch (error) {
      console.error('Error during bulk delete:', error);
      alert('Error deleting photos. Please try again.');
    }
  };

  // CRITICAL: Memoize to prevent infinite re-renders in VirtuosoGrid
  // Note: Folder filtering happens client-side on loaded photos
  // For 1000+ photos, consider server-side folder filtering
  const filteredPhotos = useMemo(() => {
    const filtered = selectedFolder
      ? photos.filter(p => p.folder_path === selectedFolder)
      : photos;
    
    // Deduplicate by photo ID to prevent duplicate key warnings
    const seen = new Set();
    const unique = filtered.filter(photo => {
      if (seen.has(photo.id)) {
        // Only log in development to reduce console noise
        if (process.env.NODE_ENV === 'development') {
          console.warn(`Duplicate photo ID found: ${photo.id}`);
        }
        return false;
      }
      seen.add(photo.id);
      return true;
    });
    
    return unique;
  }, [photos, selectedFolder]);

  // Reset visible range when photos change (e.g., folder filter, new uploads)
  useEffect(() => {
    setVisibleRange({ start: 0, end: Math.min(VISIBLE_IMAGES_COUNT + BUFFER_IMAGES * 2, filteredPhotos.length) });
  }, [selectedFolder, filteredPhotos.length]);

  // Viewport-based rendering - update visible range on scroll
  useEffect(() => {
    if (filteredPhotos.length === 0) return;

    const updateVisibleRange = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const viewportHeight = window.innerHeight;
      
      // Calculate which images should be visible based on scroll position
      // Estimate: each image is roughly 200px tall (including gap)
      const estimatedImageHeight = 200;
      
      // Calculate start index based on scroll position
      const rowsFromTop = Math.floor(scrollTop / estimatedImageHeight);
      const startIndex = Math.max(0, (rowsFromTop - BUFFER_IMAGES) * imagesPerRow);
      
      // Calculate end index - show approximately 20 images + buffer
      const visibleRows = Math.ceil(viewportHeight / estimatedImageHeight);
      const endIndex = Math.min(
        filteredPhotos.length,
        startIndex + Math.max(VISIBLE_IMAGES_COUNT, (visibleRows + BUFFER_IMAGES * 2) * imagesPerRow)
      );
      
      setVisibleRange({ start: startIndex, end: endIndex });
    };

    // Initial calculation
    updateVisibleRange();

    // Update on scroll (throttled for performance)
    let scrollTimeout;
    const handleScroll = () => {
      if (scrollTimeout) clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(updateVisibleRange, 50);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    // Also update on resize
    window.addEventListener('resize', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      if (scrollTimeout) clearTimeout(scrollTimeout);
    };
  }, [filteredPhotos.length, imagesPerRow, BUFFER_IMAGES, VISIBLE_IMAGES_COUNT]);

  // Select all photos
  const handleSelectAll = useCallback((checked) => {
    if (checked) {
      // Select all visible photos
      const allPhotoIds = filteredPhotos.map(photo => photo.id);
      setSelectedPhotos(allPhotoIds);
    } else {
      // Deselect all
      setSelectedPhotos([]);
    }
  }, [filteredPhotos]);

  // Check if all visible photos are selected
  const allSelected = useMemo(() => {
    return filteredPhotos.length > 0 && filteredPhotos.every(photo => selectedPhotos.includes(photo.id));
  }, [filteredPhotos, selectedPhotos]);

  const someSelected = useMemo(() => {
    return filteredPhotos.some(photo => selectedPhotos.includes(photo.id));
  }, [filteredPhotos, selectedPhotos]);

  // Update checkbox indeterminate state
  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);
  
  // Note: Folder filtering is client-side for now
  // For 1000+ photos per folder, consider adding folderPath param to API

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Photographer Dashboard</h1>
          <p className="text-gray-600 mt-2">Upload and manage your photos</p>
        </div>

        {/* Folder Management */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Folders</h2>
            <button
              onClick={createFolder}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <FiFolder className="h-4 w-4" />
              <span>New Folder</span>
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedFolder('')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                selectedFolder === '' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              All Photos ({photos.length})
            </button>
            {folders.map((folder) => {
              const folderPhotoCount = photos.filter(p => p.folder_path === folder).length;
              return (
                <button
                  key={folder}
                  onClick={() => setSelectedFolder(folder)}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    selectedFolder === folder
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {folder} ({folderPhotoCount})
                </button>
              );
            })}
          </div>
        </div>

        {/* Upload Area */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Upload Photos</h2>
          {selectedFolder && (
            <p className="text-sm text-blue-600 mb-2">
              Photos will be uploaded to: <strong>{selectedFolder}</strong>
            </p>
          )}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive
                ? 'border-blue-500 bg-blue-50'
                : uploading
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-300 bg-gray-50 hover:border-blue-400'
            }`}
          >
            {uploading ? (
              <div className="space-y-4 py-4">
                {/* Upload icon with spinner */}
                <div className="relative mx-auto w-16 h-16">
                  <FiImage className="h-16 w-16 text-blue-600" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-20 h-20 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                  </div>
                </div>

                {/* File count */}
                <div className="text-center">
                  <p className="text-xl font-semibold text-blue-700">
                    Uploading {uploadDetails.current} of {uploadDetails.total}
                  </p>
                  {uploadDetails.currentFileName && (
                    <p className="text-sm text-gray-500 mt-1 font-mono">
                      {uploadDetails.currentFileName}
                    </p>
                  )}
                </div>

                {/* Progress bar */}
                <div className="w-full max-w-md mx-auto">
                  <div className="flex justify-between text-sm text-gray-500 mb-2">
                    <span>{uploadProgress}% complete</span>
                    <span>{uploadDetails.total - uploadDetails.current} remaining</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300 ease-out relative overflow-hidden"
                      style={{
                        width: `${uploadProgress}%`,
                        background: 'linear-gradient(90deg, #2563EB, #7C3AED)'
                      }}
                    >
                      {/* Animated stripes */}
                      <div
                        className="absolute inset-0 opacity-30"
                        style={{
                          backgroundImage: 'linear-gradient(45deg, rgba(255,255,255,.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.15) 50%, rgba(255,255,255,.15) 75%, transparent 75%, transparent)',
                          backgroundSize: '1rem 1rem',
                          animation: 'progress-stripes 1s linear infinite'
                        }}
                      ></div>
                    </div>
                  </div>
                </div>

                <p className="text-sm text-gray-400">
                  Please don't close this page while uploading
                </p>
              </div>
            ) : (
              <>
                <FiUpload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-600 mb-2">
                  Drag and drop photos here, or click to select
                </p>
                <p className="text-sm text-gray-500 mb-4">
                  Supports: JPEG, PNG, GIF, WebP, HEIC
                </p>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => handleUpload(e.target.files)}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="inline-block px-6 py-3 rounded-lg cursor-pointer transition-colors bg-blue-600 text-white hover:bg-blue-700"
                >
                  Select Photos
                </label>
              </>
            )}
          </div>
        </div>

        {/* Actions Bar */}
        {selectedPhotos.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-center justify-between">
            <span className="text-blue-800 font-medium">
              {selectedPhotos.length} photo(s) selected
            </span>
            <div className="flex space-x-2">
              <button
                onClick={() => {
                  setShowLeadSelector(true);
                  fetchLeads(); // Auto-fetch when opening
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <FiCalendar className="inline h-4 w-4 mr-2" />
                Assign to Client
              </button>
              <button
                onClick={bulkDeletePhotos}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <FiTrash2 className="inline h-4 w-4 mr-2" />
                Delete Selected
              </button>
              <button
                onClick={() => setSelectedPhotos([])}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Clear Selection
              </button>
            </div>
          </div>
        )}

        {/* Lead Selector Modal - Improved UX */}
        {showLeadSelector && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
              {/* Header */}
              <div className="flex justify-between items-center p-5 border-b bg-gradient-to-r from-blue-600 to-indigo-600 rounded-t-xl">
                <div>
                  <h3 className="text-xl font-bold text-white">Assign to Client</h3>
                  <p className="text-blue-100 text-sm">{selectedPhotos.length} photo(s) selected</p>
                </div>
                <button
                  onClick={() => {
                    setShowLeadSelector(false);
                    setSelectedLead(null);
                    setLeadSearchQuery('');
                  }}
                  className="text-white/80 hover:text-white p-1"
                >
                  <FiX className="h-6 w-6" />
                </button>
              </div>

              {/* Search */}
              <div className="p-4 border-b">
                <input
                  type="text"
                  placeholder="Search by name or phone..."
                  value={leadSearchQuery}
                  onChange={(e) => setLeadSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Lead List */}
              <div className="flex-1 overflow-y-auto p-4">
                {loadingLeads ? (
                  <div className="text-center py-8">
                    <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3"></div>
                    <p className="text-gray-500">Loading clients...</p>
                  </div>
                ) : (
                  <>
                    {/* Available Clients */}
                    {todaysLeads.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center">
                          <FiCalendar className="h-3 w-3 mr-1" />
                          Select a Client ({todaysLeads.length} available)
                        </h4>
                        <div className="space-y-1">
                          {todaysLeads
                            .filter(lead =>
                              !leadSearchQuery ||
                              lead.name?.toLowerCase().includes(leadSearchQuery.toLowerCase()) ||
                              lead.phone?.includes(leadSearchQuery)
                            )
                            .map((lead) => (
                              <button
                                key={lead.id}
                                onClick={() => setSelectedLead(lead)}
                                className={`w-full text-left p-3 rounded-lg transition-all ${
                                  selectedLead?.id === lead.id
                                    ? 'bg-blue-100 border-2 border-blue-500'
                                    : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center">
                                      <span className="font-medium text-gray-900">{lead.name || 'Unnamed'}</span>
                                      <span className={`ml-2 px-2 py-0.5 text-xs rounded-full font-medium ${
                                        lead.status === 'Attended' ? 'bg-green-100 text-green-700' :
                                        lead.status === 'Sale' ? 'bg-purple-100 text-purple-700' :
                                        'bg-blue-100 text-blue-700'
                                      }`}>
                                        {lead.status}
                                      </span>
                                    </div>
                                    {lead.phone && (
                                      <span className="text-sm text-gray-500">{lead.phone}</span>
                                    )}
                                  </div>
                                  {selectedLead?.id === lead.id && (
                                    <FiCheck className="h-5 w-5 text-blue-600" />
                                  )}
                                </div>
                              </button>
                            ))}
                        </div>
                      </div>
                    )}


                    {todaysLeads.length === 0 && (
                      <div className="text-center py-8">
                        <FiImage className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                        <p className="text-gray-500 font-medium">No clients found</p>
                        <p className="text-gray-400 text-sm mt-1">Only Booked, Attended, or Sale clients are available</p>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t bg-gray-50 rounded-b-xl">
                {selectedLead && (
                  <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm text-blue-800">
                      <strong>Assigning to:</strong> {selectedLead.name}
                    </p>
                  </div>
                )}
                <div className="flex space-x-3">
                  <button
                    onClick={() => {
                      setShowLeadSelector(false);
                      setSelectedLead(null);
                      setLeadSearchQuery('');
                    }}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={assignPhotosToLead}
                    disabled={!selectedLead || assigningPhotos}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
                  >
                    {assigningPhotos ? (
                      <>
                        <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                        Assigning...
                      </>
                    ) : (
                      <>
                        <FiCheck className="h-4 w-4 mr-2" />
                        Assign Photos
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Photo Gallery - Virtualized for 100k+ images */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              {selectedFolder ? `Photos in "${selectedFolder}"` : 'My Uploaded Photos'} ({filteredPhotos.length})
            </h2>
            {!loadingPhotos && filteredPhotos.length > 0 && (
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  ref={selectAllCheckboxRef}
                  checked={allSelected}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  title={allSelected ? 'Deselect all' : someSelected ? 'All selected (some)' : 'Select all'}
                />
                <label 
                  className="text-sm text-gray-700 cursor-pointer select-none" 
                  onClick={() => handleSelectAll(!allSelected)}
                >
                  {allSelected ? 'Deselect All' : 'Select All'}
                </label>
              </div>
            )}
          </div>
          {loadingPhotos ? (
            <div className="text-center py-12">
              <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-gray-500">Loading your photos...</p>
            </div>
          ) : filteredPhotos.length === 0 ? (
            <div className="text-center py-12">
              <FiImage className="h-16 w-16 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">No photos yet. Upload some photos to get started!</p>
            </div>
          ) : (
            <div className="relative" ref={gridContainerRef}>
              {/* Photo Grid - Only render visible images for optimization */}
              <div 
                className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
                style={{ minHeight: '400px' }}
              >
                {/* Spacer for images before visible range */}
                {visibleRange.start > 0 && (
                  <div 
                    style={{ 
                      gridColumn: '1 / -1',
                      height: `${Math.ceil(visibleRange.start / imagesPerRow) * 200}px`
                    }}
                  />
                )}
                
                {/* Render only visible images */}
                {filteredPhotos.slice(visibleRange.start, visibleRange.end).map((photo, relativeIndex) => {
                  const index = visibleRange.start + relativeIndex;
                  const imageUrl = photo.cloudinary_secure_url || photo.cloudinary_url;
                  const isSelected = selectedPhotos.includes(photo.id);

                  return (
                    <div
                      key={`${photo.id}-${index}`}
                      className={`relative group cursor-pointer border-2 rounded-lg overflow-hidden transition-all aspect-square bg-gray-100 ${
                        isSelected
                          ? 'border-blue-600 ring-2 ring-blue-300'
                          : 'border-gray-200 hover:border-blue-400'
                      }`}
                      onClick={() => {
                        setSelectedPhotos(prev =>
                          prev.includes(photo.id)
                            ? prev.filter(id => id !== photo.id)
                            : [...prev, photo.id]
                        );
                      }}
                    >
                      {/* Progressive loading: blur placeholder → thumbnail → full on hover */}
                      <OptimizedImage
                        src={imageUrl}
                        alt={photo.description || 'Photo'}
                        size="thumb" // Start with smallest (100x100) for grid
                        className="w-full h-full object-cover"
                        useBlur={true}
                        threshold={100} // Start loading 100px before viewport
                        onError={(e) => {
                          // Safely handle error - hide image if event and target exist
                          if (e && e.target && e.target.style) {
                            e.target.style.display = 'none';
                          }
                          // Log error for debugging (only in dev)
                          if (process.env.NODE_ENV === 'development') {
                            console.warn('Failed to load image:', imageUrl);
                          }
                        }}
                      />

                      {/* Selection overlay */}
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-opacity flex items-center justify-center pointer-events-none">
                        {isSelected && (
                          <div className="bg-blue-600 rounded-full p-2">
                            <FiCheck className="h-6 w-6 text-white" />
                          </div>
                        )}
                      </div>

                      {/* Delete button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePhoto(photo.id);
                        }}
                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 z-10"
                        title="Delete photo"
                      >
                        <FiTrash2 className="h-4 w-4" />
                      </button>

                      {/* Lead assignment badge */}
                      {photo.lead_id && (
                        <div className="absolute bottom-0 left-0 right-0 bg-blue-600 text-white text-xs p-1.5 text-center font-medium truncate z-10">
                          {photo.leads?.name || 'Assigned'}
                        </div>
                      )}
                    </div>
                  );
                })}
                
                {/* Spacer for images after visible range */}
                {visibleRange.end < filteredPhotos.length && (
                  <div 
                    style={{ 
                      gridColumn: '1 / -1',
                      height: `${Math.ceil((filteredPhotos.length - visibleRange.end) / imagesPerRow) * 200}px`
                    }}
                  />
                )}
              </div>
              
              {/* Infinite scroll trigger */}
              {hasMorePhotos && <div ref={loadMoreRef} style={{ height: '20px' }} />}
              
              {/* Loading indicator for pagination */}
              {loadingMore && (
                <div className="text-center py-4">
                  <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                  <p className="text-gray-500 text-sm">Loading more photos...</p>
                </div>
              )}
              {/* End of list indicator */}
              {!hasMorePhotos && filteredPhotos.length > 0 && (
                <div className="text-center py-4">
                  <p className="text-gray-400 text-sm">All photos loaded ({filteredPhotos.length} total)</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Photographer;
