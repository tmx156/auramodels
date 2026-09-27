/**
 * Add booking_code column to leads table
 * Run with: node server/migrations/run_booking_code_migration.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const config = require('../config');

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

async function addColumn() {
  console.log('🚀 Running booking_code column migration...\n');
  
  // First check if column already exists
  const { data: testData, error: testError } = await supabase
    .from('leads')
    .select('id, booking_code')
    .limit(1);
  
  if (!testError) {
    console.log('✅ booking_code column already exists!');
    return true;
  }
  
  if (testError && !testError.message.includes('does not exist')) {
    console.log('Unexpected error:', testError);
    return false;
  }
  
  console.log('Column does not exist. Adding it now...');
  
  // The column doesn't exist - need to add it via Supabase Dashboard SQL Editor
  console.log('\n⚠️  Cannot add column programmatically.');
  console.log('Please run this SQL in your Supabase Dashboard SQL Editor:\n');
  console.log('----------------------------------------');
  console.log('ALTER TABLE leads ADD COLUMN booking_code VARCHAR(20);');
  console.log('CREATE UNIQUE INDEX idx_leads_booking_code ON leads(booking_code);');
  console.log('----------------------------------------\n');
  console.log('After running the SQL, run this script again to generate codes.');
  
  return false;
}

async function generateCodes() {
  const { generateCodesForExistingLeads } = require('../utils/bookingCodeGenerator');
  
  console.log('\n📋 Generating booking codes for existing leads...\n');
  
  try {
    const result = await generateCodesForExistingLeads();
    
    console.log('\n✅ Generation complete!');
    console.log(`   Updated: ${result.updated} leads`);
    console.log(`   Failed: ${result.failed} leads`);
    
    // Show examples
    const { data: samples } = await supabase
      .from('leads')
      .select('name, booking_code')
      .not('booking_code', 'is', null)
      .limit(5);
    
    if (samples && samples.length > 0) {
      console.log('\n📋 Example booking codes:');
      samples.forEach(lead => {
        console.log(`   ${lead.name}: https://www.example.com/book/${lead.booking_code}`);
      });
    }
    
    return true;
  } catch (err) {
    console.error('Error:', err.message);
    return false;
  }
}

async function main() {
  const columnExists = await addColumn();
  
  if (columnExists) {
    await generateCodes();
  }
  
  process.exit(0);
}

main();

