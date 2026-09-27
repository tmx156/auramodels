const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const replydeskAuth = require('../middleware/replydeskAuth');
const MessagingService = require('../utils/messagingService');
const { ALL_TIME_SLOTS, getAvailableSlots, findFirstAvailableSlotNumber } = require('../utils/calendarConstants');

const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey || config.supabase.anonKey
);

const LOCATION = '129A Weedington Rd, London NW5 4NX';

let DEFAULT_BOOKER_ID = '00000000-0000-0000-0000-000000000001';
async function initDefaultBooker() {
  try {
    const { data } = await supabase.from('users').select('id').eq('id', DEFAULT_BOOKER_ID).single();
    if (!data) {
      console.warn('Calendar API: Default booker not found');
      DEFAULT_BOOKER_ID = null;
    }
  } catch (err) {
    console.warn('Calendar API: Could not verify default booker:', err.message);
  }
}
initDefaultBooker();

/**
 * GET /api/calendar/available-slots
 * Returns available time slots for ReplyDesk's Alex to present to leads
 */
router.get('/available-slots', replydeskAuth, async (req, res) => {
  try {
    const { date, days, from, to } = req.query;

    const startDate = date || from;
    if (!startDate) {
      return res.status(400).json({
        success: false,
        message: 'date or from parameter is required (YYYY-MM-DD format)'
      });
    }

    let numDays;
    if (to) {
      const fromMs = new Date(startDate).getTime();
      const toMs = new Date(to).getTime();
      numDays = Math.min(Math.ceil((toMs - fromMs) / (24 * 60 * 60 * 1000)) + 1, 30);
    } else {
      numDays = Math.min(parseInt(days) || 1, 30);
    }

    const results = [];
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);

    for (let i = 0; i < numDays; i++) {
      const currentDate = new Date(startYear, startMonth - 1, startDay + i);
      const dayOfWeek = currentDate.getDay();

      if (dayOfWeek !== 0 && dayOfWeek !== 6) continue;

      const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
      const slots = await getAvailableSlots(dateStr, supabase);

      const availableSlots = slots
        .filter(s => s.available > 0)
        .map((s, idx) => ({
          id: `slot_${dateStr.replace(/-/g, '')}_${s.time.replace(':', '')}`,
          date: dateStr,
          time: s.time,
          duration: s.duration,
          available: true,
          spots_remaining: s.available
        }));

      if (availableSlots.length > 0) {
        results.push({
          date: dateStr,
          slots: availableSlots
        });
      }
    }

    res.json({
      success: true,
      location: LOCATION,
      dates: results
    });
  } catch (error) {
    console.error('Error fetching available slots:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/calendar/book
 * Books a specific slot for a lead
 */
router.post('/book', replydeskAuth, async (req, res) => {
  try {
    const { slot_id, notes, lead_id } = req.body;
    const lead_name = req.body.lead_name || req.body.name;
    const lead_phone = req.body.lead_phone || req.body.phone;
    const lead_email = req.body.lead_email || req.body.email;

    if (!lead_phone && !lead_id) {
      return res.status(400).json({
        success: false,
        message: 'phone or lead_id is required'
      });
    }

    let date, time;
    if (slot_id) {
      const parts = slot_id.replace('slot_', '').split('_');
      if (parts.length === 2) {
        const d = parts[0];
        const t = parts[1];
        date = `${d.substring(0, 4)}-${d.substring(4, 6)}-${d.substring(6, 8)}`;
        time = `${t.substring(0, 2)}:${t.substring(2, 4)}`;
      }
    }

    if (!date || !time) {
      date = req.body.date;
      time = req.body.time;
    }

    if (!date || !time) {
      return res.status(400).json({
        success: false,
        message: 'Valid slot_id or date+time is required'
      });
    }

    // Find lead by ID or phone
    let lead;
    if (lead_id) {
      const { data } = await supabase.from('leads').select('*').eq('id', lead_id).single();
      lead = data;
    }
    if (!lead && lead_phone) {
      const cleanPhone = lead_phone.replace(/\D/g, '').slice(-10);
      const { data: leads } = await supabase
        .from('leads')
        .select('*')
        .or(`phone.ilike.%${cleanPhone}`)
        .limit(1);
      lead = leads?.[0];
    }

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found in CRM'
      });
    }

    // Check availability
    const { data: bookedLeads } = await supabase
      .from('leads')
      .select('id, time_booked, booking_slot')
      .eq('date_booked', date)
      .in('status', ['Booked', 'Confirmed'])
      .neq('id', lead.id)
      .neq('postcode', 'ZZGHOST');

    const { data: blockedSlots } = await supabase
      .from('blocked_slots')
      .select('date, time_slot, slot_number')
      .eq('date', date);

    const slotNumber = findFirstAvailableSlotNumber(bookedLeads, blockedSlots, time);

    if (slotNumber === null) {
      return res.status(409).json({
        success: false,
        message: 'This time slot is no longer available. Please select another time.'
      });
    }

    // Create booking
    const updateData = {
      status: 'Booked',
      date_booked: date,
      time_booked: time,
      booking_slot: slotNumber,
      booked_at: new Date().toISOString(),
      ever_booked: true,
      is_confirmed: false,
      updated_at: new Date().toISOString(),
    };
    if (DEFAULT_BOOKER_ID) updateData.booker_id = DEFAULT_BOOKER_ID;

    if (lead_name && lead_name !== lead.name) updateData.name = lead_name;
    if (lead_email && lead_email !== lead.email) updateData.email = lead_email;
    if (lead.replydesk_sent_at) updateData.replydesk_status = 'Booked';

    const { data: updatedLead, error: updateError } = await supabase
      .from('leads')
      .update(updateData)
      .eq('id', lead.id)
      .select()
      .single();

    // Double-booking guard
    const { data: conflicts } = await supabase
      .from('leads')
      .select('id')
      .eq('date_booked', date)
      .eq('time_booked', time)
      .eq('booking_slot', slotNumber)
      .in('status', ['Booked', 'Confirmed'])
      .neq('id', lead.id);

    if (conflicts && conflicts.length > 0) {
      await supabase.from('leads').update({ status: 'New', date_booked: null, time_booked: null, booking_slot: null, is_confirmed: false }).eq('id', lead.id);
      return res.status(409).json({ success: false, message: 'This time slot was just taken.' });
    }

    if (updateError) {
      console.error('Error booking slot:', updateError);
      return res.status(500).json({ success: false, message: 'Failed to create booking' });
    }

    // Add booking history
    try {
      const { data: currentLead } = await supabase
        .from('leads')
        .select('booking_history')
        .eq('id', lead.id)
        .single();

      let currentHistory = [];
      if (currentLead?.booking_history) {
        try {
          currentHistory = typeof currentLead.booking_history === 'string'
            ? JSON.parse(currentLead.booking_history)
            : Array.isArray(currentLead.booking_history) ? currentLead.booking_history : [];
        } catch { currentHistory = []; }
      }

      currentHistory.push({
        action: 'BOOKING_CREATED',
        timestamp: new Date().toISOString(),
        performedBy: null,
        performedByName: 'Alex A.I',
        details: {
          date, time, slotNumber,
          source: 'replydesk_calendar_api',
          notes: notes || null
        }
      });

      await supabase
        .from('leads')
        .update({ booking_history: currentHistory })
        .eq('id', lead.id);
    } catch (historyError) {
      console.error('Error adding booking history:', historyError);
    }

    // Send booking confirmation using existing template
    try {
      const bookingDate = new Date(`${date}T${time}:00Z`);
      await MessagingService.sendBookingConfirmation(
        lead.id,
        DEFAULT_BOOKER_ID,
        bookingDate.toISOString(),
        { sendEmail: true, sendSms: true, templateId: 'template-1772086713575-19rl3l5xz' }
      );
    } catch (confirmError) {
      console.error('Error sending booking confirmation:', confirmError);
    }

    // Emit socket event
    if (global.io) {
      global.io.emit('lead_updated', {
        leadId: lead.id,
        type: 'booking_created',
        booking: { date, time }
      });
      global.io.emit('replydesk_queue_update', {
        action: 'booked',
        leadId: lead.id,
        leadName: updatedLead.name,
        timestamp: new Date().toISOString()
      });
    }

    const bookingId = `BK-${date.replace(/-/g, '')}-${String(slotNumber).padStart(3, '0')}`;

    res.status(201).json({
      success: true,
      booking_id: bookingId,
      confirmed_date: date,
      confirmed_time: time,
      location: LOCATION
    });
  } catch (error) {
    console.error('Error booking slot:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * DELETE /api/calendar/book/:bookingId
 * Cancels an existing booking
 */
router.delete('/book/:bookingId', replydeskAuth, async (req, res) => {
  try {
    const { bookingId } = req.params;

    // bookingId could be our lead ID or the BK-YYYYMMDD-NNN format
    let lead;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingId);

    if (isUUID) {
      const { data } = await supabase.from('leads').select('*').eq('id', bookingId).single();
      lead = data;
    } else {
      // Parse BK-YYYYMMDD-NNN format
      const match = bookingId.match(/^BK-(\d{4})(\d{2})(\d{2})-(\d{3})$/);
      if (match) {
        const date = `${match[1]}-${match[2]}-${match[3]}`;
        const slotNum = parseInt(match[4]);
        const { data: leads } = await supabase
          .from('leads')
          .select('*')
          .eq('date_booked', date)
          .eq('booking_slot', slotNum)
          .in('status', ['Booked', 'Confirmed'])
          .limit(1);
        lead = leads?.[0];
      }
    }

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const cancelData = {
      status: 'Cancelled',
      date_booked: null,
      time_booked: null,
      booking_slot: null,
      is_confirmed: false,
      updated_at: new Date().toISOString()
    };
    if (lead.replydesk_sent_at) {
      cancelData.replydesk_status = 'cancelled';
      cancelData.replydesk_last_updated = new Date().toISOString();
    }

    const { error: updateError } = await supabase
      .from('leads')
      .update(cancelData)
      .eq('id', lead.id);

    if (updateError) {
      return res.status(500).json({ success: false, message: 'Failed to cancel booking' });
    }

    // Add cancellation history
    try {
      const { data: currentLead } = await supabase
        .from('leads')
        .select('booking_history')
        .eq('id', lead.id)
        .single();

      let currentHistory = [];
      if (currentLead?.booking_history) {
        try {
          currentHistory = typeof currentLead.booking_history === 'string'
            ? JSON.parse(currentLead.booking_history)
            : Array.isArray(currentLead.booking_history) ? currentLead.booking_history : [];
        } catch { currentHistory = []; }
      }

      currentHistory.push({
        action: 'BOOKING_CANCELLED',
        timestamp: new Date().toISOString(),
        performedBy: null,
        performedByName: 'Alex A.I',
        details: {
          previousDate: lead.date_booked,
          previousTime: lead.time_booked,
          source: 'replydesk_calendar_api'
        }
      });

      await supabase
        .from('leads')
        .update({ booking_history: currentHistory })
        .eq('id', lead.id);
    } catch (historyError) {
      console.error('Error adding cancellation history:', historyError);
    }

    if (global.io) {
      global.io.emit('lead_updated', {
        leadId: lead.id,
        type: 'booking_cancelled'
      });
    }

    res.json({ success: true, message: 'Booking cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
