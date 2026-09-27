/**
 * SalesApe Status Sync Service
 *
 * Automatically syncs lead status from SalesApe's Airtable to CRM database.
 * This service runs periodically to fetch updated status from SalesApe.
 *
 * WHY THIS IS NEEDED:
 * SalesApe's webhook integration is not yet configured to send updates
 * to the CRM automatically. This service polls SalesApe's Airtable API
 * to check for status updates and syncs them to the CRM.
 *
 * WHEN WEBHOOKS ARE CONFIGURED:
 * Once SalesApe is configured to send webhooks to:
 * https://your-crm-domain.example.com/api/salesape-webhook/update
 * This service can be disabled or used as a backup sync mechanism.
 */

const axios = require('axios');
const dbManager = require('../database-connection-manager');

const SALESAPE_CONFIG = {
  AIRTABLE_URL: 'https://api.airtable.com/v0/appoT1TexUksGanE8/tblTJGg187Ub84aXf',
  PAT_CODE: process.env.SALESAPE_PAT_CODE || process.env.SALESAPE_PAT,
  SYNC_INTERVAL: parseInt(process.env.SALESAPE_SYNC_INTERVAL) || 600000, // 10 minutes - increased from 2 min to prevent DB overload
  ENABLED: process.env.SALESAPE_SYNC_ENABLED !== 'false' // Enabled by default
};

class SalesApeSyncService {
  constructor() {
    this.syncInterval = null;
    this.isSyncing = false;
    this.lastSyncTime = null;
    this.syncCount = 0;
  }

  /**
   * Start the sync service
   */
  start() {
    if (!SALESAPE_CONFIG.ENABLED) {
      console.log('⏸️  SalesApe sync service is disabled');
      return;
    }

    if (!SALESAPE_CONFIG.PAT_CODE) {
      console.error('❌ SalesApe sync service cannot start: SALESAPE_PAT not configured');
      return;
    }

    console.log(`🔄 Starting SalesApe sync service (interval: ${SALESAPE_CONFIG.SYNC_INTERVAL / 1000}s)`);

    // Run first sync immediately
    this.syncNow();

    // Then run on interval
    this.syncInterval = setInterval(() => {
      this.syncNow();
    }, SALESAPE_CONFIG.SYNC_INTERVAL);
  }

  /**
   * Stop the sync service
   */
  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('⏹️  SalesApe sync service stopped');
    }
  }

  /**
   * Trigger a sync immediately
   */
  async syncNow() {
    if (this.isSyncing) {
      console.log('⏳ Sync already in progress, skipping...');
      return;
    }

    this.isSyncing = true;
    const startTime = Date.now();

    try {
      // Get all leads that have been sent to SalesApe
      const leads = await dbManager.query('leads', {
        select: 'id, name, salesape_record_id, salesape_status, salesape_initial_message_sent, salesape_user_engaged, salesape_goal_hit, salesape_goal_presented, date_booked, time_booked',
        not: { salesape_record_id: null }
      });

      if (!leads || leads.length === 0) {
        console.log('📋 [SalesApe Sync] No leads with salesape_record_id found to sync');
        return; // No leads to sync, exit quietly
      }

      console.log(`📋 [SalesApe Sync] Found ${leads.length} leads to sync`);
      
      // Log lead names for debugging (first 5)
      const leadNames = leads.slice(0, 5).map(l => l.name).join(', ');
      if (leads.length > 5) {
        console.log(`   Leads being synced: ${leadNames}... (and ${leads.length - 5} more)`);
      } else {
        console.log(`   Leads being synced: ${leadNames}`);
      }

      let updatedCount = 0;
      let unchangedCount = 0;
      let errorCount = 0;

      // Sync each lead
      for (const lead of leads) {
        try {
          // Validate record ID exists before making request
          if (!lead.salesape_record_id || lead.salesape_record_id.trim() === '') {
            console.warn(`   ⚠️ Skipping ${lead.name}: No salesape_record_id`);
            unchangedCount++;
            continue;
          }

          // Fetch from Airtable
          const response = await axios.get(
            `${SALESAPE_CONFIG.AIRTABLE_URL}/${lead.salesape_record_id}`,
            {
              headers: {
                'Authorization': `Bearer ${SALESAPE_CONFIG.PAT_CODE}`,
                'Content-Type': 'application/json'
              },
              timeout: 10000,
              validateStatus: (status) => {
                // Don't throw for 4xx errors, handle them in catch block
                return status < 500;
              }
            }
          );

          // Check if request was successful
          if (response.status !== 200) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const fields = response.data.fields;

          // Check if any fields need updating
          const needsUpdate =
            (fields['SalesAPE Initial Message Sent'] !== lead.salesape_initial_message_sent) ||
            (fields['SalesAPE User Engaged'] !== lead.salesape_user_engaged) ||
            (fields['SalesAPE Goal Hit'] !== lead.salesape_goal_hit) ||
            (fields['SalesAPE Status'] && fields['SalesAPE Status'] !== lead.salesape_status);

          if (needsUpdate) {
            // Build update data
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

            // If goal was hit, update lead status and booking details
            if (fields['SalesAPE Goal Hit'] && !lead.salesape_goal_hit) {
              updateData.status = 'Booked';
              console.log(`   🎯 Goal Hit for ${lead.name}! Setting status to "Booked"`);

              // Sync booking date/time from Airtable (check multiple possible field names)
              const bookingDate = fields['Booking Date'] || fields['Booking_Date'] || fields['booking_date'] || fields['Appointment Date'];
              const bookingTime = fields['Booking Time'] || fields['Booking_Time'] || fields['booking_time'] || fields['Appointment Time'];

              if (bookingDate) {
                updateData.date_booked = bookingDate;
                console.log(`   📅 Booking date synced: ${bookingDate}`);
              } else {
                console.log(`   ⚠️ No booking date found in Airtable for ${lead.name}`);
              }

              if (bookingTime) {
                updateData.time_booked = bookingTime;
                console.log(`   🕐 Booking time synced: ${bookingTime}`);
              } else {
                console.log(`   ⚠️ No booking time found in Airtable for ${lead.name}`);
              }
            }

            // Also sync booking details for leads already marked as goal hit but missing date/time
            if (fields['SalesAPE Goal Hit'] && lead.salesape_goal_hit && (!lead.date_booked || !lead.time_booked)) {
              const bookingDate = fields['Booking Date'] || fields['Booking_Date'] || fields['booking_date'] || fields['Appointment Date'];
              const bookingTime = fields['Booking Time'] || fields['Booking_Time'] || fields['booking_time'] || fields['Appointment Time'];

              if (bookingDate && !lead.date_booked) {
                updateData.date_booked = bookingDate;
                console.log(`   📅 Backfilling booking date for ${lead.name}: ${bookingDate}`);
              }

              if (bookingTime && !lead.time_booked) {
                updateData.time_booked = bookingTime;
                console.log(`   🕐 Backfilling booking time for ${lead.name}: ${bookingTime}`);
              }
            }

            // Update in database
            await dbManager.update('leads', updateData, { id: lead.id });

            updatedCount++;

            // Emit socket events for real-time updates
            if (global.io) {
              // Emit status update for activity monitor
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

              // Emit queue update to refresh the queue with new status
              global.io.emit('salesape_queue_update', {
                action: 'updated',
                leadId: lead.id,
                leadName: lead.name,
                status: updateData.salesape_status,
                userEngaged: updateData.salesape_user_engaged,
                goalHit: updateData.salesape_goal_hit,
                timestamp: new Date().toISOString()
              });

              // Emit message update if conversation is progressing
              if (updateData.salesape_user_engaged || updateData.salesape_initial_message_sent) {
                global.io.emit('salesape_message', {
                  leadId: lead.id,
                  leadName: lead.name,
                  status: updateData.salesape_status,
                  timestamp: new Date().toISOString()
                });
              }
            }
          } else {
            unchangedCount++;
          }

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 300));

        } catch (error) {
          const statusCode = error.response?.status;
          const errorMessage = error.response?.data?.error?.message || error.message;
          
          // Handle different error types
          if (statusCode === 404) {
            // Record doesn't exist in Airtable - silently skip (might have been deleted)
            unchangedCount++;
          } else if (statusCode === 403) {
            // Permission denied - likely token doesn't have access or record was moved/deleted
            console.error(`   ❌ Error syncing ${lead.name}: 403 Forbidden - Access denied`);
            console.error(`      Record ID: ${lead.salesape_record_id}`);
            console.error(`      Possible causes:`);
            console.error(`      1. Airtable token doesn't have access to this record`);
            console.error(`      2. Record was deleted or moved in Airtable`);
            console.error(`      3. Token permissions changed`);
            console.error(`      Error: ${errorMessage || 'Unknown error'}`);
            errorCount++;
          } else if (statusCode === 401) {
            // Unauthorized - token expired or invalid
            console.error(`   ❌ Error syncing ${lead.name}: 401 Unauthorized - Token may be expired`);
            console.error(`      Check SALESAPE_PAT_CODE in .env file`);
            errorCount++;
          } else {
            // Other errors
            console.error(`   ❌ Error syncing ${lead.name}:`, statusCode || errorMessage);
            errorCount++;
          }
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      this.syncCount++;
      this.lastSyncTime = new Date();

      // Log sync results
      if (updatedCount > 0 || errorCount > 0) {
        console.log(`✅ [SalesApe Sync #${this.syncCount}] Complete in ${duration}s - Updated: ${updatedCount} | Unchanged: ${unchangedCount} | Errors: ${errorCount}`);
      } else if (this.syncCount % 10 === 0) {
        // Log every 10th sync even if no updates (to show it's running)
        console.log(`✅ [SalesApe Sync #${this.syncCount}] Complete in ${duration}s - No updates (${unchangedCount} leads checked)`);
      }

    } catch (error) {
      console.error('❌ SalesApe sync error:', error.message);
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Get sync service status
   */
  getStatus() {
    return {
      enabled: SALESAPE_CONFIG.ENABLED,
      running: this.syncInterval !== null,
      syncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      syncCount: this.syncCount,
      syncInterval: SALESAPE_CONFIG.SYNC_INTERVAL
    };
  }
}

// Export singleton instance
const syncService = new SalesApeSyncService();
module.exports = syncService;
