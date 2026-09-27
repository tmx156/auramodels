/**
 * Migration: Fix ever_booked flag for all bookings
 * 
 * This migration updates all leads that have a booked_at timestamp
 * but don't have the ever_booked flag set to true.
 * 
 * Run this on Railway after deployment to ensure all historical bookings
 * are properly tracked in daily activities.
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseKey) {
  console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixEverBookedFlag() {
  try {
    console.log('\n' + '='.repeat(70));
    console.log('📊 MIGRATION: Fix ever_booked flag for all bookings');
    console.log('='.repeat(70) + '\n');

    // Find all leads with booked_at timestamp but ever_booked = false
    console.log('🔍 Finding leads that need fixing...\n');
    
    const { data: needsFix, error: fetchError } = await supabase
      .from('leads')
      .select('id, name, status, booked_at, ever_booked')
      .not('booked_at', 'is', null)
      .eq('ever_booked', false)
      .order('booked_at', { ascending: false });

    if (fetchError) {
      console.error('❌ Error fetching leads:', fetchError);
      throw fetchError;
    }

    console.log(`📋 Found ${needsFix.length} bookings that need the ever_booked flag updated\n`);

    if (needsFix.length === 0) {
      console.log('✅ No bookings need fixing - all bookings already have ever_booked=true\n');
      return;
    }

    // Show sample of what will be fixed
    console.log('📝 Sample of bookings to be fixed (first 10):');
    needsFix.slice(0, 10).forEach((lead, i) => {
      const bookedDate = new Date(lead.booked_at).toISOString().split('T')[0];
      console.log(`   ${i + 1}. ${lead.name} - ${lead.status} - Booked on: ${bookedDate}`);
    });
    console.log('');

    // Update all leads
    console.log(`🔄 Updating ${needsFix.length} bookings to set ever_booked=true...\n`);

    const ids = needsFix.map(l => l.id);
    const { data: updated, error: updateError } = await supabase
      .from('leads')
      .update({ ever_booked: true })
      .in('id', ids)
      .select('id');

    if (updateError) {
      console.error('❌ Error updating leads:', updateError);
      throw updateError;
    }

    console.log(`✅ Successfully updated ${updated.length} bookings!\n`);
    console.log('='.repeat(70));
    console.log('✅ MIGRATION COMPLETE');
    console.log('='.repeat(70) + '\n');

    console.log('📊 Summary:');
    console.log(`   - Total bookings fixed: ${updated.length}`);
    console.log(`   - All historical bookings now tracked correctly`);
    console.log(`   - Daily activities will show all bookings accurately\n`);

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run migration
fixEverBookedFlag().then(() => {
  console.log('✅ Migration script completed successfully\n');
  process.exit(0);
}).catch(error => {
  console.error('❌ Migration script failed:', error);
  process.exit(1);
});

