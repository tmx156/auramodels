/**
 * Migration: Delete all leads except specific ones
 * Purpose: Keep only Sandra Poon, Alan Rutherford, and Tinashe Mamire
 * 
 * Run with: node server/migrations/delete_all_leads_except_specific.js
 */

const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey || config.supabase.anonKey
);

async function deleteAllLeadsExceptSpecific() {
  console.log('🚀 Starting migration: Delete all leads except specific ones\n');

  try {
    // Step 1: Find the leads to keep
    console.log('📊 Step 1: Finding leads to keep...\n');

    // Find Sandra Poon
    const { data: sandraData, error: sandraError } = await supabase
      .from('leads')
      .select('id, name, phone, postcode')
      .or('phone.eq.+447964037793,postcode.ilike.N7%7FJ%,name.ilike.%Sandra%Poon%')
      .limit(1);

    if (sandraError) {
      console.error('❌ Error finding Sandra Poon:', sandraError);
    }

    const sandra = sandraData && sandraData.length > 0 ? sandraData[0] : null;
    if (sandra) {
      console.log(`✅ Found Sandra Poon: ${sandra.name} (${sandra.phone}) - ID: ${sandra.id}`);
    } else {
      console.log('⚠️  Sandra Poon NOT FOUND');
    }

    // Find Alan Rutherford
    const { data: alanData, error: alanError } = await supabase
      .from('leads')
      .select('id, name, phone, postcode')
      .or('phone.eq.+447984976030,postcode.ilike.W44ED%,name.ilike.%Alan%Rutherford%')
      .limit(1);

    if (alanError) {
      console.error('❌ Error finding Alan Rutherford:', alanError);
    }

    const alan = alanData && alanData.length > 0 ? alanData[0] : null;
    if (alan) {
      console.log(`✅ Found Alan Rutherford: ${alan.name} (${alan.phone}) - ID: ${alan.id}`);
    } else {
      console.log('⚠️  Alan Rutherford NOT FOUND');
    }

    // Find Tinashe Mamire
    const { data: tinasheData, error: tinasheError } = await supabase
      .from('leads')
      .select('id, name, phone, postcode')
      .or('postcode.ilike.EN6%3PU%,name.ilike.%Tinashe%Mamire%')
      .limit(1);

    if (tinasheError) {
      console.error('❌ Error finding Tinashe Mamire:', tinasheError);
    }

    const tinashe = tinasheData && tinasheData.length > 0 ? tinasheData[0] : null;
    if (tinashe) {
      console.log(`✅ Found Tinashe Mamire: ${tinashe.name} (${tinashe.postcode}) - ID: ${tinashe.id}`);
    } else {
      console.log('⚠️  Tinashe Mamire NOT FOUND');
    }

    // Build array of IDs to keep
    const leadsToKeep = [];
    if (sandra) leadsToKeep.push(sandra.id);
    if (alan) leadsToKeep.push(alan.id);
    if (tinashe) leadsToKeep.push(tinashe.id);

    console.log(`\n📊 Total leads to keep: ${leadsToKeep.length}\n`);

    if (leadsToKeep.length === 0) {
      console.error('❌ ERROR: No leads found to keep! Aborting deletion to prevent deleting all leads.');
      process.exit(1);
    }

    // Step 2: Get count before deletion
    const { count: totalBefore, error: countError } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('❌ Error counting leads:', countError);
      throw countError;
    }

    console.log(`📊 Total leads before deletion: ${totalBefore}`);

    // Step 3: Delete related sales first
    console.log('\n📊 Step 2: Deleting related sales records...');
    
    // Get all sales that belong to leads we're deleting
    const { data: allSales, error: allSalesError } = await supabase
      .from('sales')
      .select('id, lead_id');

    if (allSalesError) {
      console.error('⚠️  Error fetching sales:', allSalesError);
    } else if (allSales && allSales.length > 0) {
      // Filter sales that belong to leads we're NOT keeping
      const salesToDelete = allSales.filter(sale => !leadsToKeep.includes(sale.lead_id));
      
      if (salesToDelete.length > 0) {
        const salesIds = salesToDelete.map(s => s.id);
        
        // Delete in batches of 100
        for (let i = 0; i < salesIds.length; i += 100) {
          const batch = salesIds.slice(i, i + 100);
          const { error: deleteSalesError } = await supabase
            .from('sales')
            .delete()
            .in('id', batch);

          if (deleteSalesError) {
            console.error(`❌ Error deleting sales batch ${Math.floor(i / 100) + 1}:`, deleteSalesError);
          } else {
            console.log(`   Deleted sales batch ${Math.floor(i / 100) + 1} (${batch.length} sales)`);
          }
        }
        console.log(`✅ Deleted ${salesToDelete.length} related sales records`);
      } else {
        console.log('   No related sales to delete');
      }
    } else {
      console.log('   No sales found');
    }

    // Step 4: Delete all leads NOT in the keep list
    console.log('\n📊 Step 3: Deleting leads...');
    
    // Get all leads first
    const { data: allLeads, error: allLeadsError } = await supabase
      .from('leads')
      .select('id');

    if (allLeadsError) {
      console.error('❌ Error fetching leads:', allLeadsError);
      throw allLeadsError;
    }

    // Filter leads to delete (those NOT in keep list)
    const leadsToDelete = allLeads
      .filter(lead => !leadsToKeep.includes(lead.id))
      .map(lead => lead.id);

    let deletedCount = 0;
    if (leadsToDelete.length === 0) {
      console.log('   No leads to delete');
    } else {
      // Delete in batches of 100
      for (let i = 0; i < leadsToDelete.length; i += 100) {
        const batch = leadsToDelete.slice(i, i + 100);
        const { error: deleteError } = await supabase
          .from('leads')
          .delete()
          .in('id', batch);

        if (deleteError) {
          console.error(`❌ Error deleting leads batch ${Math.floor(i / 100) + 1}:`, deleteError);
        } else {
          deletedCount += batch.length;
          console.log(`   Deleted leads batch ${Math.floor(i / 100) + 1} (${batch.length} leads)`);
        }
      }

      console.log(`✅ Deleted ${deletedCount} leads`);
    }

    // Step 5: Verify results
    const { count: totalAfter, error: countAfterError } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true });

    if (countAfterError) {
      console.error('❌ Error counting leads after deletion:', countAfterError);
    } else {
      console.log(`📊 Total leads after deletion: ${totalAfter}`);
    }

    // Step 6: Show remaining leads
    console.log('\n📊 Step 4: Remaining leads:');
    const { data: remainingLeads, error: remainingError } = await supabase
      .from('leads')
      .select('id, name, phone, postcode, status, created_at')
      .order('name');

    if (remainingError) {
      console.error('❌ Error fetching remaining leads:', remainingError);
    } else if (remainingLeads) {
      remainingLeads.forEach((lead, index) => {
        console.log(`   ${index + 1}. ${lead.name} - ${lead.phone || 'No phone'} - ${lead.postcode || 'No postcode'} - ${lead.status}`);
      });
    }

    console.log('\n✅ Migration completed successfully!');
    console.log(`   Kept ${leadsToKeep.length} leads`);
    console.log(`   Deleted ${deletedCount} leads`);

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration if called directly
if (require.main === module) {
  deleteAllLeadsExceptSpecific()
    .then(() => {
      console.log('\n✅ Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = { deleteAllLeadsExceptSpecific };

