-- =====================================================
-- Migration: Fix "Wants Email" Status Mismatch
-- =====================================================
-- Purpose: Convert all "Wants Email" statuses to "Wrong number"
--          and update database constraints
-- Date: 2025-01-XX
-- =====================================================

-- Step 1: Drop the old CHECK constraint FIRST (before updating data)
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;

-- Step 2: Update all leads with "Wants Email" status to "Wrong number"
UPDATE leads
SET 
  status = 'Wrong number',
  updated_at = NOW()
WHERE status = 'Wants Email';

-- Step 3: Also update any leads that might have "Wants Email" in custom_fields
-- (if call_status was stored there)
UPDATE leads
SET 
  custom_fields = jsonb_set(
    COALESCE(custom_fields, '{}'::jsonb),
    '{call_status}',
    '"Wrong number"'
  ),
  updated_at = NOW()
WHERE custom_fields->>'call_status' = 'Wants Email';

-- Step 4: Add new CHECK constraint without "Wants Email" (now includes "Wrong number")
ALTER TABLE leads ADD CONSTRAINT leads_status_check CHECK (
  status IN (
    'New', 'Assigned', 'Contacted', 'Booked', 'Confirmed', 
    'Attended', 'Cancelled', 'No Answer', 'No answer', 
    'Not Interested', 'Not interested', 
    'Sale', 'Sales/converted - purchased',
    'Rejected', 'Call Back', 'Call back', 
    'Left Message', 'Not Qualified',
    'Reschedule', 'No Show', 'Wrong number'
  )
);

-- Step 5: Report the changes
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO updated_count
  FROM leads
  WHERE status = 'Wrong number' AND updated_at > NOW() - INTERVAL '1 minute';
  
  RAISE NOTICE '✅ Migration complete: Updated % leads from "Wants Email" to "Wrong number"', updated_count;
END $$;

