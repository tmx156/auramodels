-- Add S3 storage columns to photos table
-- Run this in Supabase SQL Editor

-- Add new columns for S3 storage support
ALTER TABLE photos ADD COLUMN IF NOT EXISTS storage_provider TEXT DEFAULT 'cloudinary';
ALTER TABLE photos ADD COLUMN IF NOT EXISTS s3_bucket TEXT;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS s3_key TEXT;

-- Add index for S3 lookups
CREATE INDEX IF NOT EXISTS idx_photos_s3_key ON photos(s3_key) WHERE s3_key IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN photos.storage_provider IS 'Storage provider: s3 or cloudinary';
COMMENT ON COLUMN photos.s3_bucket IS 'S3 bucket name for S3-stored photos';
COMMENT ON COLUMN photos.s3_key IS 'S3 object key for S3-stored photos';
