-- Add lead_source and entry_date columns to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_source TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS entry_date TIMESTAMPTZ;

-- Index for filtering by lead_source
CREATE INDEX IF NOT EXISTS idx_leads_lead_source ON leads(lead_source) WHERE lead_source IS NOT NULL AND deleted_at IS NULL;
