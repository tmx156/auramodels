-- =====================================================
-- Migration: Add Photos Table with RLS Policies
-- =====================================================
-- This migration adds:
-- 1. 'photographer' role to users table (if not already added)
-- 2. photos table for storing image metadata
-- 3. Indexes for performance
-- 4. Row Level Security (RLS) policies
-- =====================================================

-- Step 1: Update users table to allow 'photographer' role (if not already done)
-- Drop existing constraint if it exists, then add updated one
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('admin', 'booker', 'closer', 'viewer', 'photographer'));

-- Step 2: Create photos table
CREATE TABLE IF NOT EXISTS photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Image information
    cloudinary_public_id TEXT NOT NULL, -- Cloudinary public ID
    cloudinary_url TEXT NOT NULL, -- Full Cloudinary URL
    cloudinary_secure_url TEXT NOT NULL, -- HTTPS URL
    cloudinary_folder TEXT, -- Folder path in Cloudinary (e.g., "leads/lead-id/photos")
    
    -- Image metadata
    filename TEXT, -- Original filename
    file_size INTEGER, -- File size in bytes
    width INTEGER, -- Image width in pixels
    height INTEGER, -- Image height in pixels
    format TEXT, -- Image format (jpg, png, etc.)
    mime_type TEXT, -- MIME type
    
    -- Relationships
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE, -- Link to lead (optional)
    photographer_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Who uploaded it
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL, -- User who uploaded (can be different from photographer)
    
    -- Organization
    folder_path TEXT, -- Custom folder path (e.g., "portfolio/2025/january")
    tags TEXT[], -- Array of tags for organization
    description TEXT, -- Optional description
    
    -- Status
    is_primary BOOLEAN DEFAULT FALSE, -- Primary image for lead
    is_approved BOOLEAN DEFAULT FALSE, -- Approval status
    is_public BOOLEAN DEFAULT FALSE, -- Public visibility
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ -- Soft delete
);

-- Indexes for photos table
CREATE INDEX IF NOT EXISTS idx_photos_lead_id ON photos(lead_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_photos_photographer_id ON photos(photographer_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_photos_uploaded_by ON photos(uploaded_by) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_photos_folder_path ON photos(folder_path) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_photos_cloudinary_public_id ON photos(cloudinary_public_id);
CREATE INDEX IF NOT EXISTS idx_photos_is_primary ON photos(is_primary) WHERE is_primary = TRUE AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_photos_created_at ON photos(created_at DESC) WHERE deleted_at IS NULL;

-- GIN index for tags array search
CREATE INDEX IF NOT EXISTS idx_photos_tags ON photos USING GIN(tags) WHERE deleted_at IS NULL;

-- Step 3: Create function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_photos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Create trigger for auto-update
DROP TRIGGER IF EXISTS trigger_update_photos_updated_at ON photos;
CREATE TRIGGER trigger_update_photos_updated_at
    BEFORE UPDATE ON photos
    FOR EACH ROW
    EXECUTE FUNCTION update_photos_updated_at();

-- Step 5: Enable Row Level Security
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

-- Step 6: Create RLS Policies
-- Note: Application-level authentication is handled by auth middleware
-- These policies allow authenticated users access, matching the pattern used by other tables

-- Policy 1: All authenticated users can view non-deleted photos
CREATE POLICY "Photos are viewable by authenticated users" ON photos
    FOR SELECT USING (deleted_at IS NULL);

-- Policy 2: All authenticated users can insert photos
-- (Application-level auth middleware enforces photographer/admin only)
CREATE POLICY "Photos are insertable by authenticated users" ON photos
    FOR INSERT WITH CHECK (true);

-- Policy 3: All authenticated users can update photos
-- (Application-level auth middleware enforces photographer/admin only and ownership)
CREATE POLICY "Photos are updatable by authenticated users" ON photos
    FOR UPDATE USING (true);

-- Step 7: Add comments for documentation
COMMENT ON TABLE photos IS 'Stores photo metadata and Cloudinary references for CRM images';
COMMENT ON COLUMN photos.cloudinary_public_id IS 'Unique Cloudinary public ID for the image';
COMMENT ON COLUMN photos.cloudinary_folder IS 'Folder path in Cloudinary for organization';
COMMENT ON COLUMN photos.lead_id IS 'Optional link to a lead/client';
COMMENT ON COLUMN photos.photographer_id IS 'The photographer who took/owns the photo';
COMMENT ON COLUMN photos.folder_path IS 'Custom folder organization path';

