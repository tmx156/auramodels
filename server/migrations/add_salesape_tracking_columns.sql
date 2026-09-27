-- Copy and paste ALL of this into Supabase SQL Editor and run

-- Step 1: Create helper function
CREATE OR REPLACE FUNCTION add_salesape_column(col_name text, col_type text, col_default text DEFAULT NULL)
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
SELECT add_salesape_column('salesape_sent_at', 'TIMESTAMPTZ');
SELECT add_salesape_column('salesape_status', 'TEXT');
SELECT add_salesape_column('salesape_record_id', 'TEXT');
SELECT add_salesape_column('salesape_last_updated', 'TIMESTAMPTZ');
SELECT add_salesape_column('salesape_initial_message_sent', 'BOOLEAN', 'FALSE');
SELECT add_salesape_column('salesape_user_engaged', 'BOOLEAN', 'FALSE');
SELECT add_salesape_column('salesape_goal_presented', 'BOOLEAN', 'FALSE');
SELECT add_salesape_column('salesape_goal_hit', 'BOOLEAN', 'FALSE');
SELECT add_salesape_column('salesape_opted_out', 'BOOLEAN', 'FALSE');
SELECT add_salesape_column('salesape_follow_ups_ended', 'BOOLEAN', 'FALSE');
SELECT add_salesape_column('salesape_error', 'TEXT');

-- Step 3: Create indexes
CREATE INDEX IF NOT EXISTS idx_leads_salesape_sent_at ON leads(salesape_sent_at) WHERE salesape_sent_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_salesape_status ON leads(salesape_status) WHERE salesape_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_salesape_record_id ON leads(salesape_record_id) WHERE salesape_record_id IS NOT NULL;

-- Step 4: Clean up
DROP FUNCTION add_salesape_column(text, text, text);
