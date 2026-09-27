import React, { useState, useEffect, useCallback } from 'react';
import { X, Check, Image, Loader, Download, ZoomIn, Grid, List } from 'lucide-react';
import { getCloudinaryUrl, getBlurPlaceholder } from '../utils/imageUtils';

/**
 * ImageGalleryModal - View and select photos for a client
 * Used during the complete sale process to select images for packages
 */
const ImageGalleryModal = ({
  isOpen,
  onClose,
  leadId,
  leadName,
  onSelectionComplete,
  maxSelection = null, // null = unlimited
  preSelectedIds = []
}) => {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set(preSelectedIds));
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [selectAll, setSelectAll] = useState(false);

  // Fetch photos for this lead
  const fetchPhotos = useCallback(async () => {
    if (!leadId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/photos?leadId=${leadId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch photos');
      }

      const data = await response.json();
      setPhotos(data.photos || []);
    } catch (err) {
      console.error('Error fetching photos:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    if (isOpen && leadId) {
      // Reset selection state when modal opens with a new lead
      setSelectAll(false);
      fetchPhotos();
    }
  }, [isOpen, leadId, fetchPhotos]);

  // Initialize with pre-selected IDs - only when array content actually changes
  useEffect(() => {
    setSelectedIds(prev => {
      // Compare array contents, not references, to avoid infinite loops
      const prevArray = Array.from(prev).sort();
      const newArray = [...preSelectedIds].sort();
      if (prevArray.length === newArray.length &&
          prevArray.every((val, idx) => val === newArray[idx])) {
        return prev; // No change needed
      }
      return new Set(preSelectedIds);
    });
  }, [preSelectedIds]);

  // Toggle photo selection
  const toggleSelection = (photoId) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(photoId)) {
        newSet.delete(photoId);
      } else {
        // Check max selection limit
        if (maxSelection && newSet.size >= maxSelection) {
          alert(`You can only select up to ${maxSelection} images`);
          return prev;
        }
        newSet.add(photoId);
      }
      return newSet;
    });
  };

  // Select all photos
  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedIds(new Set());
    } else {
      if (maxSelection && photos.length > maxSelection) {
        // Select up to max
        const limited = photos.slice(0, maxSelection).map(p => p.id);
        setSelectedIds(new Set(limited));
      } else {
        setSelectedIds(new Set(photos.map(p => p.id)));
      }
    }
    setSelectAll(!selectAll);
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectAll(false);
  };

  // Confirm selection
  const handleConfirm = () => {
    const selectedPhotos = photos.filter(p => selectedIds.has(p.id));
    onSelectionComplete?.(selectedPhotos, Array.from(selectedIds));
    onClose();
  };

  // Handle photo preview
  const openPreview = (photo) => {
    setPreviewPhoto(photo);
  };

  const closePreview = () => {
    setPreviewPhoto(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-purple-600 to-indigo-600">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white bg-opacity-20 rounded-lg">
              <Image className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">
                {leadName ? `${leadName}'s Photos` : 'Client Photos'}
              </h2>
              <p className="text-purple-100 text-sm">
                {photos.length} photos available
                {maxSelection && ` • Select up to ${maxSelection}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white hover:bg-opacity-20 rounded-full transition-colors"
          >
            <X className="w-6 h-6 text-white" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-3 bg-gray-50 border-b">
          <div className="flex items-center space-x-4">
            <button
              onClick={handleSelectAll}
              className="flex items-center space-x-2 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <Check className={`w-4 h-4 ${selectAll ? 'text-purple-600' : ''}`} />
              <span>{selectAll ? 'Deselect All' : 'Select All'}</span>
            </button>
            <button
              onClick={clearSelection}
              disabled={selectedIds.size === 0}
              className="flex items-center space-x-2 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
            >
              <X className="w-4 h-4" />
              <span>Clear</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            {/* View mode toggle */}
            <div className="flex border rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 ${viewMode === 'grid' ? 'bg-purple-100 text-purple-600' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 ${viewMode === 'list' ? 'bg-purple-100 text-purple-600' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            {/* Selection count */}
            <div className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium">
              {selectedIds.size} selected
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader className="w-10 h-10 text-purple-600 animate-spin mb-4" />
              <p className="text-gray-500">Loading photos...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="p-4 bg-red-50 rounded-full mb-4">
                <X className="w-10 h-10 text-red-500" />
              </div>
              <p className="text-red-600 font-medium">{error}</p>
              <button
                onClick={fetchPhotos}
                className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                Retry
              </button>
            </div>
          ) : photos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="p-4 bg-gray-100 rounded-full mb-4">
                <Image className="w-10 h-10 text-gray-400" />
              </div>
              <p className="text-gray-600 font-medium">No photos available</p>
              <p className="text-gray-400 text-sm mt-1">
                Photos will appear here once the photographer uploads them
              </p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {photos.map((photo) => {
                const imageUrl = photo.cloudinary_secure_url || photo.cloudinary_url;
                const optimizedUrl = getCloudinaryUrl(imageUrl, 'small');

                return (
                  <div
                    key={photo.id}
                    className={`relative group cursor-pointer rounded-xl overflow-hidden shadow-md transition-all duration-200 ${
                      selectedIds.has(photo.id)
                        ? 'ring-4 ring-purple-500 ring-offset-2 transform scale-[0.98]'
                        : 'hover:shadow-xl hover:scale-[1.02]'
                    }`}
                    onClick={() => toggleSelection(photo.id)}
                  >
                    <div className="aspect-square bg-gray-100">
                      <img
                        src={optimizedUrl}
                        alt={photo.description || photo.filename || 'Photo'}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                        onError={(e) => { e.target.style.opacity = '0.3'; }}
                      />
                    </div>

                  {/* Selection indicator */}
                  <div
                    className={`absolute top-2 left-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                      selectedIds.has(photo.id)
                        ? 'bg-purple-600 border-purple-600'
                        : 'bg-white bg-opacity-80 border-gray-300 group-hover:border-purple-400'
                    }`}
                  >
                    {selectedIds.has(photo.id) && (
                      <Check className="w-4 h-4 text-white" />
                    )}
                  </div>

                  {/* Preview button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openPreview(photo);
                    }}
                    className="absolute top-2 right-2 p-1.5 bg-black bg-opacity-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <ZoomIn className="w-4 h-4 text-white" />
                  </button>

                  {/* Primary indicator */}
                  {photo.is_primary && (
                    <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-yellow-500 text-yellow-900 text-xs font-medium rounded">
                      Primary
                    </div>
                  )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {photos.map((photo) => {
                const imageUrl = photo.cloudinary_secure_url || photo.cloudinary_url;
                const thumbUrl = getCloudinaryUrl(imageUrl, 'thumb');

                return (
                  <div
                    key={photo.id}
                    className={`flex items-center p-3 rounded-xl cursor-pointer transition-all ${
                      selectedIds.has(photo.id)
                        ? 'bg-purple-50 border-2 border-purple-500'
                        : 'bg-gray-50 border-2 border-transparent hover:bg-gray-100'
                    }`}
                    onClick={() => toggleSelection(photo.id)}
                  >
                    {/* Checkbox */}
                    <div
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center mr-4 ${
                        selectedIds.has(photo.id)
                          ? 'bg-purple-600 border-purple-600'
                          : 'border-gray-300'
                      }`}
                    >
                      {selectedIds.has(photo.id) && (
                        <Check className="w-4 h-4 text-white" />
                      )}
                    </div>

                    {/* Thumbnail */}
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-200 mr-4 flex-shrink-0">
                      <img
                        src={thumbUrl}
                        alt={photo.description || photo.filename || 'Photo'}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                        onError={(e) => { e.target.style.opacity = '0.3'; }}
                      />
                    </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {photo.filename || 'Untitled'}
                    </p>
                    {photo.description && (
                      <p className="text-sm text-gray-500 truncate">{photo.description}</p>
                    )}
                    <p className="text-xs text-gray-400">
                      {photo.width && photo.height && `${photo.width} x ${photo.height}`}
                      {photo.format && ` • ${photo.format.toUpperCase()}`}
                    </p>
                  </div>

                    {/* Actions */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openPreview(photo);
                      }}
                      className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-100 rounded-lg transition-colors"
                    >
                      <ZoomIn className="w-5 h-5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50">
          <p className="text-sm text-gray-500">
            {selectedIds.size > 0 ? (
              <>
                <span className="font-medium text-purple-600">{selectedIds.size}</span> photos selected
                {maxSelection && ` of ${maxSelection} max`}
              </>
            ) : (
              'Click on photos to select them'
            )}
          </p>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={selectedIds.size === 0}
              className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Confirm Selection ({selectedIds.size})
            </button>
          </div>
        </div>
      </div>

      {/* Photo Preview Modal */}
      {previewPhoto && (() => {
        const previewUrl = previewPhoto.cloudinary_secure_url || previewPhoto.cloudinary_url;
        const optimizedPreviewUrl = getCloudinaryUrl(previewUrl, 'large');
        const blurPreviewUrl = getBlurPlaceholder(previewUrl);

        return (
          <div
            className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-60"
            onClick={closePreview}
          >
            <div className="relative max-w-5xl max-h-[90vh] p-4">
              <button
                onClick={closePreview}
                className="absolute top-4 right-4 p-2 bg-white bg-opacity-10 rounded-full hover:bg-opacity-20 transition-colors z-10"
              >
                <X className="w-6 h-6 text-white" />
              </button>
              {/* Blur placeholder for preview */}
              {blurPreviewUrl && (
                <div
                  className="absolute inset-4 rounded-lg"
                  style={{
                    backgroundImage: `url(${blurPreviewUrl})`,
                    backgroundSize: 'contain',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                    filter: 'blur(20px)',
                    transform: 'scale(1.05)'
                  }}
                />
              )}
              <img
                src={optimizedPreviewUrl}
                alt={previewPhoto.description || 'Preview'}
                className="max-w-full max-h-[85vh] object-contain rounded-lg relative z-10"
                onClick={(e) => e.stopPropagation()}
              />
              <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center z-10">
                <p className="text-white text-sm">
                  {previewPhoto.filename || 'Untitled'}
                  {previewPhoto.width && previewPhoto.height && ` • ${previewPhoto.width} x ${previewPhoto.height}`}
                </p>
                <a
                  href={previewUrl}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-2 px-3 py-1.5 bg-white bg-opacity-20 text-white rounded-lg hover:bg-opacity-30 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Download className="w-4 h-4" />
                  <span>Download</span>
                </a>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default ImageGalleryModal;
