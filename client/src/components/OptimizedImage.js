import React, { useState, memo } from 'react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';
import { getCloudinaryUrl, getBlurPlaceholder, markImageLoaded, wasImageLoaded } from '../utils/imageUtils';

/**
 * OptimizedImage - Production-ready lazy loading image component
 * Uses react-lazy-load-image-component (1.5M+ weekly downloads)
 *
 * Features:
 * - Automatic Cloudinary optimization
 * - Blur-up effect (like Medium/Pinterest)
 * - Intersection Observer based lazy loading
 * - Error handling with fallback
 * - Memory efficient (won't load until visible)
 */
const OptimizedImage = memo(({
  src,
  alt = '',
  size = 'medium', // 'thumb' | 'small' | 'medium' | 'large' | 'full'
  className = '',
  wrapperClassName = '',
  style = {},
  onClick,
  threshold = 100, // Pixels before viewport to start loading
  useBlur = true,
  fallback = null,
  onLoad,
  onError,
  fallbackSrc, // Destructure to prevent passing to DOM
  ...props
}) => {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(() => wasImageLoaded(src));

  // Get optimized URLs
  const imageUrl = src ? getCloudinaryUrl(src, size) : null;
  const placeholderUrl = useBlur && src ? getBlurPlaceholder(src) : undefined;

  const handleLoad = () => {
    setIsLoaded(true);
    if (imageUrl) markImageLoaded(imageUrl);
    onLoad?.();
  };

  const handleError = (e) => {
    setHasError(true);
    // Forward the event to the parent's onError handler if provided
    if (onError) {
      onError(e);
    }
  };

  // Show fallback if error or no source
  if (hasError || !imageUrl) {
    if (fallback) return fallback;
    return (
      <div
        className={`bg-gray-200 flex items-center justify-center ${className}`}
        style={style}
      >
        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    );
  }

  return (
    <LazyLoadImage
      src={imageUrl}
      alt={alt}
      effect={useBlur ? "blur" : undefined}
      placeholderSrc={placeholderUrl}
      threshold={threshold}
      className={className}
      wrapperClassName={wrapperClassName}
      style={style}
      onClick={onClick}
      afterLoad={handleLoad}
      onError={handleError}
      {...props}
    />
  );
});

OptimizedImage.displayName = 'OptimizedImage';

export default OptimizedImage;

/**
 * OptimizedThumbnail - Pre-configured for thumbnail grids
 */
export const OptimizedThumbnail = memo(({ src, alt, onClick, selected, className = '', ...props }) => {
  return (
    <div
      className={`relative overflow-hidden bg-gray-100 cursor-pointer ${selected ? 'ring-2 ring-purple-500' : ''} ${className}`}
      onClick={onClick}
    >
      <OptimizedImage
        src={src}
        alt={alt}
        size="thumb"
        className="w-full h-full object-cover"
        threshold={200}
        {...props}
      />
      {selected && (
        <div className="absolute top-1 right-1 w-5 h-5 bg-purple-600 rounded-full flex items-center justify-center">
          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </div>
      )}
    </div>
  );
});

OptimizedThumbnail.displayName = 'OptimizedThumbnail';

/**
 * OptimizedGalleryImage - For larger gallery views
 */
export const OptimizedGalleryImage = memo(({ src, alt, onClick, className = '', ...props }) => {
  return (
    <OptimizedImage
      src={src}
      alt={alt}
      size="medium"
      className={`w-full h-full object-cover ${className}`}
      threshold={300}
      onClick={onClick}
      {...props}
    />
  );
});

OptimizedGalleryImage.displayName = 'OptimizedGalleryImage';
