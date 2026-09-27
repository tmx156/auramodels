/**
 * Quick diagnostic script to check Alan Rutherford's SalesApe status
 * Run with: node server/utils/checkAlanSalesApe.js
 */

const dbManager = require('../database-connection-manager');
const syncService = require('../services/salesapeSync');

async function checkAlanSalesApe() {
  console.log('🔍 Checking Alan Rutherford\'s SalesApe Status...\n');

  try {
    // Find Alan Rutherford by exact name match first, then phone/postcode
    let leads = await dbManager.query('leads', {
      select: 'id, name, phone, email, postcode, salesape_record_id, salesape_sent_at, salesape_status, salesape_last_updated, salesape_initial_message_sent, salesape_user_engaged, salesape_goal_hit, created_at',
      eq: { name: 'Alan Rutherford' },
      limit: 5
    });

    // If not found by exact name, try phone or postcode
    if (!leads || leads.length === 0) {
      leads = await dbManager.query('leads', {
        select: 'id, name, phone, email, postcode, salesape_record_id, salesape_sent_at, salesape_status, salesape_last_updated, salesape_initial_message_sent, salesape_user_engaged, salesape_goal_hit, created_at',
        or: [
          { phone: { eq: '+447984976030' } },
          { phone: { eq: '447984976030' } },
          { phone: { eq: '07984976030' } },
          { postcode: { ilike: 'W44ED%' } }
        ],
        limit: 5
      });
    }

    // If still not found, try partial name match
    if (!leads || leads.length === 0) {
      leads = await dbManager.query('leads', {
        select: 'id, name, phone, email, postcode, salesape_record_id, salesape_sent_at, salesape_status, salesape_last_updated, salesape_initial_message_sent, salesape_user_engaged, salesape_goal_hit, created_at',
        and: [
          { name: { ilike: '%Alan%' } },
          { name: { ilike: '%Rutherford%' } }
        ],
        limit: 5
      });
    }

    if (!leads || leads.length === 0) {
      console.log('❌ No leads found for Alan Rutherford');
      return;
    }

    console.log(`✅ Found ${leads.length} lead(s) for Alan Rutherford:\n`);

    leads.forEach((lead, index) => {
      console.log(`📋 Lead ${index + 1}:`);
      console.log(`   Name: ${lead.name}`);
      console.log(`   Phone: ${lead.phone || 'N/A'}`);
      console.log(`   Email: ${lead.email || 'N/A'}`);
      console.log(`   Postcode: ${lead.postcode || 'N/A'}`);
      console.log(`   Lead ID: ${lead.id}`);
      console.log(`   Created: ${lead.created_at}`);
      console.log(`\n   SalesApe Status:`);
      console.log(`   ├─ Record ID: ${lead.salesape_record_id || '❌ NOT SET (lead not sent to SalesApe)'}`);
      console.log(`   ├─ Sent At: ${lead.salesape_sent_at || '❌ NOT SENT'}`);
      console.log(`   ├─ Status: ${lead.salesape_status || 'N/A'}`);
      console.log(`   ├─ Last Updated: ${lead.salesape_last_updated || '❌ NEVER'}`);
      console.log(`   ├─ Initial Message Sent: ${lead.salesape_initial_message_sent ? '✅ Yes' : '❌ No'}`);
      console.log(`   ├─ User Engaged: ${lead.salesape_user_engaged ? '✅ Yes' : '❌ No'}`);
      console.log(`   └─ Goal Hit: ${lead.salesape_goal_hit ? '✅ Yes' : '❌ No'}`);
      
      // Diagnosis
      console.log(`\n   🔍 Diagnosis:`);
      if (!lead.salesape_sent_at) {
        console.log(`   ⚠️  Lead has NOT been sent to SalesApe`);
        console.log(`   💡 Solution: Use "Add to Queue" button in SalesApe dashboard`);
      } else if (!lead.salesape_record_id) {
        console.log(`   ⚠️  Lead was sent but has no record ID (sync cannot work)`);
        console.log(`   💡 Solution: Re-send lead to SalesApe`);
      } else {
        console.log(`   ✅ Lead is in SalesApe queue and can be synced`);
        if (!lead.salesape_last_updated) {
          console.log(`   ⚠️  But has never been synced - check sync service`);
        }
      }
      console.log('');
    });

    // Check sync service status
    console.log('\n📊 Sync Service Status:');
    const syncStatus = syncService.getStatus();
    console.log(`   Enabled: ${syncStatus.enabled ? '✅ Yes' : '❌ No'}`);
    console.log(`   Running: ${syncStatus.running ? '✅ Yes' : '❌ No'}`);
    console.log(`   Currently Syncing: ${syncStatus.syncing ? '⏳ Yes' : '✅ No'}`);
    console.log(`   Last Sync: ${syncStatus.lastSyncTime || '❌ Never'}`);
    console.log(`   Total Syncs: ${syncStatus.syncCount || 0}`);

    // Recommendations
    console.log('\n💡 Recommendations:');
    if (!leads[0].salesape_sent_at) {
      console.log('   1. Send Alan\'s lead to SalesApe using the "Add to Queue" button');
    } else if (!leads[0].salesape_record_id) {
      console.log('   1. Re-send Alan\'s lead to SalesApe (record ID missing)');
    } else if (!syncStatus.running) {
      console.log('   1. Start the sync service (it should auto-start with the server)');
    } else if (!leads[0].salesape_last_updated) {
      console.log('   1. Wait for next sync cycle (runs every 2 minutes)');
      console.log('   2. Check server logs for sync errors');
    } else {
      console.log('   ✅ Everything looks good! Updates should appear automatically.');
    }

  } catch (error) {
    console.error('❌ Error checking Alan\'s status:', error);
  }
}

// Run if called directly
if (require.main === module) {
  checkAlanSalesApe()
    .then(() => {
      console.log('\n✅ Check completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Check failed:', error);
      process.exit(1);
    });
}

module.exports = { checkAlanSalesApe };

