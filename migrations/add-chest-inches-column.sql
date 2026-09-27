-- Add chest_inches column to leads table for model stats
ALTER TABLE leads ADD COLUMN IF NOT EXISTS chest_inches INTEGER;
