require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkColumn() {
  console.log('🔍 Checking if call_status column exists...\n');

  try {
    // Try to select the column
    const { data, error } = await supabase
      .from('leads')
      .select('id, call_status')
      .limit(1);

    if (error) {
      if (error.message && error.message.includes('call_status')) {
        console.log('❌ call_status column does NOT exist!');
        console.log('\n📋 You need to run this migration in Supabase SQL Editor:');
        console.log('─'.repeat(60));
        console.log(`
-- Add call_status column to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS call_status TEXT;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_leads_call_status ON leads(call_status) WHERE deleted_at IS NULL;

-- Migrate existing data from custom_fields to new column
UPDATE leads
SET call_status = (custom_fields->>'call_status')
WHERE custom_fields IS NOT NULL
  AND custom_fields->>'call_status' IS NOT NULL
  AND call_status IS NULL;
        `);
        console.log('─'.repeat(60));
        return false;
      }
      throw error;
    }

    console.log('✅ call_status column EXISTS!');
    console.log(`\n📊 Sample lead with call_status:`, data[0]);
    return true;

  } catch (error) {
    console.error('❌ Error checking column:', error);
    return false;
  }
}

checkColumn()
  .then((exists) => {
    if (exists) {
      console.log('\n✅ All good! call_status column is ready.');
    } else {
      console.log('\n⚠️ Action required: Run the migration shown above.');
    }
    process.exit(exists ? 0 : 1);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
