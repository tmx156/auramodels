-- ============================================================================
-- ADD GMAIL ACCOUNT TRACKING TO MESSAGES TABLE
-- Tracks which Gmail account (primary/secondary) received each message
-- ============================================================================

-- Add column to track which account received the email
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS gmail_account_key TEXT;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_messages_gmail_account_key
ON messages(gmail_account_key);

-- Add constraint to ensure only valid account keys
ALTER TABLE messages
ADD CONSTRAINT check_gmail_account_key
CHECK (gmail_account_key IN ('primary', 'secondary') OR gmail_account_key IS NULL);

-- ============================================================================
-- Purpose:
-- - Track which Gmail account received each email
-- - Allows filtering messages by account in the UI
-- - Helps debugging if one account has issues
-- - Values: 'primary' (hello@) | 'secondary' (diary@) | NULL (legacy)
-- ============================================================================
