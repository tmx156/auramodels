-- Add reject_reason and rejected_at columns to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS reject_reason TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
