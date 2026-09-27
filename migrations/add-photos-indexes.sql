-- ============================================
-- Photos Table Indexes for 100k+ Photos Performance
-- Run this in Supabase SQL Editor
-- ============================================

-- Index on lead_id (most common filter)
CREATE INDEX IF NOT EXISTS idx_photos_lead_id ON photos(lead_id)
WHERE deleted_at IS NULL;

-- Index on photographer_id (for photographer dashboard)
CREATE INDEX IF NOT EXISTS idx_photos_photographer_id ON photos(photographer_id)
WHERE deleted_at IS NULL;

-- Composite index for common query pattern (lead + created_at for pagination)
CREATE INDEX IF NOT EXISTS idx_photos_lead_created ON photos(lead_id, created_at DESC)
WHERE deleted_at IS NULL;

-- Composite index for photographer query pattern
CREATE INDEX IF NOT EXISTS idx_photos_photographer_created ON photos(photographer_id, created_at DESC)
WHERE deleted_at IS NULL;

-- Index on created_at for cursor-based pagination
CREATE INDEX IF NOT EXISTS idx_photos_created_at ON photos(created_at DESC)
WHERE deleted_at IS NULL;

-- Index on folder_path for folder filtering
CREATE INDEX IF NOT EXISTS idx_photos_folder_path ON photos(folder_path)
WHERE deleted_at IS NULL AND folder_path IS NOT NULL;

-- Partial index on is_primary for quick primary photo lookups
CREATE INDEX IF NOT EXISTS idx_photos_primary ON photos(lead_id)
WHERE is_primary = true AND deleted_at IS NULL;

-- GIN index for tags array search (if you use tag filtering)
CREATE INDEX IF NOT EXISTS idx_photos_tags ON photos USING GIN(tags)
WHERE deleted_at IS NULL;

-- ============================================
-- Verify indexes were created
-- ============================================
-- Run this to see all indexes on the photos table:
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'photos';

-- ============================================
-- Analyze table after creating indexes
-- This updates statistics for the query planner
-- ============================================
ANALYZE photos;
