/**
 * Migration Script: Generate Booking Codes for Existing Leads
 * 
 * This script:
 * 1. Runs the SQL migration to add the booking_code column
 * 2. Generates unique booking codes for all existing leads
 * 
 * Run with: node server/migrations/generate_booking_codes.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const config = require('../config');
const { generateCodesForExistingLeads } = require('../utils/bookingCodeGenerator');

async function runMigration() {
  console.log('🚀 Starting booking code migration...\n');
  
  // Initialize Supabase
  const supabase = createClient(
    config.supabase.url,
    config.supabase.serviceRoleKey || config.supabase.anonKey
  );

  // Step 1: Check if booking_code column exists
  console.log('📋 Step 1: Checking if booking_code column exists...');
  
  try {
    // Try to query the column
    const { data, error } = await supabase
      .from('leads')
      .select('booking_code')
      .limit(1);

    if (error && error.message.includes('column "booking_code" does not exist')) {
      console.log('⚠️  booking_code column does not exist.');
      console.log('📝 Please run the SQL migration first:');
      console.log('   server/migrations/add_booking_code_column.sql');
      console.log('\n   You can run this in the Supabase SQL Editor.');
      process.exit(1);
    }

    console.log('✅ booking_code column exists!\n');
  } catch (err) {
    console.error('Error checking column:', err);
    process.exit(1);
  }

  // Step 2: Generate codes for existing leads
  console.log('📋 Step 2: Generating booking codes for existing leads...\n');
  
  try {
    const result = await generateCodesForExistingLeads();
    
    console.log('\n========================================');
    console.log('✅ Migration complete!');
    console.log(`   Updated: ${result.updated} leads`);
    console.log(`   Failed: ${result.failed} leads`);
    console.log('========================================\n');
    
    // Show some example codes
    const { data: samples } = await supabase
      .from('leads')
      .select('name, booking_code')
      .not('booking_code', 'is', null)
      .limit(5);
    
    if (samples && samples.length > 0) {
      console.log('📋 Example booking codes generated:');
      samples.forEach(lead => {
        console.log(`   ${lead.name}: ${lead.booking_code}`);
        console.log(`   → https://www.example.com/book/${lead.booking_code}`);
      });
    }
    
  } catch (err) {
    console.error('Error generating codes:', err);
    process.exit(1);
  }
  
  process.exit(0);
}

runMigration();

