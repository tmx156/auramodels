/**
 * Comprehensive Finance Management API Routes
 * Includes payment schedules, reminders, Stripe integration, and admin notifications
 */

const express = require('express');
const { auth } = require('../middleware/auth');
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const { v4: uuidv4 } = require('uuid');
const stripe = require('stripe')(config.stripe?.secretKey || process.env.STRIPE_SECRET_KEY);

const router = express.Router();
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey || config.supabase.anonKey);

/**
 * Helper: Calculate next payment date based on frequency
 */
function calculateNextPaymentDate(startDate, frequency, dueDay = 1) {
  const date = new Date(startDate);
  const now = new Date();
  
  // If start date is in the past, calculate from now
  if (date < now) {
    switch (frequency) {
      case 'weekly':
        date.setDate(date.getDate() + (7 * Math.ceil((now - date) / (7 * 24 * 60 * 60 * 1000))));
        break;
      case 'bi-weekly':
        date.setDate(date.getDate() + (14 * Math.ceil((now - date) / (14 * 24 * 60 * 60 * 1000))));
        break;
      case 'monthly':
        let months = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
        if (now.getDate() > dueDay) months++;
        date.setMonth(date.getMonth() + months);
        date.setDate(Math.min(dueDay, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()));
        break;
      default:
        date.setMonth(date.getMonth() + 1);
    }
  }
  
  return date;
}

/**
 * @route   GET /api/finance/agreement/:id/schedule
 * @desc    Get payment schedule for a finance agreement
 * @access  Private
 */
router.get('/agreement/:id/schedule', auth, async (req, res) => {
  try {
    const { data: schedule, error } = await supabase
      .from('finance_payment_schedule')
      .select('*')
      .eq('finance_id', req.params.id)
      .order('payment_number', { ascending: true });

    if (error) throw error;

    res.json({
      success: true,
      schedule: schedule || []
    });
  } catch (error) {
    console.error('Error fetching payment schedule:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/finance/upcoming-payments
 * @desc    Get upcoming payments across all agreements
 * @access  Private
 */
router.get('/upcoming-payments', auth, async (req, res) => {
  try {
    const daysAhead = parseInt(req.query.days) || 7;
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysAhead);

    const { data: payments, error } = await supabase
      .from('finance_payment_schedule')
      .select(`
        *,
        finance:finance_id (
          agreement_number,
          lead:lead_id (name, email, phone)
        )
      `)
      .eq('status', 'pending')
      .lte('due_date', targetDate.toISOString().split('T')[0])
      .order('due_date', { ascending: true });

    if (error) throw error;

    res.json({
      success: true,
      payments: payments || []
    });
  } catch (error) {
    console.error('Error fetching upcoming payments:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   POST /api/finance/agreement/:id/send-reminder
 * @desc    Send manual payment reminder
 * @access  Private
 */
router.post('/agreement/:id/send-reminder', auth, async (req, res) => {
  try {
    const { type = 'email', message } = req.body;
    const financeId = req.params.id;

    // Get agreement details
    const { data: agreement, error: agreementError } = await supabase
      .from('finance')
      .select(`
        *,
        lead:lead_id (name, email, phone)
      `)
      .eq('id', financeId)
      .single();

    if (agreementError || !agreement) {
      return res.status(404).json({ message: 'Finance agreement not found' });
    }

    // Get next pending payment
    const { data: nextPayment, error: paymentError } = await supabase
      .from('finance_payment_schedule')
      .select('*')
      .eq('finance_id', financeId)
      .eq('status', 'pending')
      .order('payment_number', { ascending: true })
      .limit(1)
      .single();

    if (paymentError) {
      return res.status(400).json({ message: 'No pending payments found' });
    }

    // Create reminder log
    const reminderData = {
      id: uuidv4(),
      finance_id: financeId,
      payment_schedule_id: nextPayment.id,
      reminder_type: type,
      sent_by: req.user.id,
      message_content: message || `Payment reminder for ${agreement.lead.name}. Amount: £${nextPayment.amount}. Due: ${nextPayment.due_date}`,
      status: 'sent'
    };

    const { data: reminder, error: reminderError } = await supabase
      .from('finance_reminders')
      .insert(reminderData)
      .select()
      .single();

    if (reminderError) throw reminderError;

    // Update agreement reminder count
    await supabase
      .from('finance')
      .update({
        reminder_count: (agreement.reminder_count || 0) + 1,
        last_reminder_sent: new Date().toISOString()
      })
      .eq('id', financeId);

    // TODO: Send actual email/SMS here using your existing email service

    res.json({
      success: true,
      message: `${type.toUpperCase()} reminder sent successfully`,
      reminder
    });
  } catch (error) {
    console.error('Error sending reminder:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   POST /api/finance/create-stripe-link
 * @desc    Create Stripe payment link for a payment
 * @access  Private
 */
router.post('/create-stripe-link', auth, async (req, res) => {
  try {
    const { financeId, paymentScheduleId, amount, description } = req.body;

    if (!config.stripe?.secretKey) {
      return res.status(400).json({ message: 'Stripe not configured' });
    }

    // Get agreement details
    const { data: agreement, error: agreementError } = await supabase
      .from('finance')
      .select(`
        *,
        lead:lead_id (name, email)
      `)
      .eq('id', financeId)
      .single();

    if (agreementError || !agreement) {
      return res.status(404).json({ message: 'Finance agreement not found' });
    }

    // Create Stripe Payment Link
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{
        price_data: {
          currency: 'gbp',
          product_data: {
            name: `Payment for Agreement ${agreement.agreement_number}`,
            description: description || `Payment for ${agreement.lead.name}`
          },
          unit_amount: Math.round(amount * 100) // Convert to pence
        },
        quantity: 1
      }],
      metadata: {
        finance_id: financeId,
        payment_schedule_id: paymentScheduleId,
        customer_email: agreement.lead.email
      },
      after_completion: {
        type: 'redirect',
        redirect: {
          url: `${config.FRONTEND_URL || 'https://crm.example.com'}/payment-success`
        }
      }
    });

    // Save link to database
    const linkData = {
      id: uuidv4(),
      finance_id: financeId,
      payment_schedule_id: paymentScheduleId,
      stripe_payment_link_id: paymentLink.id,
      stripe_payment_link_url: paymentLink.url,
      amount: amount,
      status: 'active'
    };

    const { data: savedLink, error: linkError } = await supabase
      .from('finance_stripe_links')
      .insert(linkData)
      .select()
      .single();

    if (linkError) throw linkError;

    res.json({
      success: true,
      paymentLink: paymentLink.url,
      linkId: savedLink.id
    });
  } catch (error) {
    console.error('Error creating Stripe link:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   POST /api/finance/send-payment-email
 * @desc    Send payment email with Stripe link
 * @access  Private
 */
router.post('/send-payment-email', auth, async (req, res) => {
  try {
    const { financeId, paymentScheduleId, customMessage } = req.body;

    // Get agreement and payment details
    const { data: agreement, error: agreementError } = await supabase
      .from('finance')
      .select(`
        *,
        lead:lead_id (name, email),
        payment_schedule:finance_payment_schedule!inner(*)
      `)
      .eq('id', financeId)
      .eq('payment_schedule.id', paymentScheduleId)
      .single();

    if (agreementError || !agreement) {
      return res.status(404).json({ message: 'Agreement or payment not found' });
    }

    const payment = agreement.payment_schedule[0];

    // Create or get existing Stripe link
    let stripeLinkUrl = null;
    
    // Check for existing active link
    const { data: existingLink } = await supabase
      .from('finance_stripe_links')
      .select('*')
      .eq('payment_schedule_id', paymentScheduleId)
      .eq('status', 'active')
      .single();

    if (existingLink) {
      stripeLinkUrl = existingLink.stripe_payment_link_url;
    } else if (config.stripe?.secretKey) {
      // Create new link
      const paymentLink = await stripe.paymentLinks.create({
        line_items: [{
          price_data: {
            currency: 'gbp',
            product_data: {
              name: `Payment ${payment.payment_number} of ${agreement.duration}`,
              description: `Agreement: ${agreement.agreement_number}`
            },
            unit_amount: Math.round(payment.amount * 100)
          },
          quantity: 1
        }],
        metadata: {
          finance_id: financeId,
          payment_schedule_id: paymentScheduleId
        }
      });

      stripeLinkUrl = paymentLink.url;

      await supabase.from('finance_stripe_links').insert({
        id: uuidv4(),
        finance_id: financeId,
        payment_schedule_id: paymentScheduleId,
        stripe_payment_link_id: paymentLink.id,
        stripe_payment_link_url: paymentLink.url,
        amount: payment.amount
      });
    }

    // TODO: Send email using your existing email service
    // Include stripeLinkUrl in the email

    res.json({
      success: true,
      message: 'Payment email sent',
      stripeLink: stripeLinkUrl
    });
  } catch (error) {
    console.error('Error sending payment email:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/finance/admin-notifications
 * @desc    Get admin notifications (unread)
 * @access  Private (Admin only)
 */
router.get('/admin-notifications', auth, async (req, res) => {
  try {
    const { data: notifications, error } = await supabase
      .from('finance_admin_notifications')
      .select(`
        *,
        finance:finance_id (
          agreement_number,
          lead:lead_id (name, email, phone)
        )
      `)
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    res.json({
      success: true,
      notifications: notifications || []
    });
  } catch (error) {
    console.error('Error fetching admin notifications:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   POST /api/finance/admin-notifications/:id/read
 * @desc    Mark admin notification as read
 * @access  Private (Admin only)
 */
router.post('/admin-notifications/:id/read', auth, async (req, res) => {
  try {
    const { error } = await supabase
      .from('finance_admin_notifications')
      .update({
        read: true,
        read_at: new Date().toISOString(),
        read_by: req.user.id
      })
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   POST /api/finance/record-payment
 * @desc    Record a manual payment
 * @access  Private
 */
router.post('/record-payment', auth, async (req, res) => {
  try {
    const { financeId, paymentScheduleId, amount, paymentMethod, notes } = req.body;

    // Update payment schedule
    const { error: updateError } = await supabase
      .from('finance_payment_schedule')
      .update({
        status: 'paid',
        paid_date: new Date().toISOString().split('T')[0],
        paid_amount: amount
      })
      .eq('id', paymentScheduleId);

    if (updateError) throw updateError;

    // Insert payment record
    const { data: payment, error: paymentError } = await supabase
      .from('finance_payments')
      .insert({
        id: uuidv4(),
        finance_id: financeId,
        amount_paid: amount,
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: paymentMethod || 'manual',
        notes: notes
      })
      .select()
      .single();

    if (paymentError) throw paymentError;

    res.json({
      success: true,
      message: 'Payment recorded successfully',
      payment
    });
  } catch (error) {
    console.error('Error recording payment:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/finance/dashboard-stats
 * @desc    Get comprehensive dashboard stats
 * @access  Private
 */
router.get('/dashboard-stats', auth, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const fiveDaysFromNow = new Date();
    fiveDaysFromNow.setDate(fiveDaysFromNow.getDate() + 5);

    // Total active agreements
    const { count: totalActive, error: activeError } = await supabase
      .from('finance')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    // Total due this month
    const { data: dueThisMonth, error: dueError } = await supabase
      .from('finance_payment_schedule')
      .select('amount')
      .eq('status', 'pending')
      .gte('due_date', today)
      .lte('due_date', today.substring(0, 8) + '31');

    // Overdue payments
    const { data: overduePayments, error: overdueError } = await supabase
      .from('finance_payment_schedule')
      .select('amount, due_date')
      .eq('status', 'overdue');

    // Payments due in next 5 days (for admin alerts)
    const { data: upcomingPayments, error: upcomingError } = await supabase
      .from('finance_payment_schedule')
      .select(`
        *,
        finance:finance_id (
          agreement_number,
          lead:lead_id (name, email, phone)
        )
      `)
      .eq('status', 'pending')
      .lte('due_date', fiveDaysFromNow.toISOString().split('T')[0])
      .gte('due_date', today)
      .order('due_date', { ascending: true });

    // Total collected this month
    const monthStart = today.substring(0, 8) + '01';
    const { data: collectedThisMonth, error: collectedError } = await supabase
      .from('finance_payments')
      .select('amount_paid')
      .gte('payment_date', monthStart);

    res.json({
      success: true,
      stats: {
        totalActive: totalActive || 0,
        dueThisMonth: dueThisMonth?.reduce((sum, p) => sum + parseFloat(p.amount), 0) || 0,
        overdueCount: overduePayments?.length || 0,
        overdueAmount: overduePayments?.reduce((sum, p) => sum + parseFloat(p.amount), 0) || 0,
        collectedThisMonth: collectedThisMonth?.reduce((sum, p) => sum + parseFloat(p.amount_paid), 0) || 0,
        upcomingPayments: upcomingPayments || []
      }
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
