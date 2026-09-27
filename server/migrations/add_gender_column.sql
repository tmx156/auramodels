-- Migration: Add dedicated gender column to leads table
-- This improves performance and makes filtering/searching easier

-- Step 1: Add the gender column with CHECK constraint
ALTER TABLE leads ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('Female', 'Male') OR gender IS NULL);

-- Step 2: Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_leads_gender ON leads(gender) WHERE deleted_at IS NULL;

-- Step 3: Migrate existing data from custom_fields to new column
UPDATE leads
SET gender = (custom_fields->>'Gender')
WHERE custom_fields IS NOT NULL
  AND custom_fields->>'Gender' IS NOT NULL
  AND gender IS NULL;

-- Step 4: Report migration results
DO $$
DECLARE
  migrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO migrated_count
  FROM leads
  WHERE gender IS NOT NULL;

  RAISE NOTICE '✅ Migration complete: % leads now have gender column populated', migrated_count;
END $$;

-- Step 5: Add comment explaining the column
COMMENT ON COLUMN leads.gender IS 'Gender: Female or Male';

