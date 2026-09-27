-- Migration to add diary status columns for double confirm and review features
-- Run this migration to add support for:
-- 1. Double confirmed status (is_double_confirmed)
-- 2. Review scheduling (review_date, review_time)

-- Add is_double_confirmed column to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_double_confirmed INTEGER DEFAULT 0;

-- Add review_date column to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS review_date DATE;

-- Add review_time column to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS review_time VARCHAR(10);

-- Create index for faster queries on booking statuses
CREATE INDEX IF NOT EXISTS idx_leads_is_double_confirmed ON leads(is_double_confirmed);
CREATE INDEX IF NOT EXISTS idx_leads_review_date ON leads(review_date);

-- Comment: After running this migration, the Calendar component will be able to:
-- 1. Track double-confirmed appointments (is_double_confirmed = 1)
-- 2. Schedule review appointments with specific date/time
