-- ============================================================================
-- ENABLE GMAIL MESSAGE DEDUPLICATION
-- Adds unique constraint to prevent duplicate Gmail messages in database
-- ============================================================================

-- Step 1: Clean existing duplicates (keep oldest entry per gmail_message_id + lead_id)
DELETE FROM messages a
USING messages b
WHERE a.gmail_message_id = b.gmail_message_id
  AND a.lead_id = b.lead_id
  AND a.gmail_message_id IS NOT NULL
  AND a.created_at > b.created_at;

-- Step 2: Add unique constraint to prevent future duplicates
ALTER TABLE messages
ADD CONSTRAINT unique_gmail_message_per_lead
UNIQUE (gmail_message_id, lead_id);

-- ============================================================================
-- Why this is important:
-- - Prevents duplicate email entries when Pub/Sub sends multiple notifications
-- - Ensures database integrity even if webhook is called multiple times
-- - Atomic database operations prevent race conditions
-- ============================================================================
