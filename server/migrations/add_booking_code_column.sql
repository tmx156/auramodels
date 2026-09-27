-- Migration: Add booking_code column to leads table
-- This column stores a short, URL-friendly booking code for public booking links
-- Example: TAN2026, BOOK7X4K, etc.

-- Add the booking_code column
ALTER TABLE leads ADD COLUMN IF NOT EXISTS booking_code VARCHAR(20) UNIQUE;

-- Create an index for fast lookups by booking_code
CREATE INDEX IF NOT EXISTS idx_leads_booking_code ON leads(booking_code);

-- Verify the column was added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'leads' AND column_name = 'booking_code';

