/**
 * Image Proxy Route
 * Fetches external images, compresses them, and serves optimized versions
 * Used for thumbnail previews from matchmodels.co.uk, modelhunt.co.uk, etc.
 */

const express = require('express');
const router = express.Router();
const sharp = require('sharp');
const axios = require('axios');
const crypto = require('crypto');

// Simple in-memory cache for compressed images (limited size)
const imageCache = new Map();
const MAX_CACHE_SIZE = 100; // Max cached images
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * GET /api/image-proxy
 * Query params:
 *   - url: The external image URL to fetch and compress
 *   - w: Width (default 40)
 *   - h: Height (default 40)
 *   - q: Quality 1-100 (default 35)
 */
router.get('/', async (req, res) => {
  try {
    const { url, w = 40, h = 40, q = 35 } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL parameter required' });
    }

    // Validate URL
    let imageUrl;
    try {
      imageUrl = new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }

    // Only allow specific domains for security
    const allowedDomains = [
      'matchmodels.co.uk',
      'modelhunt.co.uk',
      'example.com',
      'cloudinary.com',
      'supabase.co',
      'amazonaws.com'
    ];

    const isAllowed = allowedDomains.some(domain => imageUrl.hostname.includes(domain));
    if (!isAllowed) {
      return res.status(403).json({ error: 'Domain not allowed' });
    }

    // Create cache key
    const cacheKey = crypto.createHash('md5').update(`${url}-${w}-${h}-${q}`).digest('hex');

    // Check cache
    const cached = imageCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=86400'); // 24 hour browser cache
      res.set('X-Cache', 'HIT');
      return res.send(cached.data);
    }

    // Fetch the image
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    // Compress with sharp
    const width = Math.min(parseInt(w) || 40, 200); // Max 200px
    const height = Math.min(parseInt(h) || 40, 200);
    const quality = Math.min(Math.max(parseInt(q) || 35, 10), 100);

    const compressedBuffer = await sharp(response.data)
      .resize(width, height, {
        fit: 'cover',
        position: 'center'
      })
      .jpeg({ quality, progressive: true })
      .toBuffer();

    // Cache the result (with size limit)
    if (imageCache.size >= MAX_CACHE_SIZE) {
      // Remove oldest entry
      const firstKey = imageCache.keys().next().value;
      imageCache.delete(firstKey);
    }
    imageCache.set(cacheKey, {
      data: compressedBuffer,
      timestamp: Date.now()
    });

    // Send response
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('X-Cache', 'MISS');
    res.send(compressedBuffer);

  } catch (error) {
    console.error('Image proxy error:', error.message);
    res.status(500).json({ error: 'Failed to process image' });
  }
});

module.exports = router;
