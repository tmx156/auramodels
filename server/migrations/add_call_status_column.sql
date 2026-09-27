-- Migration: Add dedicated call_status column to leads table
-- This fixes the "missing schema/column" errors and improves performance

-- Step 1: Add the call_status column
ALTER TABLE leads ADD COLUMN IF NOT EXISTS call_status TEXT;

-- Step 2: Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_leads_call_status ON leads(call_status) WHERE deleted_at IS NULL;

-- Step 3: Migrate existing data from custom_fields to new column
UPDATE leads
SET call_status = (custom_fields->>'call_status')
WHERE custom_fields IS NOT NULL
  AND custom_fields->>'call_status' IS NOT NULL
  AND call_status IS NULL;

-- Step 4: Report migration results
DO $$
DECLARE
  migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO migrated_count
  FROM leads
  WHERE call_status IS NOT NULL;

  RAISE NOTICE '✅ Migration complete: % leads now have call_status column populated', migrated_count;
END $$;

-- Step 5: Add comment explaining the column
COMMENT ON COLUMN leads.call_status IS 'Booker call status: No answer, Left Message, Not interested, Call back, Wrong number, Sales/converted - purchased, Not Qualified';
