const dbManager = require('../database-connection-manager');
const config = require('../config');
const { getSupabaseClient } = require('../config/supabase-client');

class CallbackReminderService {
  constructor() {
    // Use the centralized Supabase client with timeout protection
    this.supabase = getSupabaseClient();
    this.checkInterval = null;
    this.isRunning = false;
  }

  /**
   * Check for due callbacks and send notifications
   */
  async checkDueCallbacks() {
    try {
      const now = new Date();
      
      // Find callbacks that are due (within the current minute)
      // We check for callbacks within a 2-minute window to account for timing variations
      const checkStart = new Date(now.getTime() - 120000); // 2 minutes ago
      const checkEnd = new Date(now.getTime() + 60000); // 1 minute from now
      
      console.log(`📞 Checking for due callbacks between ${checkStart.toISOString()} and ${checkEnd.toISOString()}`);
      
      const { data: dueCallbacks, error } = await this.supabase
        .from('callback_reminders')
        .select(`
          *,
          leads:lead_id (
            id,
            name,
            phone,
            email
          ),
          users:user_id (
            id,
            name,
            email
          )
        `)
        .eq('status', 'pending')
        .gte('callback_time', checkStart.toISOString())
        .lte('callback_time', checkEnd.toISOString());

      if (error) {
        console.error('❌ Error fetching due callbacks:', error);
        return;
      }

      if (!dueCallbacks || dueCallbacks.length === 0) {
        // Log that we checked but found nothing (only every 5th check to reduce noise)
        if (Math.random() < 0.2) {
          console.log(`📞 No callbacks due at ${now.toISOString()}`);
        }
        return; // No callbacks due
      }

      console.log(`📞 Found ${dueCallbacks.length} callback(s) due for notification`);

      for (const reminder of dueCallbacks) {
        try {
          // Get the actual callback time in UK timezone for display
          const callbackTimeUK = new Date(reminder.callback_time);
          const callbackTimeUKStr = callbackTimeUK.toLocaleString('en-GB', { 
            timeZone: 'Europe/London',
            hour: '2-digit',
            minute: '2-digit'
          });

          // Send WebSocket notification to the user
          if (global.io) {
            const notification = {
              type: 'callback_reminder',
              reminderId: reminder.id,
              leadId: reminder.lead_id,
              leadName: reminder.leads?.name || 'Unknown Lead',
              leadPhone: reminder.leads?.phone || '',
              callbackTime: callbackTimeUKStr,
              callbackNote: reminder.callback_note || '',
              message: `⏰ Callback Reminder: Call ${reminder.leads?.name || 'lead'} at ${callbackTimeUKStr}${reminder.callback_note ? ` - ${reminder.callback_note}` : ''}`,
              timestamp: new Date().toISOString()
            };

            // Emit to specific user room ONLY (user-specific callbacks)
            global.io.to(`user_${reminder.user_id}`).emit('callback_reminder', notification);

            console.log(`📞 Callback reminder sent to user ${reminder.user_id} for lead ${reminder.lead_id}`);
          }

          // Update reminder status to 'notified'
          await this.supabase
            .from('callback_reminders')
            .update({
              status: 'notified',
              notified_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', reminder.id);

        } catch (reminderError) {
          console.error(`❌ Error processing callback reminder ${reminder.id}:`, reminderError);
        }
      }

    } catch (error) {
      console.error('❌ Error checking due callbacks:', error);
    }
  }

  /**
   * Start the callback reminder scheduler
   */
  start() {
    if (this.isRunning) {
      console.log('📞 Callback reminder scheduler already running');
      return;
    }

    console.log('🚀 Starting callback reminder scheduler...');
    this.isRunning = true;

    // Check for due callbacks every minute
    this.checkInterval = setInterval(async () => {
      try {
        await this.checkDueCallbacks();
      } catch (error) {
        console.error('❌ Error in callback reminder check:', error);
      }
    }, 60000); // Every minute

    // Run immediately on startup
    this.checkDueCallbacks();
  }

  /**
   * Stop the callback reminder scheduler
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log('🛑 Callback reminder scheduler stopped');
  }
}

module.exports = CallbackReminderService;

