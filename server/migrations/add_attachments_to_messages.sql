-- Migration: Add attachments column to messages table
-- Purpose: Store email attachment metadata (URLs, filenames, sizes, etc.)
-- Run this in Supabase SQL Editor

-- Add attachments JSONB column to messages table
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN messages.attachments IS 'Array of attachment objects: [{filename, url, size, mimetype, gmail_attachment_id}]';

-- Create index for JSONB queries (optional, but can help with performance)
CREATE INDEX IF NOT EXISTS idx_messages_attachments ON messages USING GIN (attachments) WHERE attachments != '[]'::jsonb;

-- Success message
SELECT 'Migration completed: attachments field added to messages table' AS status;

