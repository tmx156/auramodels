const express = require('express');
const router = express.Router();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const { auth } = require('../middleware/auth');
const { generateBookingCode } = require('../utils/bookingCodeGenerator');
const { findFirstAvailableSlotNumber } = require('../utils/calendarConstants');

const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey || config.supabase.anonKey
);

const recentWebhooks = [];
const MAX_STORED_WEBHOOKS = 10;

async function sendLeadToReplyDesk(lead) {
  try {
    if (!lead.phone || lead.phone.trim() === '') {
      const error = new Error(`Lead ${lead.name} (ID: ${lead.id}) has no phone number.`);
      error.code = 'MISSING_PHONE';

      await supabase
        .from('leads')
        .update({
          replydesk_status: 'failed',
          replydesk_error: 'Missing phone number',
          replydesk_last_updated: new Date().toISOString()
        })
        .eq('id', lead.id);

      throw error;
    }

    const phoneClean = lead.phone.replace(/\D/g, '');
    if (phoneClean.length < 10) {
      const error = new Error(`Lead ${lead.name} has invalid phone number: ${lead.phone}`);
      error.code = 'INVALID_PHONE';

      await supabase
        .from('leads')
        .update({
          replydesk_status: 'failed',
          replydesk_error: 'Invalid phone format',
          replydesk_last_updated: new Date().toISOString()
        })
        .eq('id', lead.id);

      throw error;
    }

    // Generate booking code if missing
    if (!lead.booking_code) {
      const code = await generateBookingCode(lead.name);
      await supabase
        .from('leads')
        .update({ booking_code: code })
        .eq('id', lead.id);
      lead.booking_code = code;
    }

    // Build Alex booking link
    const bookingDomain = process.env.BOOKING_DOMAIN || 'www.example.com';
    const bookingIdentifier = lead.booking_code || lead.id;
    const bookingLink = `https://${bookingDomain}/book-alex/${bookingIdentifier}`;

    const notes = lead.notes?.trim() || `Lead from ${lead.source || 'CRM'}`;
    const notesWithBooking = `${notes}\n\nBooking link: ${bookingLink}\nCRM Lead ID: ${lead.id}`;

    // Format phone to E.164 (ReplyDesk requires +44... format)
    let formattedPhone = lead.phone.trim().replace(/\s+/g, '');
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '+44' + formattedPhone.substring(1);
    } else if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+44' + formattedPhone;
    }

    const payload = {
      name: lead.name?.trim() || 'Unknown',
      phone: formattedPhone,
      email: lead.email?.trim() || undefined,
      gender: lead.gender || undefined,
      age: lead.age ? String(lead.age) : undefined,
      postcode: lead.postcode && lead.postcode !== 'ZZGHOST' ? lead.postcode : undefined,
      source: lead.source || 'Auralndn CRM',
      notes: notesWithBooking
    };

    const apiKey = process.env.REPLYDESK_API_KEY;
    if (!apiKey) {
      throw new Error('REPLYDESK_API_KEY not configured');
    }

    const baseUrl = process.env.REPLYDESK_INBOUND_URL || 'https://replydesk.co.uk/api/webhook/inbound';

    console.log('Sending lead to ReplyDesk:', { name: lead.name, id: lead.id, phone: lead.phone });

    const response = await axios.post(`${baseUrl}/${apiKey}`, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000
    });

    console.log('Lead sent to ReplyDesk successfully:', response.data);

    const updateResult = await supabase
      .from('leads')
      .update({
        replydesk_lead_id: response.data.lead_id || null,
        replydesk_lead_code: response.data.lead_code || null,
        replydesk_sent_at: new Date().toISOString(),
        replydesk_status: 'New',
        replydesk_error: null,
        replydesk_last_updated: new Date().toISOString()
      })
      .eq('id', lead.id)
      .select();

    if (updateResult.error) {
      console.error('Error updating lead after sending to ReplyDesk:', updateResult.error);
      if (updateResult.error.message?.includes('column') && updateResult.error.message?.includes('does not exist')) {
        throw new Error('Database schema missing ReplyDesk columns. Please run: server/migrations/add_replydesk_tracking_columns.sql');
      }
      throw updateResult.error;
    }

    if (global.io) {
      global.io.emit('replydesk_queue_update', {
        action: 'added',
        leadId: lead.id,
        leadName: lead.name,
        timestamp: new Date().toISOString()
      });
    }

    return response.data;
  } catch (error) {
    const errorDetails = {
      leadId: lead.id,
      leadName: lead.name,
      error: error.message,
      code: error.code,
      status: error.response?.status,
      responseData: error.response?.data
    };

    console.error('Failed to send lead to ReplyDesk:', JSON.stringify(errorDetails, null, 2));

    if (error.code !== 'MISSING_PHONE' && error.code !== 'INVALID_PHONE') {
      await supabase
        .from('leads')
        .update({
          replydesk_status: 'failed',
          replydesk_error: error.response?.data?.details || error.response?.data?.message || error.message,
          replydesk_last_updated: new Date().toISOString()
        })
        .eq('id', lead.id);
    }

    throw error;
  }
}

/**
 * POST /api/replydesk-webhook/trigger/:leadId
 * Manually send a lead to ReplyDesk (authenticated CRM user)
 */
router.post('/trigger/:leadId', auth, async (req, res) => {
  try {
    const { leadId } = req.params;

    if (process.env.REPLYDESK_ENABLED === 'false') {
      return res.status(503).json({
        success: false,
        message: 'ReplyDesk integration is currently disabled'
      });
    }

    const { data: lead, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (error || !lead) {
      return res.status(404).json({ success: false, message: 'Lead not found' });
    }

    const result = await sendLeadToReplyDesk(lead);

    res.json({
      success: true,
      message: `Lead "${lead.name}" sent to ReplyDesk successfully`,
      replydesk_lead_id: result.lead_id,
      replydesk_lead_code: result.lead_code
    });
  } catch (error) {
    console.error('Error triggering ReplyDesk:', error.response?.data || error.message);
    const replyDeskError = error.response?.data?.details || error.response?.data?.error;
    const statusCode = error.code === 'MISSING_PHONE' || error.code === 'INVALID_PHONE' ? 400 : 500;
    res.status(statusCode).json({
      success: false,
      message: replyDeskError
        ? `ReplyDesk rejected the lead: ${replyDeskError}`
        : error.message
    });
  }
});

/**
 * POST /api/replydesk-webhook/update
 * Receive status updates FROM ReplyDesk
 */
router.post('/update', async (req, res) => {
  try {
    // Validate webhook secret FIRST before processing anything
    const expectedSecret = process.env.REPLYDESK_WEBHOOK_SECRET;
    if (!expectedSecret) {
      console.error('REPLYDESK_WEBHOOK_SECRET not configured — rejecting webhook');
      return res.status(500).json({ success: false, message: 'Webhook authentication not configured' });
    }
    const receivedSecret = req.headers['x-webhook-secret'] || req.query.secret;
    if (receivedSecret !== expectedSecret) {
      return res.status(401).json({ success: false, message: 'Invalid webhook secret' });
    }

    const payload = req.body;

    // Store for debugging (only after auth passes)
    recentWebhooks.unshift({
      timestamp: new Date().toISOString(),
      payload,
      headers: { 'content-type': req.headers['content-type'] }
    });
    if (recentWebhooks.length > MAX_STORED_WEBHOOKS) {
      recentWebhooks.pop();
    }

    const { lead_id, lead_code, status, conversation_summary, crm_id, booking_date, booking_time } = payload;

    // Find lead by ReplyDesk lead_id, lead_code, or CRM ID embedded in notes
    let lead;
    if (crm_id) {
      const { data } = await supabase.from('leads').select('*').eq('id', crm_id).single();
      lead = data;
    }
    if (!lead && lead_id) {
      const { data } = await supabase.from('leads').select('*').eq('replydesk_lead_id', lead_id).single();
      lead = data;
    }
    if (!lead && lead_code) {
      const { data } = await supabase.from('leads').select('*').eq('replydesk_lead_code', lead_code).single();
      lead = data;
    }

    if (!lead) {
      console.warn('ReplyDesk webhook: Could not find matching lead', { lead_id, lead_code, crm_id });
      return res.status(404).json({ success: false, message: 'Lead not found in CRM' });
    }

    // Update lead with new status
    const updateData = {
      replydesk_last_updated: new Date().toISOString()
    };

    if (status) updateData.replydesk_status = status;
    if (conversation_summary) updateData.replydesk_conversation_summary = conversation_summary;
    updateData.replydesk_error = null;

    // If status is Booked and booking info provided, update CRM booking
    if (status === 'Booked' && booking_date && booking_time) {
      const { data: bookedLeads } = await supabase
        .from('leads')
        .select('id, time_booked, booking_slot')
        .eq('date_booked', booking_date)
        .in('status', ['Booked', 'Confirmed'])
        .neq('id', lead.id)
        .neq('postcode', 'ZZGHOST');

      const { data: blockedSlots } = await supabase
        .from('blocked_slots')
        .select('date, time_slot, slot_number')
        .eq('date', booking_date);

      const slotNumber = findFirstAvailableSlotNumber(bookedLeads, blockedSlots, booking_time);

      updateData.status = 'Booked';
      updateData.date_booked = booking_date;
      updateData.time_booked = booking_time;
      updateData.booking_slot = slotNumber;
      updateData.booked_at = new Date().toISOString();
      updateData.ever_booked = true;
      updateData.is_confirmed = false;
    }

    const { error: updateError } = await supabase
      .from('leads')
      .update(updateData)
      .eq('id', lead.id);

    if (updateError) {
      console.error('Error updating lead from webhook:', updateError);
      return res.status(500).json({ success: false, message: 'Failed to update lead' });
    }

    // Emit socket events
    if (global.io) {
      global.io.emit('replydesk_status_update', {
        leadId: lead.id,
        leadName: lead.name,
        status,
        timestamp: new Date().toISOString()
      });
      global.io.emit('replydesk_queue_update', {
        action: 'updated',
        leadId: lead.id,
        leadName: lead.name,
        status,
        timestamp: new Date().toISOString()
      });

      if (status === 'Human_Required') {
        global.io.emit('replydesk_human_required', {
          leadId: lead.id,
          leadName: lead.name,
          summary: conversation_summary,
          timestamp: new Date().toISOString()
        });
      }
    }

    console.log(`ReplyDesk webhook: Updated lead ${lead.name} to status ${status}`);

    res.json({ success: true, message: 'Lead updated' });
  } catch (error) {
    console.error('Error processing ReplyDesk webhook:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/replydesk-webhook/health
 */
router.get('/health', auth, (req, res) => {
  res.json({
    status: 'ok',
    enabled: process.env.REPLYDESK_ENABLED !== 'false',
    hasApiKey: !!process.env.REPLYDESK_API_KEY,
    hasCalendarApiKey: !!process.env.REPLYDESK_CALENDAR_API_KEY,
    hasWebhookSecret: !!process.env.REPLYDESK_WEBHOOK_SECRET,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/replydesk-webhook/debug
 */
router.get('/debug', auth, (req, res) => {
  res.json({
    recentWebhooks,
    config: {
      enabled: process.env.REPLYDESK_ENABLED !== 'false',
      baseUrl: process.env.REPLYDESK_INBOUND_URL || 'https://replydesk.co.uk/api/webhook/inbound',
      hasApiKey: !!process.env.REPLYDESK_API_KEY,
      bookingDomain: process.env.BOOKING_DOMAIN || 'www.example.com'
    }
  });
});

module.exports = { router, sendLeadToReplyDesk };
