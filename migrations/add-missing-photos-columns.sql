-- =====================================================
-- Migration: Add Missing Columns to Photos Table
-- =====================================================
-- This migration adds columns that the application code expects
-- but were missing from the initial photos table creation
-- =====================================================

-- Add missing columns to photos table (if they don't exist)
-- These columns are used by the photos API routes

-- Storage provider (s3 or cloudinary)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'photos' AND column_name = 'storage_provider') THEN
        ALTER TABLE photos ADD COLUMN storage_provider TEXT;
    END IF;
END $$;

-- S3 bucket name (for S3 storage)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'photos' AND column_name = 's3_bucket') THEN
        ALTER TABLE photos ADD COLUMN s3_bucket TEXT;
    END IF;
END $$;

-- S3 object key (for S3 storage)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'photos' AND column_name = 's3_key') THEN
        ALTER TABLE photos ADD COLUMN s3_key TEXT;
    END IF;
END $$;

-- Resource type (image or video)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'photos' AND column_name = 'resource_type') THEN
        ALTER TABLE photos ADD COLUMN resource_type TEXT DEFAULT 'image';
    END IF;
END $$;

-- Video duration in seconds (for videos)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'photos' AND column_name = 'duration') THEN
        ALTER TABLE photos ADD COLUMN duration NUMERIC;
    END IF;
END $$;

-- Thumbnail URL (for videos)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'photos' AND column_name = 'thumbnail_url') THEN
        ALTER TABLE photos ADD COLUMN thumbnail_url TEXT;
    END IF;
END $$;

-- Media type (alias/computed field - can be derived from resource_type)
-- This might be used in queries but not stored, so we'll add it as nullable
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'photos' AND column_name = 'media_type') THEN
        ALTER TABLE photos ADD COLUMN media_type TEXT;
    END IF;
END $$;

-- Add index for storage_provider if needed
CREATE INDEX IF NOT EXISTS idx_photos_storage_provider ON photos(storage_provider) WHERE deleted_at IS NULL;

-- Add index for resource_type if needed
CREATE INDEX IF NOT EXISTS idx_photos_resource_type ON photos(resource_type) WHERE deleted_at IS NULL;

-- Update existing rows to have default resource_type if null
UPDATE photos SET resource_type = 'image' WHERE resource_type IS NULL;

COMMENT ON COLUMN photos.storage_provider IS 'Storage provider: s3 or cloudinary';
COMMENT ON COLUMN photos.s3_bucket IS 'AWS S3 bucket name (if using S3)';
COMMENT ON COLUMN photos.s3_key IS 'AWS S3 object key (if using S3)';
COMMENT ON COLUMN photos.resource_type IS 'Resource type: image or video';
COMMENT ON COLUMN photos.duration IS 'Video duration in seconds (for videos)';
COMMENT ON COLUMN photos.thumbnail_url IS 'Thumbnail URL for videos';
COMMENT ON COLUMN photos.media_type IS 'Media type: image or video (can be derived from resource_type)';

