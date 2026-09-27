-- ============================================================================
-- CREATE GMAIL WATCH STATE TABLE
-- Tracks Gmail Push Notification watch status for both accounts
-- ============================================================================

-- Create table to store watch state for each Gmail account
CREATE TABLE IF NOT EXISTS gmail_watch_state (
    account_key TEXT PRIMARY KEY, -- 'primary' or 'secondary'
    email_address TEXT NOT NULL,
    history_id TEXT NOT NULL, -- For incremental sync via users.history.list()
    watch_expiration TIMESTAMPTZ, -- Gmail watches expire after 7 days
    last_notification_received TIMESTAMPTZ,
    last_sync_completed TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    error_count INTEGER DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_gmail_watch_state_active
ON gmail_watch_state(is_active);

CREATE INDEX IF NOT EXISTS idx_gmail_watch_state_expiration
ON gmail_watch_state(watch_expiration);

-- Create function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_gmail_watch_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to call the function
DROP TRIGGER IF EXISTS trigger_update_gmail_watch_state_updated_at ON gmail_watch_state;
CREATE TRIGGER trigger_update_gmail_watch_state_updated_at
    BEFORE UPDATE ON gmail_watch_state
    FOR EACH ROW
    EXECUTE FUNCTION update_gmail_watch_state_updated_at();

-- ============================================================================
-- Table Structure:
-- - account_key: 'primary' (hello@) or 'secondary' (diary@)
-- - history_id: Gmail's historyId for incremental sync (only fetch changes)
-- - watch_expiration: Auto-renew 24h before this date
-- - is_active: Enable/disable watching per account
-- - error_count: Track failures for alerting
-- ============================================================================
