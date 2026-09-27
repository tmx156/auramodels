-- Add model stats columns to leads table
-- These store physical attributes for talent/modeling agency use

ALTER TABLE leads ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS height_inches INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS waist_inches INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS hips_inches INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS eye_color VARCHAR(50);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS hair_color VARCHAR(50);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS hair_length VARCHAR(50);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_leads_date_of_birth ON leads(date_of_birth);
