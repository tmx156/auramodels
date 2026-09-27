import React, { useCallback, memo } from 'react';
import { VirtuosoGrid } from 'react-virtuoso';
import { FiCheck, FiPlay, FiImage } from 'react-icons/fi';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';
import { getCloudinaryUrl, getBlurPlaceholder } from '../utils/imageUtils';

/**
 * VirtualizedPhotoGrid - Production-ready photo grid for 100k+ images
 * Uses:
 * - react-virtuoso for virtualization (only renders visible items)
 * - react-lazy-load-image-component for battle-tested lazy loading
 * - Cloudinary for image optimization
 */

// Memoized photo item for performance
const PhotoItem = memo(({
  photo,
  isSelected,
  onSelect,
  onClick,
  size = 'small'
}) => {
  const imageUrl = photo.cloudinary_secure_url || photo.cloudinary_url || photo.url;
  const optimizedUrl = getCloudinaryUrl(imageUrl, size);
  const blurUrl = getBlurPlaceholder(imageUrl);
  const isVideo = photo.media_type === 'video' || imageUrl?.includes('/video/');

  const handleClick = useCallback((e) => {
    if (onSelect) {
      e.stopPropagation();
      onSelect(photo);
    } else if (onClick) {
      onClick(photo);
    }
  }, [photo, onSelect, onClick]);

  return (
    <div
      className={`relative group cursor-pointer overflow-hidden rounded-lg bg-gray-100 transition-all duration-200 ${
        isSelected ? 'ring-4 ring-purple-500 ring-offset-2' : 'hover:ring-2 hover:ring-purple-300'
      }`}
      style={{ aspectRatio: '1' }}
      onClick={handleClick}
    >
      {/* LazyLoadImage with blur effect - battle tested library */}
      <LazyLoadImage
        src={optimizedUrl}
        alt={photo.description || 'Photo'}
        effect="blur"
        placeholderSrc={blurUrl}
        threshold={100}
        className="w-full h-full object-cover"
        wrapperClassName="w-full h-full"
      />

      {/* Video indicator */}
      {isVideo && (
        <div className="absolute bottom-2 left-2 bg-black/70 text-white px-2 py-1 rounded text-xs flex items-center gap-1 z-10">
          <FiPlay className="w-3 h-3" />
          <span>Video</span>
        </div>
      )}

      {/* Selection overlay */}
      {onSelect && (
        <div
          className={`absolute inset-0 bg-purple-600/20 transition-opacity pointer-events-none ${
            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'
          }`}
        />
      )}

      {/* Selection checkbox */}
      {onSelect && (
        <div
          className={`absolute top-2 right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all z-10 ${
            isSelected
              ? 'bg-purple-600 border-purple-600 text-white'
              : 'bg-white/80 border-gray-300 group-hover:border-purple-400'
          }`}
        >
          {isSelected && <FiCheck className="w-4 h-4" />}
        </div>
      )}

      {/* Hover effect */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
    </div>
  );
});

PhotoItem.displayName = 'PhotoItem';

/**
 * VirtualizedPhotoGrid Component
 * @param {Array} photos - Array of photo objects
 * @param {Set|Array} selectedIds - Selected photo IDs
 * @param {Function} onSelect - Called when photo is selected/deselected
 * @param {Function} onPhotoClick - Called when photo is clicked (no selection mode)
 * @param {number} columns - Number of columns (default: 4)
 * @param {string} size - Image size: 'thumb' | 'small' | 'medium'
 */
const VirtualizedPhotoGrid = ({
  photos = [],
  selectedIds = new Set(),
  onSelect,
  onPhotoClick,
  columns = 4,
  size = 'small',
  className = ''
}) => {
  // Convert array to Set if needed
  const selectedSet = selectedIds instanceof Set ? selectedIds : new Set(selectedIds);

  // Grid item renderer
  const ItemContent = useCallback((index) => {
    const photo = photos[index];
    if (!photo) return null;

    const isSelected = selectedSet.has(photo.id);

    return (
      <div className="p-1">
        <PhotoItem
          photo={photo}
          isSelected={isSelected}
          onSelect={onSelect}
          onClick={onPhotoClick}
          size={size}
        />
      </div>
    );
  }, [photos, selectedSet, onSelect, onPhotoClick, size]);

  // Grid container with responsive columns
  const gridComponents = {
    List: React.forwardRef(({ style, children, ...props }, ref) => (
      <div
        ref={ref}
        {...props}
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          ...style
        }}
      >
        {children}
      </div>
    )),
    Item: ({ children, ...props }) => (
      <div {...props}>
        {children}
      </div>
    )
  };

  if (photos.length === 0) {
    return (
      <div className={`flex items-center justify-center py-12 ${className}`}>
        <div className="text-center text-gray-500">
          <FiImage className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>No photos available</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full ${className}`}>
      <VirtuosoGrid
        totalCount={photos.length}
        components={gridComponents}
        itemContent={ItemContent}
        overscan={20}
        useWindowScroll={false}
        style={{ height: '100%' }}
      />
    </div>
  );
};

export default memo(VirtualizedPhotoGrid);
