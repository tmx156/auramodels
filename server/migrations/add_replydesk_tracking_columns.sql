-- Copy and paste ALL of this into Supabase SQL Editor and run
-- Adds ReplyDesk (Alex AI) tracking columns to the leads table

-- Step 1: Create helper function
CREATE OR REPLACE FUNCTION add_replydesk_column(col_name text, col_type text, col_default text DEFAULT NULL)
RETURNS void AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name=col_name) THEN
        IF col_default IS NOT NULL THEN
            EXECUTE format('ALTER TABLE leads ADD COLUMN %I %s DEFAULT %s', col_name, col_type, col_default);
        ELSE
            EXECUTE format('ALTER TABLE leads ADD COLUMN %I %s', col_name, col_type);
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Add all columns
SELECT add_replydesk_column('replydesk_sent_at', 'TIMESTAMPTZ');
SELECT add_replydesk_column('replydesk_status', 'TEXT');
SELECT add_replydesk_column('replydesk_lead_id', 'TEXT');
SELECT add_replydesk_column('replydesk_lead_code', 'TEXT');
SELECT add_replydesk_column('replydesk_last_updated', 'TIMESTAMPTZ');
SELECT add_replydesk_column('replydesk_conversation_summary', 'TEXT');
SELECT add_replydesk_column('replydesk_error', 'TEXT');

-- Step 3: Create indexes
CREATE INDEX IF NOT EXISTS idx_leads_replydesk_sent_at ON leads(replydesk_sent_at) WHERE replydesk_sent_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_replydesk_status ON leads(replydesk_status) WHERE replydesk_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_replydesk_lead_id ON leads(replydesk_lead_id) WHERE replydesk_lead_id IS NOT NULL;

-- Step 4: Clean up
DROP FUNCTION add_replydesk_column(text, text, text);
