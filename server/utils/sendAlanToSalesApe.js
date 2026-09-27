/**
 * Send Alan Rutherford's lead to SalesApe
 * Run with: node server/utils/sendAlanToSalesApe.js
 */

const dbManager = require('../database-connection-manager');
const { sendLeadToSalesApe } = require('../routes/salesape-webhook');

async function sendAlanToSalesApe() {
  console.log('🔍 Finding Alan Rutherford\'s lead...\n');

  try {
    // Find Alan Rutherford
    let leads = await dbManager.query('leads', {
      select: 'id, name, phone, email, postcode, salesape_record_id, salesape_sent_at',
      eq: { name: 'Alan Rutherford' },
      limit: 1
    });

    // Try by phone if not found
    if (!leads || leads.length === 0) {
      leads = await dbManager.query('leads', {
        select: 'id, name, phone, email, postcode, salesape_record_id, salesape_sent_at',
        or: [
          { phone: { eq: '+447984976030' } },
          { phone: { eq: '447984976030' } },
          { phone: { eq: '07984976030' } },
          { phone: { eq: '07984976020' } }
        ],
        limit: 1
      });
    }

    if (!leads || leads.length === 0) {
      console.log('❌ Alan Rutherford\'s lead not found in database');
      return;
    }

    const lead = leads[0];
    console.log(`✅ Found lead: ${lead.name} (ID: ${lead.id})`);
    console.log(`   Phone: ${lead.phone || 'N/A'}`);
    console.log(`   Email: ${lead.email || 'N/A'}`);
    console.log(`   Postcode: ${lead.postcode || 'N/A'}\n`);

    if (!lead.phone || lead.phone.trim() === '') {
      console.log('❌ Lead has no phone number - cannot send to SalesApe');
      console.log('💡 Phone number is required for SalesApe');
      return;
    }

    if (lead.salesape_sent_at) {
      console.log('⚠️  Lead has already been sent to SalesApe');
      console.log(`   Sent At: ${lead.salesape_sent_at}`);
      console.log(`   Record ID: ${lead.salesape_record_id || 'N/A'}`);
      console.log('\n💡 If you want to re-send, you may need to remove it from the queue first');
      return;
    }

    console.log('📤 Sending lead to SalesApe...\n');

    try {
      const result = await sendLeadToSalesApe(lead);
      
      console.log('✅ Lead sent to SalesApe successfully!');
      console.log(`   Airtable Record ID: ${result.id}`);
      console.log('\n📊 Next Steps:');
      console.log('   1. The lead is now in the SalesApe queue');
      console.log('   2. The sync service will check for updates every 2 minutes');
      console.log('   3. You should see updates appear in the SalesApe dashboard');
      console.log('   4. Real-time updates will be shown when SalesApe sends webhooks');

    } catch (error) {
      console.error('❌ Error sending lead to SalesApe:', error.message);
      if (error.code === 'MISSING_PHONE') {
        console.error('💡 The lead needs a valid phone number');
      } else if (error.code === 'INVALID_PHONE') {
        console.error('💡 The phone number format is invalid');
      } else {
        console.error('💡 Check server logs for more details');
      }
      throw error;
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  sendAlanToSalesApe()
    .then(() => {
      console.log('\n✅ Process completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Process failed:', error);
      process.exit(1);
    });
}

module.exports = { sendAlanToSalesApe };

