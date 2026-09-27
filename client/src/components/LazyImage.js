import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';
import { markImageLoaded, wasImageLoaded } from '../utils/imageUtils';

/**
 * LazyImage - Production-ready image component with GIF/Video support
 *
 * Features:
 * - Instagram-style blur placeholder (LQIP technique)
 * - Detects and handles images, GIFs, and videos
 * - Retry logic with exponential backoff
 * - Smooth blur-to-clear transition on load
 * - Race condition prevention using load counter
 * - Fallback image support
 * - Persistent loaded registry to prevent flash on remount
 */

// Detect media type from URL
const getMediaType = (url) => {
  if (!url) return 'image';
  const lower = url.toLowerCase();

  // Video formats
  if (lower.includes('.mp4') || lower.includes('.webm') || lower.includes('.mov') ||
      lower.includes('.avi') || lower.includes('.mkv') || lower.includes('video/')) {
    return 'video';
  }

  // GIF
  if (lower.includes('.gif')) {
    return 'gif';
  }

  // HEIC/HEIF - Apple format, not supported in browsers
  if (lower.includes('.heic') || lower.includes('.heif')) {
    return 'heic';
  }

  // PDF - not an image
  if (lower.includes('.pdf')) {
    return 'pdf';
  }

  // SVG
  if (lower.includes('.svg')) {
    return 'svg';
  }

  // Check if URL looks like a webpage (not an image file)
  if (lower.match(/^https?:\/\/[^\/]+\/?$/) || // Just a domain
      (lower.startsWith('http') && !lower.match(/\.(jpg|jpeg|png|gif|webp|bmp|ico|tiff?|avif)/))) {
    // URL with no image extension - might be a webpage or dynamic image
    // We'll try to load it as image anyway
    return 'image';
  }

  return 'image';
};

// Check if media type is unsupported and needs fallback
const isUnsupportedType = (type) => {
  return type === 'heic' || type === 'pdf';
};

/**
 * BlurPlaceholder - Instagram-style blur placeholder
 * Uses CSS gradient to create a pleasing blur effect while image loads
 */
const BlurPlaceholder = memo(({ className, style, isVisible }) => {
  if (!isVisible) return null;

  return (
    <div
      className={`absolute inset-0 ${className || ''}`}
      style={{
        ...style,
        background: 'linear-gradient(135deg, #e0e0e0 0%, #f5f5f5 50%, #e8e8e8 100%)',
        animation: 'shimmer 1.5s ease-in-out infinite',
        borderRadius: 'inherit',
        zIndex: 1,
      }}
    />
  );
});

BlurPlaceholder.displayName = 'BlurPlaceholder';

const LazyImage = memo(({
  src,
  alt,
  className = '',
  onClick,
  onLoad,
  onError,
  style,
  title,
  // Filter out custom props that shouldn't be passed to DOM
  fallbackClassName,
  lazy,
  preload,
  // Performance options
  enableFadeIn = true,
  // Blur placeholder option (Instagram technique)
  showBlurPlaceholder = true,
  // Video options
  videoAutoPlay = true,
  videoMuted = true,
  videoLoop = true,
  ...rest
}) => {
  // Determine if src is valid BEFORE hooks (for conditional logic later, not early return)
  const isValidSrc = src && src !== 'null' && src !== '';
  const safeSrc = isValidSrc ? src : '/images/fallback.jpeg';

  const mediaType = getMediaType(safeSrc);

  // Check if this image was previously loaded (survives remounts)
  const previouslyLoaded = isValidSrc ? wasImageLoaded(safeSrc) : true;

  // ALL HOOKS MUST BE CALLED UNCONDITIONALLY AT THE TOP
  const [currentSrc, setCurrentSrc] = useState(safeSrc);
  const [isLoaded, setIsLoaded] = useState(previouslyLoaded || !isValidSrc);
  const [hasError, setHasError] = useState(!isValidSrc);
  const [retryCount, setRetryCount] = useState(0);

  // Use a load counter to prevent race conditions
  const loadIdRef = useRef(0);
  const mediaRef = useRef(null);

  const fallbackSrc = '/images/fallback.jpeg';
  const MAX_RETRIES = 2;

  // Reset state when src changes - increment load ID to invalidate pending loads
  useEffect(() => {
    if (!isValidSrc) {
      setCurrentSrc(fallbackSrc);
      setIsLoaded(true);
      setHasError(true);
      return;
    }
    loadIdRef.current += 1;
    setCurrentSrc(src);
    // Check if new src was previously loaded
    const wasLoaded = wasImageLoaded(src);
    setIsLoaded(wasLoaded);
    setHasError(false);
    setRetryCount(0);
  }, [src, isValidSrc]);

  // Handle successful load
  const handleLoad = useCallback((e) => {
    const expectedLoadId = loadIdRef.current;

    // Use requestAnimationFrame to batch DOM updates
    requestAnimationFrame(() => {
      // Only update if this load event is for the current src
      if (loadIdRef.current === expectedLoadId) {
        setIsLoaded(true);
        setHasError(false);
        // Mark in global registry so it persists across remounts
        if (isValidSrc) markImageLoaded(src);
        if (onLoad) onLoad(e);
      }
    });
  }, [onLoad, src, isValidSrc]);

  // Handle load error with retry
  const handleError = useCallback((e) => {
    const expectedLoadId = loadIdRef.current;

    // Ignore if this error is for a stale src
    if (loadIdRef.current !== expectedLoadId) return;

    // Don't retry if already on fallback
    if (currentSrc === fallbackSrc) {
      setIsLoaded(true); // Show fallback even if it's the default
      setHasError(true);
      if (onError) onError(e);
      return;
    }

    if (retryCount < MAX_RETRIES) {
      // Exponential backoff: 500ms, 1000ms, 2000ms
      const delay = 500 * Math.pow(2, retryCount);

      setTimeout(() => {
        // Check if src is still the same before retrying
        if (loadIdRef.current === expectedLoadId) {
          setRetryCount(prev => prev + 1);
          // Add cache-busting param
          const separator = currentSrc?.includes('?') ? '&' : '?';
          setCurrentSrc(`${src}${separator}_retry=${Date.now()}`);
        }
      }, delay);
    } else {
      // Max retries exceeded - use fallback
      setCurrentSrc(fallbackSrc);
      setIsLoaded(true); // CRITICAL: Set loaded true for fallback to be visible
      setHasError(true);
      if (onError) onError(e);
    }
  }, [currentSrc, retryCount, src, onError]);

  // Build className - memoized to prevent recalculation
  const finalClassName = useMemo(() => {
    if (!enableFadeIn) return className;
    const opacityClass = (!isLoaded && !hasError) ? 'opacity-0' : 'opacity-100';
    return className ? `${className} ${opacityClass}` : opacityClass;
  }, [className, enableFadeIn, isLoaded, hasError]);

  // Build style - memoized with smooth blur-to-clear transition
  const finalStyle = useMemo(() => {
    if (!enableFadeIn) return style;
    return {
      ...style,
      transition: 'opacity 0.2s ease-out, filter 0.3s ease-out',
      filter: (!isLoaded && !hasError) ? 'blur(8px)' : 'blur(0px)',
    };
  }, [style, enableFadeIn, isLoaded, hasError]);

  // Wrapper style for positioning the blur placeholder
  const wrapperStyle = useMemo(() => ({
    position: 'relative',
    display: 'inline-block',
    overflow: 'hidden',
    ...style,
  }), [style]);

  // Render fallback for unsupported types (HEIC, PDF)
  if (isUnsupportedType(mediaType)) {
    return (
      <div
        className={`${className} flex items-center justify-center bg-gray-100 border border-gray-200`}
        style={style}
        onClick={onClick}
        title={mediaType === 'heic' ? 'HEIC format not supported in browsers' : 'PDF file'}
      >
        <div className="text-center p-1">
          <span className="text-gray-400 text-xs">
            {mediaType === 'heic' ? '📷' : '📄'}
          </span>
        </div>
      </div>
    );
  }

  // For small thumbnails (like in list), don't use wrapper to save DOM nodes
  const isSmallThumbnail = className?.includes('w-6') || className?.includes('w-8') || className?.includes('w-10');

  // Render video for MP4/WebM files
  if (mediaType === 'video') {
    return (
      <video
        ref={mediaRef}
        src={currentSrc}
        className={finalClassName}
        style={finalStyle}
        autoPlay={videoAutoPlay}
        muted={videoMuted}
        loop={videoLoop}
        playsInline
        preload={lazy === false ? 'auto' : 'metadata'}
        onClick={onClick}
        onLoadedData={handleLoad}
        onError={handleError}
        title={title || alt}
        {...rest}
      />
    );
  }

  // Simple render for small thumbnails (performance optimization)
  if (isSmallThumbnail || !showBlurPlaceholder) {
    return (
      <img
        ref={mediaRef}
        src={currentSrc}
        alt={alt || 'Image'}
        className={finalClassName}
        style={finalStyle}
        loading={lazy === false ? 'eager' : 'lazy'}
        decoding="async"
        onLoad={handleLoad}
        onError={handleError}
        onClick={onClick}
        title={title}
        {...rest}
      />
    );
  }

  // Full render with blur placeholder for larger images (Instagram technique)
  return (
    <div style={wrapperStyle} className={className} onClick={onClick}>
      {/* Blur placeholder - shows shimmer animation while loading */}
      <BlurPlaceholder
        isVisible={!isLoaded && !hasError && showBlurPlaceholder}
      />

      {/* Actual image - fades in smoothly over placeholder */}
      <img
        ref={mediaRef}
        src={currentSrc}
        alt={alt || 'Image'}
        className="w-full h-full object-cover"
        style={{
          transition: 'opacity 0.3s ease-out',
          opacity: isLoaded ? 1 : 0,
          position: 'relative',
          zIndex: 2,
        }}
        loading={lazy === false ? 'eager' : 'lazy'}
        decoding="async"
        onLoad={handleLoad}
        onError={handleError}
        title={title}
        {...rest}
      />
    </div>
  );
});

LazyImage.displayName = 'LazyImage';

export default LazyImage;
