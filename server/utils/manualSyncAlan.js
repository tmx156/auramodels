/**
 * Manually trigger sync for Alan Rutherford's lead
 * Run with: node server/utils/manualSyncAlan.js
 */

const dbManager = require('../database-connection-manager');
const axios = require('axios');

const SALESAPE_CONFIG = {
  AIRTABLE_URL: 'https://api.airtable.com/v0/appoT1TexUksGanE8/tblTJGg187Ub84aXf',
  PAT_CODE: process.env.SALESAPE_PAT_CODE || process.env.SALESAPE_PAT
};

async function manualSyncAlan() {
  console.log('🔍 Finding Alan Rutherford\'s lead...\n');

  try {
    // Find Alan Rutherford
    let leads = await dbManager.query('leads', {
      select: 'id, name, phone, email, salesape_record_id, salesape_sent_at, salesape_status',
      eq: { name: 'Alan Rutherford' },
      limit: 1
    });

    // Try by phone if not found
    if (!leads || leads.length === 0) {
      leads = await dbManager.query('leads', {
        select: 'id, name, phone, email, salesape_record_id, salesape_sent_at, salesape_status',
        or: [
          { phone: { eq: '+447984976030' } },
          { phone: { eq: '447984976030' } },
          { phone: { eq: '07984976030' } }
        ],
        limit: 1
      });
    }

    if (!leads || leads.length === 0) {
      console.log('❌ Alan Rutherford\'s lead not found in database');
      console.log('💡 Make sure the lead exists and has been sent to SalesApe');
      return;
    }

    const lead = leads[0];
    console.log(`✅ Found lead: ${lead.name} (ID: ${lead.id})`);
    console.log(`   Phone: ${lead.phone || 'N/A'}`);
    console.log(`   SalesApe Record ID: ${lead.salesape_record_id || '❌ NOT SET'}`);
    console.log(`   Sent At: ${lead.salesape_sent_at || '❌ NOT SENT'}\n`);

    if (!lead.salesape_record_id) {
      console.log('❌ Lead has no SalesApe record ID - cannot sync');
      console.log('💡 The lead needs to be sent to SalesApe first');
      return;
    }

    if (!SALESAPE_CONFIG.PAT_CODE) {
      console.log('❌ SALESAPE_PAT not configured');
      return;
    }

    console.log('🔄 Fetching latest status from SalesApe Airtable...\n');

    // Fetch from Airtable
    try {
      const response = await axios.get(
        `${SALESAPE_CONFIG.AIRTABLE_URL}/${lead.salesape_record_id}`,
        {
          headers: {
            'Authorization': `Bearer ${SALESAPE_CONFIG.PAT_CODE}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      const fields = response.data.fields;
      
      console.log('📊 Current SalesApe Status:');
      console.log(`   Status: ${fields['SalesAPE Status'] || 'N/A'}`);
      console.log(`   Initial Message Sent: ${fields['SalesAPE Initial Message Sent'] || false}`);
      console.log(`   User Engaged: ${fields['SalesAPE User Engaged'] || false}`);
      console.log(`   Goal Presented: ${fields['SalesAPE Goal Presented'] || false}`);
      console.log(`   Goal Hit: ${fields['SalesAPE Goal Hit'] || false}`);
      console.log(`   Opted Out: ${fields['Not Interested / Opted Out'] || false}`);
      console.log(`   Follow Ups Ended: ${fields['Follow Ups Ended'] || false}\n`);

      // Check if update is needed
      const needsUpdate =
        (fields['SalesAPE Initial Message Sent'] !== lead.salesape_initial_message_sent) ||
        (fields['SalesAPE User Engaged'] !== lead.salesape_user_engaged) ||
        (fields['SalesAPE Goal Hit'] !== lead.salesape_goal_hit) ||
        (fields['SalesAPE Status'] && fields['SalesAPE Status'] !== lead.salesape_status);

      if (needsUpdate) {
        console.log('🔄 Updates detected! Updating lead in database...\n');

        const updateData = {
          salesape_status: fields['SalesAPE Status'] || lead.salesape_status,
          salesape_initial_message_sent: fields['SalesAPE Initial Message Sent'] || false,
          salesape_user_engaged: fields['SalesAPE User Engaged'] || false,
          salesape_goal_presented: fields['SalesAPE Goal Presented'] || false,
          salesape_goal_hit: fields['SalesAPE Goal Hit'] || false,
          salesape_opted_out: fields['Not Interested / Opted Out'] || false,
          salesape_follow_ups_ended: fields['Follow Ups Ended'] || false,
          salesape_last_updated: new Date().toISOString()
        };

        // Add conversation data if available
        if (fields['Conversation Summary']) {
          updateData.salesape_conversation_summary = fields['Conversation Summary'];
        }
        if (fields['Full Conversation']) {
          updateData.salesape_full_transcript = fields['Full Conversation'];
        }
        if (fields['Portal Link']) {
          updateData.salesape_portal_link = fields['Portal Link'];
        }

        // If goal was hit, update lead status
        if (fields['SalesAPE Goal Hit'] && !lead.salesape_goal_hit) {
          updateData.status = 'Booked';
          console.log('🎯 Goal Hit! Setting status to "Booked"');
        }

        // Update in database
        await dbManager.update('leads', updateData, { id: lead.id });

        console.log('✅ Lead updated successfully in database!');
        console.log('\n📊 Updated Fields:');
        Object.keys(updateData).forEach(key => {
          if (updateData[key] !== undefined) {
            console.log(`   ${key}: ${updateData[key]}`);
          }
        });

        // Emit socket events if global.io is available
        if (global.io) {
          global.io.emit('salesape_status_update', {
            leadId: lead.id,
            leadName: lead.name,
            status: updateData.salesape_status,
            initialMessageSent: updateData.salesape_initial_message_sent,
            userEngaged: updateData.salesape_user_engaged,
            goalPresented: updateData.salesape_goal_presented,
            goalHit: updateData.salesape_goal_hit,
            timestamp: new Date().toISOString()
          });

          global.io.emit('salesape_queue_update', {
            action: 'updated',
            leadId: lead.id,
            leadName: lead.name,
            status: updateData.salesape_status,
            userEngaged: updateData.salesape_user_engaged,
            goalHit: updateData.salesape_goal_hit,
            timestamp: new Date().toISOString()
          });

          console.log('\n📡 Real-time updates emitted to connected clients');
        }

      } else {
        console.log('✅ Lead is already up to date - no changes detected');
      }

    } catch (error) {
      const statusCode = error.response?.status;
      const errorMessage = error.response?.data?.error?.message || error.message;
      
      if (statusCode === 404) {
        console.log('❌ Record not found in Airtable - may have been deleted');
      } else if (statusCode === 403) {
        console.log('❌ Access denied - check SALESAPE_PAT permissions');
        console.log(`   Error: ${errorMessage}`);
      } else if (statusCode === 401) {
        console.log('❌ Unauthorized - SALESAPE_PAT may be expired');
      } else {
        console.log(`❌ Error fetching from Airtable: ${errorMessage}`);
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
  manualSyncAlan()
    .then(() => {
      console.log('\n✅ Manual sync completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Manual sync failed:', error);
      process.exit(1);
    });
}

module.exports = { manualSyncAlan };

