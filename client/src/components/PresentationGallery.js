import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  FiX, FiChevronLeft, FiChevronRight, FiPlay, FiPause,
  FiCheck, FiPlus, FiShoppingBag, FiImage, FiCheckSquare, FiSquare,
  FiMaximize, FiMinimize, FiLoader, FiTrash2
} from 'react-icons/fi';
import { getCloudinaryUrl, getBlurPlaceholder } from '../utils/imageUtils';
import OptimizedImage from './OptimizedImage';
import axios from 'axios';

// Photo folder options for filtering
const PHOTO_FOLDERS = [
  { id: 'all', label: 'Full Shoot' },
  { id: 'headshots', label: 'Headshots' },
  { id: 'zcard', label: 'Z-Card' },
  { id: 'best-pics', label: 'Best Pics' }
];

/**
 * PresentationGallery - Fullscreen slideshow for presenting photos to clients
 * Features smooth crossfade transitions, auto-play, and photo selection
 * Fetches ALL photos for the lead when opened (independent of parent's pagination)
 */
const PresentationGallery = ({
  isOpen,
  onClose,
  photos: initialPhotos = [], // Used as initial data while fetching all
  leadId,
  leadName,
  onProceedToPackage,
  initialSelectedIds = [],
  imageLimit = null, // null = unlimited, number = max allowed
  selectionMode = false, // true when selecting after package chosen
  onDeletePhoto = null // callback to delete a photo (photoId, event) => void
}) => {
  // State
  const [allPhotos, setAllPhotos] = useState(initialPhotos); // All fetched photos
  const [activeFolder, setActiveFolder] = useState('all'); // Current folder filter
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set(initialSelectedIds));
  const [isPlaying, setIsPlaying] = useState(true);
  const [playInterval] = useState(4000); // 4 seconds per photo
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isImmersive, setIsImmersive] = useState(false); // Hide UI for fullscreen view
  const [isFullscreen, setIsFullscreen] = useState(false); // Browser native fullscreen

  // Filter photos by active folder
  const photos = useMemo(() => {
    if (activeFolder === 'all') return allPhotos;
    return allPhotos.filter(p => p.folder_path === activeFolder);
  }, [allPhotos, activeFolder]);

  // Get folder counts for sidebar
  const folderCounts = useMemo(() => {
    const counts = { all: allPhotos.length };
    PHOTO_FOLDERS.forEach(folder => {
      if (folder.id !== 'all') {
        counts[folder.id] = allPhotos.filter(p => p.folder_path === folder.id).length;
      }
    });
    return counts;
  }, [allPhotos]);

  // Refs
  const thumbnailContainerRef = useRef(null);
  const autoPlayRef = useRef(null);
  const galleryContainerRef = useRef(null);
  const transitionTimeoutRef = useRef(null);
  const currentFetchLeadIdRef = useRef(null); // Track current fetch to prevent race conditions

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(0);
      setPreviousIndex(null);
      setSelectedIds(new Set(initialSelectedIds));
      setIsPlaying(true);
      setImageLoaded(false);
      setIsImmersive(false);
      setActiveFolder('all');
      // Use initial photos immediately while we fetch all
      setAllPhotos(initialPhotos);
    }
  }, [isOpen, initialSelectedIds, initialPhotos]);

  // Reset index when folder changes
  useEffect(() => {
    setCurrentIndex(0);
    setPreviousIndex(null);
    setImageLoaded(false);
  }, [activeFolder]);

  // Ensure currentIndex stays within bounds when photos array changes
  useEffect(() => {
    if (photos.length > 0 && currentIndex >= photos.length) {
      setCurrentIndex(photos.length - 1);
      setPreviousIndex(null);
    }
  }, [photos.length, currentIndex]);

  // Fetch ALL photos for the lead when gallery opens (independent fetch)
  useEffect(() => {
    const fetchAllPhotos = async () => {
      if (!isOpen || !leadId) return;

      // Track which lead we're fetching for (prevents race conditions)
      currentFetchLeadIdRef.current = leadId;

      setIsLoadingPhotos(true);
      try {
        // Fetch ALL photos (limit 500 is server max)
        const response = await axios.get('/api/photos', {
          params: {
            leadId,
            limit: 500, // Fetch all photos for the gallery
            fields: 'minimal'
          }
        });

        // Check if this response is still relevant (prevents race conditions)
        if (currentFetchLeadIdRef.current !== leadId) {
          console.log('📸 Gallery: Ignoring stale photo response for lead:', leadId);
          return;
        }

        if (response.data.success && response.data.photos) {
          const fetchedPhotos = response.data.photos;
          console.log(`📸 Gallery: Fetched ${fetchedPhotos.length} photos for lead ${leadId}`);
          setAllPhotos(fetchedPhotos);
        }
      } catch (error) {
        console.error('Error fetching all photos for gallery:', error);
        // Keep using initialPhotos if fetch fails
      } finally {
        if (currentFetchLeadIdRef.current === leadId) {
          setIsLoadingPhotos(false);
        }
      }
    };

    fetchAllPhotos();
  }, [isOpen, leadId]);

  // Check if all photos in current folder are selected
  const allInFolderSelected = useMemo(() => {
    if (photos.length === 0) return false;
    return photos.every(p => selectedIds.has(p.id));
  }, [photos, selectedIds]);

  // Select All / Deselect All handler - preserves selections from other folders
  const handleSelectAll = () => {
    if (allInFolderSelected) {
      // Deselect only photos in current folder, keep other selections
      setSelectedIds(prev => {
        const newSet = new Set(prev);
        photos.forEach(p => newSet.delete(p.id));
        return newSet;
      });
    } else {
      // Add all photos from current folder (respecting image limit)
      setSelectedIds(prev => {
        const newSet = new Set(prev);
        const currentFolderIds = photos.map(p => p.id);

        for (const id of currentFolderIds) {
          // Check limit before adding
          if (imageLimit !== null && newSet.size >= imageLimit) {
            break;
          }
          newSet.add(id);
        }
        return newSet;
      });
    }
  };

  // For UI display - use allInFolderSelected
  const allSelected = allInFolderSelected;

  // Toggle browser native fullscreen
  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        // Enter fullscreen
        if (galleryContainerRef.current) {
          await galleryContainerRef.current.requestFullscreen();
          setIsFullscreen(true);
          setIsImmersive(true); // Also enable immersive mode
        }
      } else {
        // Exit fullscreen
        await document.exitFullscreen();
        setIsFullscreen(false);
        setIsImmersive(false);
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  }, []);

  // Listen for fullscreen changes (e.g., user presses ESC to exit)
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isNowFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isNowFullscreen);
      if (!isNowFullscreen) {
        setIsImmersive(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Exit fullscreen when modal closes and cleanup
  useEffect(() => {
    if (!isOpen) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      // Clear any pending transition timeout
      if (transitionTimeoutRef.current) {
        clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = null;
      }
    }
  }, [isOpen]);

  // Preload next image with optimized URL
  const preloadImage = useCallback((index) => {
    if (photos[index]) {
      const img = new Image();
      const imageUrl = photos[index].cloudinary_secure_url || photos[index].cloudinary_url;
      img.src = getCloudinaryUrl(imageUrl, 'large');
    }
  }, [photos]);

  // Navigate to specific photo
  const goToPhoto = useCallback((newIndex, skipTransition = false) => {
    if (newIndex === currentIndex || photos.length === 0) return;

    // Wrap around
    const targetIndex = ((newIndex % photos.length) + photos.length) % photos.length;

    // Clear any pending transition
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }

    if (skipTransition) {
      // Instant navigation (no crossfade)
      setCurrentIndex(targetIndex);
      setPreviousIndex(null);
      setIsTransitioning(false);
      setImageLoaded(false);
    } else {
      // Smooth crossfade transition
      setIsTransitioning(true);
      setPreviousIndex(currentIndex);
      setCurrentIndex(targetIndex);
      setImageLoaded(false);

      // Preload next image
      preloadImage((targetIndex + 1) % photos.length);

      // Clear previous after transition
      transitionTimeoutRef.current = setTimeout(() => {
        setPreviousIndex(null);
        setIsTransitioning(false);
      }, 500); // Reduced from 800ms for snappier feel
    }
  }, [currentIndex, photos.length, preloadImage]);

  // Next/Previous handlers
  const goToNext = useCallback(() => {
    goToPhoto(currentIndex + 1);
  }, [currentIndex, goToPhoto]);

  const goToPrevious = useCallback(() => {
    goToPhoto(currentIndex - 1);
  }, [currentIndex, goToPhoto]);

  // Auto-play effect
  useEffect(() => {
    if (!isPlaying || !isOpen || photos.length <= 1) {
      if (autoPlayRef.current) {
        clearInterval(autoPlayRef.current);
        autoPlayRef.current = null;
      }
      return;
    }

    autoPlayRef.current = setInterval(() => {
      goToNext();
    }, playInterval);

    return () => {
      if (autoPlayRef.current) {
        clearInterval(autoPlayRef.current);
      }
    };
  }, [isPlaying, isOpen, photos.length, playInterval, goToNext]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      switch (e.key) {
        case 'ArrowLeft':
          goToPrevious();
          setIsPlaying(false);
          break;
        case 'ArrowRight':
          goToNext();
          setIsPlaying(false);
          break;
        case ' ':
          e.preventDefault();
          setIsPlaying(prev => !prev);
          break;
        case 'Escape':
          if (isImmersive) {
            setIsImmersive(false);
          } else {
            onClose();
          }
          break;
        case 'Enter':
          toggleSelection(photos[currentIndex]?.id);
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        case 'a':
        case 'A':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleSelectAll();
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, goToNext, goToPrevious, onClose, photos, isImmersive, handleSelectAll, toggleFullscreen]);

  // Scroll thumbnail into view - using scrollLeft for precise control
  useEffect(() => {
    if (thumbnailContainerRef.current && photos.length > 0) {
      const container = thumbnailContainerRef.current;
      const thumbnail = container.children[currentIndex];
      if (thumbnail) {
        // Calculate scroll position to center the thumbnail
        const containerWidth = container.offsetWidth;
        const thumbnailLeft = thumbnail.offsetLeft;
        const thumbnailWidth = thumbnail.offsetWidth;
        const scrollTarget = thumbnailLeft - (containerWidth / 2) + (thumbnailWidth / 2);

        // Use instant scroll on initial load (currentIndex === 0), smooth otherwise
        container.scrollTo({
          left: Math.max(0, scrollTarget),
          behavior: currentIndex === 0 ? 'instant' : 'smooth'
        });
      }
    }
  }, [currentIndex, photos.length]);

  // Reset scroll position when gallery opens
  useEffect(() => {
    if (isOpen && thumbnailContainerRef.current) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        if (thumbnailContainerRef.current) {
          thumbnailContainerRef.current.scrollTo({ left: 0, behavior: 'instant' });
        }
      }, 100);
    }
  }, [isOpen]);

  // Toggle photo selection
  const toggleSelection = (photoId) => {
    if (!photoId) return;

    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(photoId)) {
        newSet.delete(photoId);
      } else {
        // Check if we're at the limit
        if (imageLimit !== null && newSet.size >= imageLimit) {
          // At limit, don't add more
          return prev;
        }
        newSet.add(photoId);
      }
      return newSet;
    });
  };

  // Handle photo deletion - calls parent callback and removes from local state
  const handleDeletePhoto = async (photoId, e) => {
    if (!onDeletePhoto) return;
    // Call parent's delete handler (which does the API call + confirmation)
    await onDeletePhoto(photoId, e);
    // Remove from local gallery state
    setAllPhotos(prev => prev.filter(p => p.id !== photoId));
    // Remove from selection if selected
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      newSet.delete(photoId);
      return newSet;
    });
  };

  // Check if at selection limit
  const atLimit = imageLimit !== null && selectedIds.size >= imageLimit;

  // Handle proceed to package - gets ALL selected photos across all folders
  const handleProceedToPackage = () => {
    const selectedPhotos = allPhotos.filter(p => selectedIds.has(p.id));
    const selectedPhotoIds = Array.from(selectedIds);
    onProceedToPackage(selectedPhotoIds, selectedPhotos);
  };

  if (!isOpen) return null;

  // Handle empty state
  if (allPhotos.length === 0) {
    return (
      <div ref={galleryContainerRef} className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <div className="text-center">
          <p className="text-white/60 text-lg mb-4">No photos available</p>
          <button onClick={onClose} className="text-white/80 hover:text-white">Close</button>
        </div>
      </div>
    );
  }

  const currentPhoto = photos[currentIndex] || photos[0];
  const previousPhoto = previousIndex !== null ? photos[previousIndex] : null;
  const isCurrentSelected = currentPhoto ? selectedIds.has(currentPhoto.id) : false;

  return (
    <div ref={galleryContainerRef} className="fixed inset-0 z-50 bg-black">
      {/* Header */}
      <div className={`absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/80 to-transparent p-4 transition-all duration-300 ${
        isImmersive ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}>
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center space-x-4">
            <h2 className="text-white text-xl font-light tracking-wide">{leadName}</h2>
            <span className="text-white/40 text-sm font-light">
              {currentIndex + 1} / {photos.length}
            </span>
            {isLoadingPhotos && (
              <FiLoader className="w-4 h-4 text-white/40 animate-spin" />
            )}
          </div>

          <div className="flex items-center space-x-3">
            {/* Select All button */}
            <button
              onClick={handleSelectAll}
              className="text-white/60 hover:text-white px-3 py-2 transition-colors text-sm font-light tracking-wide"
            >
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>

            {/* Image limit indicator */}
            {selectionMode && imageLimit !== null && (
              <span className={`text-sm font-light tracking-wide px-3 py-1 ${
                atLimit ? 'text-white bg-white/10' : 'text-white/40'
              }`}>
                {selectedIds.size}/{imageLimit}
              </span>
            )}

            {/* Selection counter */}
            {(!selectionMode || imageLimit === null) && selectedIds.size > 0 && (
              <span className="text-white/60 text-sm font-light">
                {selectedIds.size} selected
              </span>
            )}

            {/* Play/Pause */}
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="text-white/40 hover:text-white p-2 transition-colors"
            >
              {isPlaying ? <FiPause className="w-5 h-5" /> : <FiPlay className="w-5 h-5" />}
            </button>

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="text-white/40 hover:text-white p-2 transition-colors"
            >
              {isFullscreen ? <FiMinimize className="w-5 h-5" /> : <FiMaximize className="w-5 h-5" />}
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="text-white/40 hover:text-white p-2 transition-colors"
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Left Folder Navigation - Elegant Overlay */}
      <div className={`absolute left-0 top-1/2 -translate-y-1/2 z-20 transition-all duration-500 ${
        isImmersive ? 'opacity-0 pointer-events-none -translate-x-full' : 'opacity-100'
      }`}>
        <nav className="py-4 pl-6 pr-12">
          {PHOTO_FOLDERS.map((folder) => {
            const count = folderCounts[folder.id] || 0;
            const isActive = activeFolder === folder.id;
            // Only show folders that have photos (except "All")
            if (folder.id !== 'all' && count === 0) return null;

            return (
              <button
                key={folder.id}
                onClick={() => setActiveFolder(folder.id)}
                className={`block w-full text-left py-2.5 transition-all duration-300 group ${
                  isActive ? 'pl-4 border-l border-white' : 'pl-4 border-l border-transparent hover:border-white/30'
                }`}
              >
                <span className={`text-sm tracking-wider transition-all duration-300 ${
                  isActive
                    ? 'text-white font-normal'
                    : 'text-white/30 group-hover:text-white/70 font-light'
                }`}>
                  {folder.label}
                </span>
                {count > 0 && (
                  <span className={`ml-2 text-xs transition-all duration-300 ${
                    isActive ? 'text-white/50' : 'text-white/20'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Main Image Container */}
      <div className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${
        isImmersive ? 'px-4 py-4' : 'px-20 py-24'
      }`}>
        {photos.length > 0 && currentPhoto ? (
          <>
            {/* Previous image (fading out) */}
            {previousPhoto && (
              <div className="slideshow-image previous">
                <img
                  src={getCloudinaryUrl(previousPhoto.cloudinary_secure_url || previousPhoto.cloudinary_url, 'large')}
                  alt=""
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            )}

            {/* Current image (fading in) */}
            <div className={`slideshow-image ${imageLoaded ? 'active' : ''}`}>
              {!imageLoaded && (
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{
                    backgroundImage: `url(${getBlurPlaceholder(currentPhoto.cloudinary_secure_url || currentPhoto.cloudinary_url)})`,
                    backgroundSize: 'contain',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                    filter: 'blur(20px)',
                    transform: 'scale(1.1)'
                  }}
                />
              )}
              <img
                src={getCloudinaryUrl(currentPhoto.cloudinary_secure_url || currentPhoto.cloudinary_url, 'large')}
                alt={currentPhoto.description || `Photo ${currentIndex + 1}`}
                className="max-w-full max-h-full object-contain relative z-10"
                onLoad={() => setImageLoaded(true)}
              />
            </div>

            {/* Selection indicator */}
            {isCurrentSelected && (
              <div className={`absolute top-28 right-24 transition-all duration-300 ${
                isImmersive ? 'opacity-0' : 'opacity-100'
              }`}>
                <div className="w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center shadow-lg animate-pulse">
                  <FiCheck className="w-6 h-6 text-white" />
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-white/40 font-light tracking-wide">No photos in this folder</p>
        )}
      </div>

      {/* Navigation Arrows */}
      {photos.length > 1 && (
        <>
          <button
            onClick={() => { goToPrevious(); setIsPlaying(false); }}
            className={`absolute top-1/2 -translate-y-1/2 z-30 text-white/20 hover:text-white p-4 transition-all hover:scale-110 ${
              isImmersive ? 'opacity-30 hover:opacity-100' : 'opacity-100'
            }`}
            style={{ left: '160px' }}
          >
            <FiChevronLeft className="w-8 h-8" />
          </button>
          <button
            onClick={() => { goToNext(); setIsPlaying(false); }}
            className={`absolute right-8 top-1/2 -translate-y-1/2 z-30 text-white/20 hover:text-white p-4 transition-all hover:scale-110 ${
              isImmersive ? 'opacity-30 hover:opacity-100' : 'opacity-100'
            }`}
          >
            <FiChevronRight className="w-8 h-8" />
          </button>
        </>
      )}

      {/* Selection Button */}
      {photos.length > 0 && currentPhoto && (
        <div className={`absolute bottom-36 left-1/2 -translate-x-1/2 z-20 transition-all duration-300 ${
          isImmersive ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}>
          <button
            onClick={() => toggleSelection(currentPhoto?.id)}
            disabled={!isCurrentSelected && atLimit}
            className={`flex items-center space-x-3 px-8 py-4 rounded-full text-lg font-semibold transition-all transform shadow-xl ${
              isCurrentSelected
                ? 'bg-purple-600 text-white hover:scale-105'
                : atLimit
                  ? 'bg-gray-400 text-white cursor-not-allowed'
                  : 'bg-white text-gray-900 hover:bg-purple-50 hover:scale-105'
            }`}
          >
            {isCurrentSelected ? (
              <>
                <FiCheck className="w-6 h-6" />
                <span>Selected</span>
              </>
            ) : atLimit ? (
              <>
                <FiImage className="w-6 h-6" />
                <span>Limit Reached</span>
              </>
            ) : (
              <>
                <FiPlus className="w-6 h-6" />
                <span>Add to Selection</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Thumbnail Strip */}
      <div className={`absolute bottom-0 left-0 right-0 z-20 transition-all duration-500 ${
        isImmersive ? 'opacity-0 pointer-events-none translate-y-full' : 'opacity-100 translate-y-0'
      }`}>
        <div className="bg-gradient-to-t from-black via-black/80 to-transparent pt-8 pb-4 px-4">
          <div
            ref={thumbnailContainerRef}
            className="flex space-x-2 overflow-x-auto scrollbar-hide px-4"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {photos.map((photo, index) => {
              const imageUrl = photo.cloudinary_secure_url || photo.cloudinary_url;
              const isCurrent = index === currentIndex;
              const isSelected = selectedIds.has(photo.id);

              return (
                <button
                  key={photo.id}
                  onClick={() => { goToPhoto(index, true); setIsPlaying(false); }}
                  className={`group/thumb relative flex-shrink-0 w-16 h-16 overflow-hidden transition-all duration-300 ${
                    isCurrent
                      ? 'ring-2 ring-white opacity-100'
                      : isSelected
                        ? 'ring-2 ring-purple-500 opacity-100'
                        : 'opacity-30 hover:opacity-60'
                  }`}
                >
                  <OptimizedImage
                    src={imageUrl}
                    alt={`${index + 1}`}
                    size="thumb"
                    className="w-full h-full object-cover"
                    useBlur={true}
                    threshold={200}
                  />
                  {isSelected && (
                    <div className="absolute top-1 right-1 bg-purple-600 rounded-full p-0.5 z-10">
                      <FiCheck className="w-3 h-3 text-white" />
                    </div>
                  )}
                  {onDeletePhoto && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePhoto(photo.id, e);
                      }}
                      className="absolute top-0 left-0 z-20 inline-flex items-center justify-center w-4 h-4 !min-w-0 !min-h-0 rounded-full bg-red-600 text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity cursor-pointer hover:bg-red-700"
                      title="Delete photo"
                    >
                      <FiTrash2 className="w-2.5 h-2.5" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Proceed Button */}
      {selectedIds.size > 0 && (
        <div className={`absolute bottom-28 right-8 z-20 transition-all duration-300 ${
          isImmersive ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}>
          <button
            onClick={handleProceedToPackage}
            className={`flex items-center space-x-3 text-white px-8 py-4 rounded-full text-lg font-semibold shadow-xl hover:shadow-2xl transition-all transform hover:scale-105 ${
              selectionMode
                ? 'bg-gradient-to-r from-green-600 to-emerald-600'
                : 'bg-gradient-to-r from-purple-600 to-indigo-600'
            }`}
          >
            {selectionMode ? (
              <>
                <FiCheck className="w-6 h-6" />
                <span>Confirm Selection ({selectedIds.size}{imageLimit ? `/${imageLimit}` : ''} photos)</span>
              </>
            ) : (
              <>
                <FiShoppingBag className="w-6 h-6" />
                <span>Select Package ({selectedIds.size} photos)</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Auto-play indicator */}
      {isPlaying && (
        <div className={`absolute bottom-28 left-8 z-20 flex items-center space-x-2 text-white/30 transition-all duration-300 ${
          isImmersive ? 'opacity-0' : 'opacity-100'
        }`}>
          <div className="w-1.5 h-1.5 bg-white/50 rounded-full animate-pulse"></div>
          <span className="text-xs font-light tracking-wider">Auto</span>
        </div>
      )}

      {/* Fullscreen exit hint */}
      {isFullscreen && (
        <div
          className="absolute top-4 right-4 z-30 text-white/20 text-xs cursor-pointer hover:text-white/60 transition-colors tracking-wider font-light"
          onClick={toggleFullscreen}
        >
          ESC to exit
        </div>
      )}
    </div>
  );
};

export default PresentationGallery;
