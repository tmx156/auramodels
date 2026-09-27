/**
 * Image utility functions for optimized loading and caching
 * Optimized for 500k+ leads with efficient memory management
 *
 * Features:
 * - LRU cache with TTL
 * - LQIP (Low Quality Image Placeholder) priority queue
 * - WebP detection and format optimization
 * - Loaded images registry (survives React remounts)
 */

// WebP support detection (cached)
let webpSupported = null;
const checkWebPSupport = () => {
  if (webpSupported !== null) return Promise.resolve(webpSupported);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      webpSupported = img.width === 1;
      resolve(webpSupported);
    };
    img.onerror = () => {
      webpSupported = false;
      resolve(false);
    };
    // Tiny WebP image
    img.src = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';
  });
};

// Initialize WebP check on load
if (typeof window !== 'undefined') {
  checkWebPSupport();
}

/**
 * Check if browser supports WebP
 * @returns {boolean}
 */
export const supportsWebP = () => webpSupported === true;

/**
 * High-performance LRU Cache using Map's insertion order
 * All operations are O(1) - no array filtering needed
 */
class LRUCache {
  constructor(maxSize = 500, ttl = 10 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.cache = new Map(); // Map maintains insertion order
  }

  get(key) {
    if (!this.cache.has(key)) return null;

    const entry = this.cache.get(key);

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Move to end (most recently used) - O(1) operation
    // Delete and re-set to move to end of Map's iteration order
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  set(key, value) {
    // Delete first to update position if exists
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest (first) entry if at capacity - O(1)
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, { value, timestamp: Date.now() });
  }

  has(key) {
    if (!this.cache.has(key)) return false;

    const entry = this.cache.get(key);
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  get size() {
    return this.cache.size;
  }

  // Periodic cleanup of expired entries (call occasionally, not on every access)
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

// Production cache: 500 items, 10 min TTL
const imageCache = new LRUCache(500, 10 * 60 * 1000);

// Cleanup expired entries every 2 minutes
if (typeof window !== 'undefined') {
  setInterval(() => imageCache.cleanup(), 2 * 60 * 1000);
}

/**
 * Global registry of successfully loaded images
 * Persists across component mounts/unmounts to prevent image flashing
 * Uses a Set with max size limit for memory efficiency
 */
class LoadedImagesRegistry {
  constructor(maxSize = 2000) {
    this.maxSize = maxSize;
    this.loadedUrls = new Set();
    this.urlOrder = []; // Track insertion order for LRU eviction
  }

  add(url) {
    if (!url || this.loadedUrls.has(url)) return;

    // Evict oldest if at capacity
    if (this.loadedUrls.size >= this.maxSize) {
      const oldest = this.urlOrder.shift();
      this.loadedUrls.delete(oldest);
    }

    this.loadedUrls.add(url);
    this.urlOrder.push(url);
  }

  has(url) {
    return url && this.loadedUrls.has(url);
  }

  clear() {
    this.loadedUrls.clear();
    this.urlOrder = [];
  }

  get size() {
    return this.loadedUrls.size;
  }
}

// Global singleton - survives React component lifecycle
const loadedImagesRegistry = new LoadedImagesRegistry(2000);

/**
 * Mark an image URL as successfully loaded
 * @param {string} url - The image URL that loaded successfully
 */
export const markImageLoaded = (url) => {
  loadedImagesRegistry.add(url);
};

/**
 * Check if an image URL was previously loaded successfully
 * Used to skip fade-in animation for already-cached images
 * @param {string} url - The image URL to check
 * @returns {boolean} - True if the image was previously loaded
 */
export const wasImageLoaded = (url) => {
  return loadedImagesRegistry.has(url);
};

/**
 * Clear the loaded images registry
 */
export const clearLoadedRegistry = () => {
  loadedImagesRegistry.clear();
};

/**
 * Get optimized image URL based on size and context
 * @param {string} originalUrl - Original image URL
 * @param {string} size - Size needed ('thumbnail', 'optimized', 'original')
 * @returns {string} - Optimized URL
 */
export const getOptimizedImageUrl = (originalUrl, size = 'optimized') => {
  // Handle null, undefined, empty string, or whitespace-only strings
  if (!originalUrl || originalUrl.trim() === '' || originalUrl === 'null') {
    return null;
  }

  // For ALL external URLs (http/https), return them directly
  // This includes: matchmodels.co.uk, modelhunt.co.uk, supabase.co, etc.
  if (originalUrl.startsWith('http://') || originalUrl.startsWith('https://')) {
    return originalUrl;
  }

  // For local URLs, try to get optimized versions
  const filename = originalUrl.split('/').pop();
  if (!filename) return originalUrl;

  switch (size) {
    case 'thumbnail':
      return `/uploads/thumbnails/thumb_${filename}`;
    case 'optimized':
      return `/uploads/images/opt_${filename}`;
    case 'original':
      return originalUrl;
    default:
      return originalUrl;
  }
};

/**
 * Apply thumbnail optimization to external URLs
 * Reduces quality to 40% (q=40) for better file size optimization
 * Resizes for thumbnails (25x25 for very small thumbnails - 50% reduction from previous 50x50)
 * Uses WebP format when browser supports it for additional 25-35% size reduction
 * @param {string} url - Original image URL
 * @returns {string} - Optimized URL
 */
const applyThumbnailOptimization = (url) => {
  try {
    const urlObj = new URL(url);
    const useWebP = supportsWebP();

    // Cloudinary URLs - add transformation (f_auto already handles WebP)
    if (urlObj.hostname.includes('cloudinary.com')) {
      // Insert quality and size transformation before the file path
      // Format: /image/upload/q_40,w_25,h_25,c_fill,f_auto/...
      // q_40 = 40% quality for better optimization (60% reduction from original)
      // w_25,h_25 = 25x25 pixels (50% smaller than previous 50x50)
      if (url.includes('/upload/')) {
        return url.replace('/upload/', '/upload/q_40,w_25,h_25,c_fill,f_auto/');
      }
      return url;
    }

    // Supabase Storage URLs - add transform parameter
    // Works with: tnltvfzltdeilanxhlvy.supabase.co and similar
    if (urlObj.hostname.includes('supabase.co') || urlObj.hostname.includes('supabase.in')) {
      // Supabase image transformation: width, height, quality, resize mode
      // quality=40 = 60% reduction, width/height=25 for very small thumbnails
      const separator = url.includes('?') ? '&' : '?';
      const formatParam = useWebP ? '&format=webp' : '';
      return `${url}${separator}width=25&height=25&quality=40&resize=cover${formatParam}`;
    }

    // Imgix URLs - auto=format handles WebP automatically
    if (urlObj.hostname.includes('imgix.net')) {
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}w=25&h=25&q=40&fit=crop&auto=format`;
    }

    // matchmodels.co.uk and modelhunt.co.uk - try generic params
    if (urlObj.hostname.includes('matchmodels.co.uk') || urlObj.hostname.includes('modelhunt.co.uk')) {
      const separator = url.includes('?') ? '&' : '?';
      const formatParam = useWebP ? '&format=webp' : '';
      return `${url}${separator}w=25&h=25&q=40${formatParam}`;
    }

    // WordPress URLs (example.com, etc.) - replace or add quality parameter
    if (urlObj.hostname.includes('example.com') || urlObj.hostname.includes('wp-content')) {
      // Remove existing quality parameter if present, then add optimized one
      let optimizedUrl = url;
      if (url.includes('q=')) {
        // Replace existing quality parameter
        optimizedUrl = url.replace(/[?&]q=\d+/g, '');
      }
      if (url.includes('w=')) {
        // Replace existing width parameter
        optimizedUrl = optimizedUrl.replace(/[?&]w=\d+/g, '');
      }
      const separator = optimizedUrl.includes('?') ? '&' : '?';
      return `${optimizedUrl}${separator}w=25&q=40`;
    }

    // Generic URLs with image extensions - add size hint via query params
    // Some CDNs may support these, others will ignore them
    const imageExtensions = /\.(jpg|jpeg|png|webp|gif)(\?|$)/i;
    if (imageExtensions.test(url)) {
      // Remove existing quality parameter if present
      let optimizedUrl = url;
      if (url.includes('q=')) {
        optimizedUrl = url.replace(/[?&]q=\d+/g, '');
        // Clean up any double separators
        optimizedUrl = optimizedUrl.replace(/\?\&/g, '?').replace(/\&\&/g, '&');
      }
      const separator = optimizedUrl.includes('?') ? '&' : '?';
      return `${optimizedUrl}${separator}w=25&q=40`;
    }

    // Return original if no optimization available
    return url;
  } catch (e) {
    // Invalid URL, return as-is
    return url;
  }
};

/**
 * Preload an image with retry support
 * @param {string} src - Image source URL
 * @param {number} retries - Number of retries on failure
 * @returns {Promise} - Promise that resolves when image is loaded
 */
export const preloadImage = (src, retries = 2) => {
  return new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error('No image source provided'));
      return;
    }

    // Check cache first (LRU handles TTL automatically)
    const cached = imageCache.get(src);
    if (cached) {
      resolve(cached);
      return;
    }

    let attempts = 0;

    const tryLoad = () => {
      const img = new Image();

      img.onload = () => {
        imageCache.set(src, img);
        resolve(img);
      };

      img.onerror = () => {
        attempts++;
        if (attempts <= retries) {
          // Retry with exponential backoff
          setTimeout(tryLoad, Math.pow(2, attempts) * 100);
        } else {
          reject(new Error(`Failed to load image after ${attempts} attempts: ${src}`));
        }
      };

      // Use decode() for smoother loading on modern browsers
      img.src = src;
      if (img.decode) {
        img.decode().catch(() => {}); // Ignore decode errors
      }
    };

    tryLoad();
  });
};

/**
 * Preload multiple images
 * @param {string[]} urls - Array of image URLs
 * @returns {Promise} - Promise that resolves when all images are loaded
 */
export const preloadImages = async (urls) => {
  const validUrls = urls.filter(url => url && url !== '');
  if (validUrls.length === 0) return [];

  try {
    const results = await Promise.allSettled(
      validUrls.map(url => preloadImage(url))
    );
    
    return results
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value);
  } catch (error) {
    console.warn('Some images failed to preload:', error);
    return [];
  }
};

/**
 * Get image dimensions from URL
 * @param {string} src - Image source URL
 * @returns {Promise<{width: number, height: number}>} - Image dimensions
 */
export const getImageDimensions = (src) => {
  return new Promise((resolve, reject) => {
    if (!src) {
      reject(new Error('No image source provided'));
      return;
    }

    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight
      });
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
};

/**
 * Check if an image URL is valid and accessible
 * @param {string} src - Image source URL
 * @returns {Promise<boolean>} - True if image is accessible
 */
export const isImageAccessible = async (src) => {
  try {
    await preloadImage(src);
    return true;
  } catch {
    return false;
  }
};

/**
 * Check if an image is cached and not expired
 * @param {string} src - Image source URL
 * @returns {boolean} - Whether image is cached and valid
 */
export const isImageCached = (src) => {
  return imageCache.has(src); // LRU cache handles TTL automatically
};

/**
 * Get cache statistics for debugging
 * @returns {object} - Cache statistics
 */
export const getCacheStats = () => {
  return {
    size: imageCache.size,
    maxSize: imageCache.maxSize,
    ttl: imageCache.ttl,
  };
};

/**
 * Clear the image cache (useful for memory pressure situations)
 */
export const clearImageCache = () => {
  imageCache.clear();
};

/**
 * LQIP (Low Quality Image Placeholder) Priority Queue
 * Prioritizes loading visible images first - used by Instagram/Facebook
 */
class ImageLoadQueue {
  constructor(concurrency = 4) {
    this.concurrency = concurrency;
    this.queue = [];
    this.activeCount = 0;
  }

  /**
   * Add an image to the load queue with priority
   * @param {string} url - Image URL to load
   * @param {number} priority - Lower number = higher priority (0 = highest)
   * @returns {Promise} - Resolves when image is loaded
   */
  add(url, priority = 5) {
    return new Promise((resolve, reject) => {
      this.queue.push({ url, priority, resolve, reject });
      // Sort by priority (lower = higher priority)
      this.queue.sort((a, b) => a.priority - b.priority);
      this.process();
    });
  }

  process() {
    while (this.activeCount < this.concurrency && this.queue.length > 0) {
      const { url, resolve, reject } = this.queue.shift();
      this.activeCount++;

      const img = new Image();
      img.onload = () => {
        this.activeCount--;
        markImageLoaded(url);
        resolve(img);
        this.process();
      };
      img.onerror = (err) => {
        this.activeCount--;
        reject(err);
        this.process();
      };
      img.src = url;
    }
  }

  /**
   * Clear pending items from the queue
   * Useful when navigating away from a page
   */
  clear() {
    this.queue = [];
  }
}

// Global image load queue - limits concurrent image loads
const imageLoadQueue = new ImageLoadQueue(6);

/**
 * Load an image with priority (LQIP technique)
 * @param {string} url - Image URL
 * @param {number} priority - 0 = visible/critical, 5 = normal, 10 = low priority
 * @returns {Promise} - Resolves when loaded
 */
export const loadImageWithPriority = (url, priority = 5) => {
  if (!url) return Promise.reject(new Error('No URL provided'));

  // Check if already loaded
  if (wasImageLoaded(url)) {
    return Promise.resolve();
  }

  return imageLoadQueue.add(url, priority);
};

/**
 * Clear the image load queue (call when navigating away)
 */
export const clearImageQueue = () => {
  imageLoadQueue.clear();
};

/**
 * Get Cloudinary optimized URL for photo galleries
 * Pinterest/Instagram-style progressive loading
 * @param {string} url - Original Cloudinary URL
 * @param {string} size - 'thumb' | 'small' | 'medium' | 'large' | 'full'
 * @returns {string} - Optimized URL
 */
export const getCloudinaryUrl = (url, size = 'medium') => {
  if (!url || !url.includes('cloudinary.com')) return url;

  // Size configurations (width, height, quality)
  const sizes = {
    thumb: { w: 100, h: 100, q: 40 },      // Tiny thumbnails (reduced from 60 to 40 for better optimization)
    small: { w: 200, h: 200, q: 50 },      // Grid thumbnails (reduced from 70 to 50)
    medium: { w: 400, h: 400, q: 70 },     // Gallery view (reduced from 80 to 70)
    large: { w: 800, h: 800, q: 80 },      // Detail view (reduced from 85 to 80)
    full: { w: 1600, h: 1600, q: 85 },     // Full screen (reduced from 90 to 85)
    blur: { w: 20, h: 20, q: 20 }          // Blur placeholder (LQIP) - reduced from 30 to 20
  };

  const config = sizes[size] || sizes.medium;

  // Transform Cloudinary URL
  if (url.includes('/upload/')) {
    // c_limit preserves aspect ratio, f_auto serves WebP/AVIF
    const transforms = `w_${config.w},h_${config.h},c_limit,q_${config.q},f_auto`;
    return url.replace('/upload/', `/upload/${transforms}/`);
  }

  return url;
};

/**
 * Get blur placeholder URL for progressive loading
 * @param {string} url - Original Cloudinary URL
 * @returns {string} - Tiny blur placeholder URL
 */
export const getBlurPlaceholder = (url) => {
  if (!url || !url.includes('cloudinary.com')) return null;

  if (url.includes('/upload/')) {
    // 20x20 extremely low quality for blur effect
    return url.replace('/upload/', '/upload/w_20,h_20,q_10,e_blur:500,f_auto/');
  }
  return null;
};

/**
 * Srcset generator for responsive images
 * @param {string} url - Original Cloudinary URL
 * @returns {string} - srcset string for img element
 */
export const getResponsiveSrcset = (url) => {
  if (!url || !url.includes('cloudinary.com')) return '';

  const widths = [200, 400, 800, 1200, 1600];

  return widths.map(w => {
    const transformed = url.includes('/upload/')
      ? url.replace('/upload/', `/upload/w_${w},c_limit,q_auto,f_auto/`)
      : url;
    return `${transformed} ${w}w`;
  }).join(', ');
};

/**
 * Generate a fallback image URL with initials
 * @param {string} name - Name to generate initials from
 * @param {string} size - Size of the image (e.g., '40x40', '200x200')
 * @returns {string} - Data URL for fallback image
 */
export const generateFallbackImage = (name, size = '40x40') => {
  const initials = name ? name.charAt(0).toUpperCase() : '?';
  const [width, height] = size.split('x').map(Number);
  
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  
  // Create gradient background
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#e5e7eb');
  gradient.addColorStop(1, '#d1d5db');
  
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  
  // Add text
  ctx.fillStyle = '#6b7280';
  ctx.font = `bold ${Math.min(width, height) * 0.4}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials, width / 2, height / 2);
  
  return canvas.toDataURL();
};
