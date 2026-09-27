/**
 * Finance Automation Service
 * Handles automated reminders and admin notifications for finance payments
 */

const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

class FinanceAutomationService {
  constructor() {
    this.supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey || config.supabase.anonKey);
    this.isRunning = false;
    this.checkInterval = null;
    
    // Configuration
    this.config = {
      reminderDays: [7, 3, 1], // Send reminders 7, 3, and 1 day before due
      adminAlertDays: 5,       // Alert admin 5 days before
      overdueAlertDays: 1,     // Alert admin 1 day after overdue
      checkIntervalMinutes: 60 // Check every hour
    };
  }

  /**
   * Start the automation service
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ Finance automation service already running');
      return;
    }

    console.log('🏦 Starting Finance Automation Service...');
    console.log(`   Config: Reminders at ${this.config.reminderDays.join(', ')} days before`);
    console.log(`   Admin alerts: ${this.config.adminAlertDays} days before due`);
    
    this.isRunning = true;
    
    // Run immediately on start
    this.runChecks();
    
    // Then schedule regular checks
    this.checkInterval = setInterval(
      () => this.runChecks(),
      this.config.checkIntervalMinutes * 60 * 1000
    );
  }

  /**
   * Stop the automation service
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log('🏦 Finance automation service stopped');
  }

  /**
   * Run all automated checks
   */
  async runChecks() {
    const now = new Date();
    console.log(`\n[${now.toISOString()}] Running finance automation checks...`);

    try {
      // 1. Check for upcoming payments and send reminders
      await this.processPaymentReminders();
      
      // 2. Check for admin alerts (5 days before)
      await this.processAdminAlerts();
      
      // 3. Check for overdue payments
      await this.processOverduePayments();
      
      // 4. Update overdue status
      await this.updateOverdueStatus();
      
      console.log(`[${now.toISOString()}] Finance automation checks complete\n`);
    } catch (error) {
      console.error('❌ Error in finance automation:', error);
    }
  }

  /**
   * Process payment reminders for upcoming due dates
   */
  async processPaymentReminders() {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // For each reminder day (7, 3, 1 days before)
      for (const daysBefore of this.config.reminderDays) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + daysBefore);
        const targetDateStr = targetDate.toISOString().split('T')[0];

        // Get payments due on target date that haven't had reminder sent
        const { data: payments, error } = await this.supabase
          .from('finance_payment_schedule')
          .select(`
            *,
            finance:finance_id (
              agreement_number,
              email_reminders,
              sms_reminders,
              reminder_count,
              lead:lead_id (name, email, phone)
            )
          `)
          .eq('due_date', targetDateStr)
          .eq('status', 'pending')
          .eq('reminder_sent', false);

        if (error) throw error;

        if (payments && payments.length > 0) {
          console.log(`📧 Found ${payments.length} payments due in ${daysBefore} days`);

          for (const payment of payments) {
            await this.sendPaymentReminder(payment, daysBefore);
          }
        }
      }
    } catch (error) {
      console.error('❌ Error processing payment reminders:', error);
    }
  }

  /**
   * Send payment reminder to customer
   */
  async sendPaymentReminder(payment, daysBefore) {
    try {
      const finance = payment.finance;
      
      if (!finance.email_reminders && !finance.sms_reminders) {
        console.log(`⏭️ Skipping reminder for ${finance.lead.name} - reminders disabled`);
        return;
      }

      // TODO: Integrate with your email/SMS service
      console.log(`📧 Would send ${daysBefore}-day reminder to ${finance.lead.email}`);
      console.log(`   Amount: £${payment.amount}, Due: ${payment.due_date}`);

      // Log reminder
      await this.supabase.from('finance_reminders').insert({
        finance_id: finance.id,
        payment_schedule_id: payment.id,
        reminder_type: 'email',
        days_before_due: daysBefore,
        message_content: `Payment reminder: £${payment.amount} due in ${daysBefore} days`,
        status: 'sent'
      });

      // Mark as reminded
      await this.supabase
        .from('finance_payment_schedule')
        .update({ 
          reminder_sent: true, 
          reminder_sent_at: new Date().toISOString() 
        })
        .eq('id', payment.id);

      // Update finance agreement
      await this.supabase
        .from('finance')
        .update({
          reminder_count: (finance.reminder_count || 0) + 1,
          last_reminder_sent: new Date().toISOString()
        })
        .eq('id', finance.id);

    } catch (error) {
      console.error('❌ Error sending reminder:', error);
    }
  }

  /**
   * Process admin alerts for payments due soon
   */
  async processAdminAlerts() {
    try {
      const today = new Date();
      const alertDate = new Date();
      alertDate.setDate(alertDate.getDate() + this.config.adminAlertDays);
      const alertDateStr = alertDate.toISOString().split('T')[0];

      // Get payments due in 5 days
      const { data: upcomingPayments, error } = await this.supabase
        .from('finance_payment_schedule')
        .select(`
          *,
          finance:finance_id (
            agreement_number,
            lead:lead_id (name, email, phone)
          )
        `)
        .eq('due_date', alertDateStr)
        .eq('status', 'pending');

      if (error) throw error;

      if (upcomingPayments && upcomingPayments.length > 0) {
        console.log(`🚨 Creating admin alerts for ${upcomingPayments.length} payments due in ${this.config.adminAlertDays} days`);

        for (const payment of upcomingPayments) {
          // Check if alert already exists
          const { data: existingAlert } = await this.supabase
            .from('finance_admin_notifications')
            .select('id')
            .eq('finance_id', payment.finance_id)
            .eq('notification_type', 'payment_due_soon')
            .eq('days_until_due', this.config.adminAlertDays)
            .gte('created_at', today.toISOString().split('T')[0] + 'T00:00:00')
            .single();

          if (!existingAlert) {
            await this.supabase.from('finance_admin_notifications').insert({
              finance_id: payment.finance_id,
              notification_type: 'payment_due_soon',
              days_until_due: this.config.adminAlertDays,
              message: `Payment of £${payment.amount} for ${payment.finance.lead.name} (Agreement: ${payment.finance.agreement_number}) is due in ${this.config.adminAlertDays} days on ${payment.due_date}. Time to follow up!`,
              read: false
            });

            console.log(`🚨 Admin alert created: ${payment.finance.lead.name} - £${payment.amount}`);
          }
        }
      }
    } catch (error) {
      console.error('❌ Error processing admin alerts:', error);
    }
  }

  /**
   * Process overdue payments and alert admin
   */
  async processOverduePayments() {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Get overdue payments
      const { data: overduePayments, error } = await this.supabase
        .from('finance_payment_schedule')
        .select(`
          *,
          finance:finance_id (
            agreement_number,
            lead:lead_id (name, email, phone)
          )
        `)
        .eq('status', 'overdue')
        .lt('due_date', today);

      if (error) throw error;

      if (overduePayments && overduePayments.length > 0) {
        console.log(`⚠️ Found ${overduePayments.length} overdue payments`);

        for (const payment of overduePayments) {
          const daysOverdue = Math.floor(
            (new Date() - new Date(payment.due_date)) / (1000 * 60 * 60 * 24)
          );

          // Alert admin for new overdues (1 day after)
          if (daysOverdue === this.config.overdueAlertDays) {
            const { data: existingAlert } = await this.supabase
              .from('finance_admin_notifications')
              .select('id')
              .eq('finance_id', payment.finance_id)
              .eq('notification_type', 'payment_overdue')
              .eq('days_until_due', -daysOverdue)
              .single();

            if (!existingAlert) {
              await this.supabase.from('finance_admin_notifications').insert({
                finance_id: payment.finance_id,
                notification_type: 'payment_overdue',
                days_until_due: -daysOverdue,
                message: `URGENT: Payment of £${payment.amount} for ${payment.finance.lead.name} (Agreement: ${payment.finance.agreement_number}) is now ${daysOverdue} days overdue! Immediate action required.`,
                read: false
              });

              console.log(`🚨 Overdue alert created: ${payment.finance.lead.name} - ${daysOverdue} days overdue`);
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ Error processing overdue payments:', error);
    }
  }

  /**
   * Update payment status to overdue
   */
  async updateOverdueStatus() {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Mark payments as overdue
      const { data: updated, error } = await this.supabase
        .from('finance_payment_schedule')
        .update({ status: 'overdue' })
        .eq('status', 'pending')
        .lt('due_date', today)
        .select();

      if (error) throw error;

      if (updated && updated.length > 0) {
        console.log(`⚠️ Marked ${updated.length} payments as overdue`);
      }
    } catch (error) {
      console.error('❌ Error updating overdue status:', error);
    }
  }

  /**
   * Get admin notification count
   */
  async getUnreadNotificationCount() {
    try {
      const { count, error } = await this.supabase
        .from('finance_admin_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('read', false);

      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.error('Error getting notification count:', error);
      return 0;
    }
  }
}

// Export singleton instance
const financeAutomationService = new FinanceAutomationService();

module.exports = financeAutomationService;
