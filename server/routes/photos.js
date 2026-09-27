/**
 * Photos API Routes
 * Handles photo uploads, management, and organization for photographers
 * Supports both AWS S3 (primary) and Cloudinary (fallback)
 *
 * OPTIMIZED FOR 100K+ PHOTOS:
 * - Cursor-based pagination (faster than offset for large datasets)
 * - Minimal field selection (only what frontend needs)
 * - In-memory caching with TTL
 * - Batch fetching support
 */

const express = require('express');
const multer = require('multer');
const { auth } = require('../middleware/auth');
const s3Service = require('../utils/s3Service');
const dbManager = require('../database-connection-manager');
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

// Simple in-memory cache for photo counts and metadata
const photoCache = {
  data: new Map(),
  ttl: 60 * 1000, // 1 minute TTL

  get(key) {
    const entry = this.data.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) {
      this.data.delete(key);
      return null;
    }
    return entry.value;
  },

  set(key, value, ttl = this.ttl) {
    this.data.set(key, {
      value,
      expires: Date.now() + ttl
    });
  },

  invalidate(pattern) {
    for (const key of this.data.keys()) {
      if (key.includes(pattern)) {
        this.data.delete(key);
      }
    }
  }
};

// Minimal fields for photo list (reduces payload by ~70%)
const PHOTO_LIST_FIELDS = `
  id,
  cloudinary_url,
  cloudinary_secure_url,
  lead_id,
  photographer_id,
  folder_path,
  description,
  media_type,
  resource_type,
  is_primary,
  created_at
`;

// Full fields for single photo view
const PHOTO_DETAIL_FIELDS = `
  *,
  leads(id, name, phone)
`;

// Using AWS S3 for photo storage
console.log('📦 Photo storage: AWS S3');

const router = express.Router();
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey || config.supabase.anonKey);

// Configure multer for memory storage (we'll upload directly to Cloudinary)
// Supports both images and videos for full media support
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit for videos
  },
  fileFilter: (req, file, cb) => {
    // Image types
    const imageTypes = /jpeg|jpg|png|gif|webp|heic|heif/;
    // Video types
    const videoTypes = /mp4|webm|mov|avi|mkv/;
    const videoMimeTypes = /video\/(mp4|webm|quicktime|x-msvideo|x-matroska)/;

    const ext = file.originalname.toLowerCase().split('.').pop();
    const isImage = imageTypes.test(ext) || imageTypes.test(file.mimetype);
    const isVideo = videoTypes.test(ext) || videoMimeTypes.test(file.mimetype);

    if (isImage || isVideo) {
      // Tag the file type for later use
      file.mediaType = isVideo ? 'video' : 'image';
      return cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, GIF, WebP, HEIC) and video files (MP4, WEBM, MOV) are allowed'));
    }
  }
});

/**
 * @route   POST /api/photos/upload
 * @desc    Upload photo to Cloudinary and save metadata
 * @access  Private (Photographer, Admin)
 */
router.post('/upload', auth, upload.single('photo'), async (req, res) => {
  try {
    console.log('📸 UPLOAD - User:', req.user.id, 'Role:', req.user.role);
    console.log('📸 UPLOAD - Body:', req.body);

    // Check permissions
    if (!['photographer', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only photographers and admins can upload photos' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No photo file provided' });
    }

    const { leadId: rawLeadId, folderPath, description, tags, isPrimary, isPublic } = req.body;
    console.log('📸 UPLOAD - leadId:', rawLeadId, 'Type:', typeof rawLeadId);

    // Clean leadId - handle "undefined" string
    const leadId = rawLeadId && rawLeadId !== 'undefined' && rawLeadId !== 'null' && rawLeadId !== '' ? rawLeadId : null;
    console.log('📸 UPLOAD - Cleaned leadId:', leadId);

    // Validate lead exists if leadId is provided
    if (leadId) {
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('id')
        .eq('id', leadId)
        .single();

      if (leadError || !lead) {
        return res.status(404).json({ success: false, message: 'Lead not found' });
      }
    }

    // Build folder path
    let folder = 'crm/photos';
    if (leadId) {
      folder = `crm/leads/${leadId}/photos`;
    } else if (req.user.role === 'photographer') {
      folder = `crm/photographers/${req.user.id}/photos`;
    }
    if (folderPath) {
      folder = folderPath;
    }

    // Parse tags
    const photoTags = tags ? (Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim())) : [];

    // Detect media type (set by multer fileFilter)
    const mediaType = req.file.mediaType || 'image';
    const isVideo = mediaType === 'video';

    let uploadResult;
    let mediaData;

    // Upload to AWS S3
    try {
      uploadResult = await s3Service.uploadToS3(
        req.file.buffer,
        req.file.originalname,
        folder.replace(/\//g, '/'), // S3 uses forward slashes
        req.file.mimetype
      );

      mediaData = {
        cloudinary_public_id: uploadResult.key, // Use S3 key as ID
        cloudinary_url: uploadResult.url,
        cloudinary_secure_url: uploadResult.url, // S3 URLs are already HTTPS
        cloudinary_folder: folder,
        storage_provider: 's3',
        s3_bucket: uploadResult.bucket,
        s3_key: uploadResult.key,
        filename: req.file.originalname,
        file_size: req.file.buffer.length,
        width: null, // S3 doesn't provide dimensions
        height: null,
        format: req.file.originalname.split('.').pop().toLowerCase(),
        mime_type: req.file.mimetype,
        lead_id: leadId || null,
        photographer_id: req.user.role === 'photographer' ? req.user.id : null,
        uploaded_by: req.user.id,
        folder_path: folderPath || null,
        tags: photoTags,
        description: description || null,
        is_primary: isPrimary === 'true' || isPrimary === true,
        is_public: isPublic === 'true' || isPublic === true,
        resource_type: isVideo ? 'video' : 'image',
        duration: null,
        thumbnail_url: null
      };
    } catch (s3Error) {
      console.error('❌ S3 upload error:', s3Error);
      return res.status(500).json({
        message: `Failed to upload ${mediaType} to S3`,
        error: s3Error.message
      });
    }

    console.log('📸 UPLOAD - Saving to DB:', { lead_id: mediaData.lead_id, photographer_id: mediaData.photographer_id });

    const { data: photoData, error: dbError } = await supabase
      .from('photos')
      .insert(mediaData)
      .select()
      .single();

    if (dbError) {
      console.error('❌ Error saving photo metadata:', dbError);
      // Try to delete from S3 if DB save fails
      try {
        await s3Service.deleteFromS3(uploadResult.key);
      } catch (deleteErr) {
        console.error('❌ Failed to cleanup S3 file:', deleteErr);
      }
      return res.status(500).json({
        message: 'Failed to save photo metadata',
        error: dbError.message
      });
    }

    // If this is set as primary, unset other primary photos for this lead
    if (isPrimary === 'true' || isPrimary === true) {
      if (leadId) {
        await supabase
          .from('photos')
          .update({ is_primary: false })
          .eq('lead_id', leadId)
          .neq('id', photoData.id);
      }
    }

    console.log('✅ UPLOAD SUCCESS - Photo ID:', photoData.id, 'Lead ID:', photoData.lead_id);

    // Invalidate cache for this lead/photographer
    if (leadId) photoCache.invalidate(`photos:${leadId}`);
    if (req.user.id) photoCache.invalidate(`photos:all:${req.user.id}`);
    photoCache.invalidate('photos:all:all'); // Invalidate "all photos" cache

    res.json({
      success: true,
      message: `${isVideo ? 'Video' : 'Photo'} uploaded successfully`,
      photo: photoData,
      mediaType: mediaType
    });
  } catch (error) {
    console.error('❌ Photo upload error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/photos
 * @desc    Get photos with filters - OPTIMIZED for 100k+ photos
 * @access  Private
 *
 * Query params:
 * - leadId: Filter by lead
 * - photographerId: Filter by photographer
 * - limit: Number of photos (default 100, max 500)
 * - cursor: ID of last photo for cursor-based pagination
 * - fields: 'minimal' (default) or 'full'
 */
router.get('/', auth, async (req, res) => {
  try {
    const {
      leadId,
      photographerId,
      folderPath,
      tags,
      limit = 100,
      cursor,
      fields = 'minimal'
    } = req.query;

    // Validate and cap limit
    const pageLimit = Math.min(Math.max(parseInt(limit) || 100, 1), 500);

    // Validate UUIDs
    const isValidUUID = (val) => val && val !== 'undefined' && val !== 'null' && val !== '';
    const validLeadId = isValidUUID(leadId) ? leadId : null;
    const validPhotographerId = isValidUUID(photographerId) ? photographerId : null;

    // Build cache key (include folderPath to prevent wrong folder results being cached)
    const cacheKey = `photos:${validLeadId || 'all'}:${validPhotographerId || 'all'}:${folderPath || 'all'}:${cursor || 'start'}:${pageLimit}`;

    // Check cache first (for read-heavy workloads)
    const cached = photoCache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Select minimal fields by default for better performance
    const selectFields = fields === 'full' ? PHOTO_DETAIL_FIELDS : PHOTO_LIST_FIELDS;

    let query = supabase
      .from('photos')
      .select(selectFields)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(pageLimit + 1); // Fetch one extra to check if there's more

    // Cursor-based pagination (much faster than offset for large datasets)
    if (cursor) {
      query = query.lt('created_at', cursor);
    }

    // Apply filters
    if (validLeadId) {
      query = query.eq('lead_id', validLeadId);
    }
    if (validPhotographerId) {
      query = query.eq('photographer_id', validPhotographerId);
    }
    if (folderPath) {
      query = query.eq('folder_path', folderPath);
    }
    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      query = query.contains('tags', tagArray);
    }

    // Photographers can only see their own photos when browsing (not by leadId)
    if (req.user.role === 'photographer' && !validLeadId) {
      const userId = req.user.id;
      if (isValidUUID(userId)) {
        query = query.eq('photographer_id', userId);
      } else {
        return res.json({ success: true, photos: [], count: 0, hasMore: false });
      }
    }

    const { data: photos, error } = await query;

    if (error) {
      console.error('❌ Error fetching photos:', error);
      return res.status(500).json({ message: 'Failed to fetch photos', error: error.message });
    }

    // Check if there's more data
    const hasMore = photos && photos.length > pageLimit;
    const returnPhotos = hasMore ? photos.slice(0, pageLimit) : (photos || []);

    // Get next cursor
    const nextCursor = returnPhotos.length > 0
      ? returnPhotos[returnPhotos.length - 1].created_at
      : null;

    const response = {
      success: true,
      photos: returnPhotos,
      count: returnPhotos.length,
      hasMore,
      nextCursor
    };

    // Cache the response
    photoCache.set(cacheKey, response);

    res.json(response);
  } catch (error) {
    console.error('❌ Error fetching photos:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/photos/count
 * @desc    Get photo count (lightweight endpoint for UI)
 * @access  Private
 */
router.get('/count', auth, async (req, res) => {
  try {
    const { leadId, photographerId, folderPath } = req.query;

    const isValidUUID = (val) => val && val !== 'undefined' && val !== 'null' && val !== '';
    const validLeadId = isValidUUID(leadId) ? leadId : null;
    const validPhotographerId = isValidUUID(photographerId) ? photographerId : null;

    // Check cache
    const cacheKey = `count:${validLeadId || 'all'}:${validPhotographerId || 'all'}:${folderPath || 'all'}`;
    const cached = photoCache.get(cacheKey);
    if (cached !== null) {
      return res.json(cached);
    }

    let query = supabase
      .from('photos')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null);

    if (validLeadId) {
      query = query.eq('lead_id', validLeadId);
    }
    if (validPhotographerId) {
      query = query.eq('photographer_id', validPhotographerId);
    }
    if (folderPath) {
      query = query.eq('folder_path', folderPath);
    }

    // Photographers can only count their own photos when browsing
    if (req.user.role === 'photographer' && !validLeadId) {
      query = query.eq('photographer_id', req.user.id);
    }

    const { count, error } = await query;

    if (error) {
      console.error('❌ Error counting photos:', error);
      return res.status(500).json({ message: 'Failed to count photos', error: error.message });
    }

    const response = { success: true, count: count || 0 };
    photoCache.set(cacheKey, response, 5 * 60 * 1000); // Cache for 5 minutes

    res.json(response);
  } catch (error) {
    console.error('❌ Error counting photos:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/photos/:id
 * @desc    Get single photo by ID
 * @access  Private
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: photo, error } = await supabase
      .from('photos')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error || !photo) {
      return res.status(404).json({ message: 'Photo not found' });
    }

    // Check permissions
    if (req.user.role === 'photographer' && photo.photographer_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({
      success: true,
      photo
    });
  } catch (error) {
    console.error('❌ Error fetching photo:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   DELETE /api/photos/:id
 * @desc    Delete photo (soft delete)
 * @access  Private (Photographer, Admin)
 */
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    // Get photo first to check permissions
    const { data: photo, error: fetchError } = await supabase
      .from('photos')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (fetchError || !photo) {
      return res.status(404).json({ message: 'Photo not found' });
    }

    // Check permissions
    if (req.user.role === 'photographer' && photo.photographer_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'You can only delete your own photos' });
    }

    // Soft delete in database
    const { error: deleteError } = await supabase
      .from('photos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (deleteError) {
      console.error('❌ Error deleting photo:', deleteError);
      return res.status(500).json({ message: 'Failed to delete photo', error: deleteError.message });
    }

    // Optionally delete from storage (uncomment if you want hard delete)
    // if (photo.storage_provider === 's3' && photo.s3_key) {
    //   await s3Service.deleteFromS3(photo.s3_key);
    // } else if (photo.cloudinary_public_id) {
    //   await cloudinaryService.deleteImage(photo.cloudinary_public_id);
    // }

    // Invalidate cache
    if (photo.lead_id) photoCache.invalidate(`photos:${photo.lead_id}`);
    if (photo.photographer_id) photoCache.invalidate(`photos:all:${photo.photographer_id}`);
    photoCache.invalidate('photos:all:all');

    res.json({
      success: true,
      message: 'Photo deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting photo:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   PUT /api/photos/:id
 * @desc    Update photo metadata
 * @access  Private (Photographer, Admin)
 */
router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { description, tags, isPrimary, isPublic, folderPath, leadId } = req.body;

    // Get photo first to check permissions
    const { data: photo, error: fetchError } = await supabase
      .from('photos')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (fetchError || !photo) {
      return res.status(404).json({ message: 'Photo not found' });
    }

    // Check permissions
    if (req.user.role === 'photographer' && photo.photographer_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'You can only update your own photos' });
    }

    // Build update object
    const updates = {};
    if (description !== undefined) updates.description = description;
    if (tags !== undefined) {
      updates.tags = Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim());
    }
    if (isPrimary !== undefined) updates.is_primary = isPrimary === 'true' || isPrimary === true;
    if (isPublic !== undefined) updates.is_public = isPublic === 'true' || isPublic === true;
    if (folderPath !== undefined) updates.folder_path = folderPath;
    if (leadId !== undefined) {
      // Validate lead exists if leadId is provided
      if (leadId) {
        const { data: lead, error: leadError } = await supabase
          .from('leads')
          .select('id')
          .eq('id', leadId)
          .single();
        
        if (leadError || !lead) {
          return res.status(404).json({ message: 'Lead not found' });
        }
      }
      updates.lead_id = leadId || null;
    }

    // If setting as primary, unset others
    if (updates.is_primary && photo.lead_id) {
      await supabase
        .from('photos')
        .update({ is_primary: false })
        .eq('lead_id', photo.lead_id)
        .neq('id', id);
    }

    const { data: updatedPhoto, error: updateError } = await supabase
      .from('photos')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Error updating photo:', updateError);
      return res.status(500).json({ message: 'Failed to update photo', error: updateError.message });
    }

    res.json({
      success: true,
      message: 'Photo updated successfully',
      photo: updatedPhoto
    });
  } catch (error) {
    console.error('❌ Error updating photo:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
