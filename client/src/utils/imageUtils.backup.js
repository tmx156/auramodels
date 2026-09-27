/**
 * BACKUP - Original thumbnail optimization without proxy
 * Restore this if the proxy approach doesn't work
 */

/**
 * Apply thumbnail optimization to external URLs
 * Reduces quality to 35% (q=35) for better file size optimization
 * Resizes for thumbnails (25x25 for very small thumbnails - 50% reduction from previous 50x50)
 * Uses WebP format when browser supports it for additional 25-35% size reduction
 * @param {string} url - Original image URL
 * @returns {string} - Optimized URL
 */
const applyThumbnailOptimization_BACKUP = (url) => {
  try {
    const urlObj = new URL(url);
    const useWebP = supportsWebP();

    // Cloudinary URLs - add transformation (f_auto already handles WebP)
    if (urlObj.hostname.includes('cloudinary.com')) {
      // Insert quality and size transformation before the file path
      // Format: /image/upload/q_35,w_25,h_25,c_fill,f_auto/...
      // q_35 = 35% quality for better optimization (65% reduction from original)
      // w_25,h_25 = 25x25 pixels (50% smaller than previous 50x50)
      if (url.includes('/upload/')) {
        return url.replace('/upload/', '/upload/q_35,w_25,h_25,c_fill,f_auto/');
      }
      return url;
    }

    // Supabase Storage URLs - add transform parameter
    // Works with: tnltvfzltdeilanxhlvy.supabase.co and similar
    if (urlObj.hostname.includes('supabase.co') || urlObj.hostname.includes('supabase.in')) {
      // Supabase image transformation: width, height, quality, resize mode
      // quality=35 = 65% reduction, width/height=25 for very small thumbnails
      const separator = url.includes('?') ? '&' : '?';
      const formatParam = useWebP ? '&format=webp' : '';
      return `${url}${separator}width=25&height=25&quality=35&resize=cover${formatParam}`;
    }

    // Imgix URLs - auto=format handles WebP automatically
    if (urlObj.hostname.includes('imgix.net')) {
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}w=25&h=25&q=35&fit=crop&auto=format`;
    }

    // matchmodels.co.uk and modelhunt.co.uk - just return original (these don't support params)
    if (urlObj.hostname.includes('matchmodels.co.uk') || urlObj.hostname.includes('modelhunt.co.uk')) {
      return url; // Return original - no transformation supported
    }

    // WordPress URLs (example.com, etc.) - replace or add quality parameter
    if (urlObj.hostname.includes('example.com') || urlObj.hostname.includes('wp-content')) {
      return url; // Return original
    }

    // Generic URLs - just return original
    return url;
  } catch (e) {
    // Invalid URL, return as-is
    return url;
  }
};

// To restore: Copy the applyThumbnailOptimization_BACKUP function above
// and replace the current applyThumbnailOptimization function in imageUtils.js
