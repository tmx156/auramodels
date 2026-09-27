-- Migration: Add video support to photos table
-- This migration adds columns to support video uploads (MP4, WEBM, etc.)
-- Run this migration in your Supabase SQL Editor

-- Add video-specific columns to photos table
ALTER TABLE photos
ADD COLUMN IF NOT EXISTS resource_type VARCHAR(20) DEFAULT 'image',
ADD COLUMN IF NOT EXISTS duration DECIMAL(10,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS thumbnail_url TEXT DEFAULT NULL;

-- Add index for filtering by resource type (images vs videos)
CREATE INDEX IF NOT EXISTS idx_photos_resource_type ON photos(resource_type);

-- Add comment for documentation
COMMENT ON COLUMN photos.resource_type IS 'Type of media: image or video';
COMMENT ON COLUMN photos.duration IS 'Duration in seconds for video files';
COMMENT ON COLUMN photos.thumbnail_url IS 'URL of video thumbnail (first frame)';

-- Verify the changes
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'photos'
AND column_name IN ('resource_type', 'duration', 'thumbnail_url');
