/**
 * Migration: Add diary status columns for double confirm and review features
 *
 * Run with: node server/migrations/run_diary_status_migration.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { getSupabaseClient } = require('../config/supabase-client');

async function runMigration() {
  console.log('🚀 Starting diary status columns migration...\n');

  const supabase = getSupabaseClient();

  // Check current table structure
  console.log('📋 Checking current leads table structure...');
  const { data: sampleLead, error: sampleError } = await supabase
    .from('leads')
    .select('*')
    .limit(1)
    .single();

  if (sampleError && sampleError.code !== 'PGRST116') {
    console.error('❌ Error checking table:', sampleError);
  } else if (sampleLead) {
    const existingColumns = Object.keys(sampleLead);
    console.log('   Existing columns:', existingColumns.length);

    const hasDoubleConfirmed = existingColumns.includes('is_double_confirmed');
    const hasReviewDate = existingColumns.includes('review_date');
    const hasReviewTime = existingColumns.includes('review_time');

    console.log(`   is_double_confirmed: ${hasDoubleConfirmed ? '✅ exists' : '❌ missing'}`);
    console.log(`   review_date: ${hasReviewDate ? '✅ exists' : '❌ missing'}`);
    console.log(`   review_time: ${hasReviewTime ? '✅ exists' : '❌ missing'}`);
  }

  // Run the migration SQL using Supabase's rpc or direct SQL
  console.log('\n📝 Running migration SQL...');

  // Try to add columns - Supabase will ignore if they already exist with IF NOT EXISTS
  const migrationSQL = `
    -- Add is_double_confirmed column
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='is_double_confirmed') THEN
        ALTER TABLE leads ADD COLUMN is_double_confirmed INTEGER DEFAULT 0;
        RAISE NOTICE 'Added is_double_confirmed column';
      ELSE
        RAISE NOTICE 'is_double_confirmed column already exists';
      END IF;
    END $$;

    -- Add review_date column
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='review_date') THEN
        ALTER TABLE leads ADD COLUMN review_date DATE;
        RAISE NOTICE 'Added review_date column';
      ELSE
        RAISE NOTICE 'review_date column already exists';
      END IF;
    END $$;

    -- Add review_time column
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='leads' AND column_name='review_time') THEN
        ALTER TABLE leads ADD COLUMN review_time VARCHAR(10);
        RAISE NOTICE 'Added review_time column';
      ELSE
        RAISE NOTICE 'review_time column already exists';
      END IF;
    END $$;
  `;

  // Execute via RPC if available, otherwise we need to run in Supabase dashboard
  const { data, error } = await supabase.rpc('exec_sql', { sql: migrationSQL });

  if (error) {
    if (error.message.includes('function') && error.message.includes('does not exist')) {
      console.log('\n⚠️  Cannot run raw SQL via API. Running alternative approach...');

      // Alternative: Try to update a lead with the new fields to see if columns exist
      // If they don't exist, Supabase will return an error
      const testUpdate = await supabase
        .from('leads')
        .update({
          is_double_confirmed: 0,
          review_date: null,
          review_time: null
        })
        .eq('id', -99999) // Non-existent ID, just to test the schema
        .select();

      if (testUpdate.error && testUpdate.error.message.includes('column')) {
        console.log('\n❌ Columns do not exist yet. Please run this SQL in Supabase Dashboard:\n');
        console.log('─'.repeat(60));
        console.log(`
ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_double_confirmed INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS review_date DATE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS review_time VARCHAR(10);

-- Optional: Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_leads_is_double_confirmed ON leads(is_double_confirmed);
CREATE INDEX IF NOT EXISTS idx_leads_review_date ON leads(review_date);
`);
        console.log('─'.repeat(60));
        console.log('\n📌 Go to: Supabase Dashboard → SQL Editor → Run the above SQL');
      } else {
        console.log('\n✅ Columns appear to already exist or were added successfully!');
      }
    } else {
      console.error('❌ Migration error:', error);
    }
  } else {
    console.log('✅ Migration completed successfully!');
  }

  // Verify the migration
  console.log('\n🔍 Verifying migration...');
  const { data: verifyLead, error: verifyError } = await supabase
    .from('leads')
    .select('id, name, is_double_confirmed, review_date, review_time')
    .limit(1);

  if (verifyError) {
    if (verifyError.message.includes('column')) {
      console.log('❌ Verification failed - columns not found. Please run migration SQL manually.');
    } else {
      console.error('❌ Verification error:', verifyError);
    }
  } else {
    console.log('✅ Migration verified! New columns are accessible.');
    if (verifyLead && verifyLead.length > 0) {
      console.log('   Sample data:', JSON.stringify(verifyLead[0], null, 2));
    }
  }

  console.log('\n🏁 Migration script complete!');
}

runMigration().catch(console.error);
