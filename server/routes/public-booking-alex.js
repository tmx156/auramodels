const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const MessagingService = require('../utils/messagingService');
const { ALL_TIME_SLOTS, getAvailableSlots, findFirstAvailableSlotNumber } = require('../utils/calendarConstants');

const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey || config.supabase.anonKey
);

let DEFAULT_BOOKER_ID = '00000000-0000-0000-0000-000000000001';
async function initDefaultBooker() {
  try {
    const { data } = await supabase.from('users').select('id').eq('id', DEFAULT_BOOKER_ID).single();
    if (!data) {
      console.warn('Alex Booking: Default booker not found');
      DEFAULT_BOOKER_ID = null;
    }
  } catch (err) {
    console.warn('Alex Booking: Could not verify default booker:', err.message);
  }
}
initDefaultBooker();

async function findLeadByIdentifier(identifier, selectFields = '*') {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
  let query = supabase.from('leads').select(selectFields);
  if (isUUID) {
    query = query.eq('id', identifier);
  } else {
    query = query.ilike('booking_code', identifier);
  }
  const { data: lead, error } = await query.single();
  return { lead, error };
}

/**
 * GET /api/public/booking-alex/lead/:identifier
 */
router.get('/lead/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    const { lead, error } = await findLeadByIdentifier(identifier, 'id, name, email, phone, booking_code');

    if (error || !lead) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found. Please check your link and try again.'
      });
    }

    res.json(lead);
  } catch (error) {
    console.error('Error fetching lead:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/public/booking-alex/availability
 */
router.get('/availability', async (req, res) => {
  try {
    const { start, end } = req.query;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDate = start || today.toISOString().split('T')[0];
    const endDate = end || new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data: bookedLeads, error: bookedError } = await supabase
      .from('leads')
      .select('date_booked, time_booked, status')
      .gte('date_booked', startDate)
      .lte('date_booked', endDate)
      .in('status', ['Booked', 'Confirmed'])
      .neq('postcode', 'ZZGHOST');

    if (bookedError) console.error('Error fetching booked leads:', bookedError);

    const { data: blockedSlots, error: blockedError } = await supabase
      .from('blocked_slots')
      .select('date, time_slot, slot_number')
      .gte('date', startDate)
      .lte('date', endDate);

    if (blockedError) console.error('Error fetching blocked slots:', blockedError);

    const bookingsByDate = {};
    (bookedLeads || []).forEach(lead => {
      if (lead.date_booked && lead.time_booked) {
        const dateStr = lead.date_booked.split('T')[0];
        if (!bookingsByDate[dateStr]) bookingsByDate[dateStr] = [];
        bookingsByDate[dateStr].push(lead.time_booked);
      }
    });

    const blockedByDate = {};
    const fullDayBlocks = new Set();
    (blockedSlots || []).forEach(block => {
      const dateStr = block.date.split('T')[0];
      if (!blockedByDate[dateStr]) blockedByDate[dateStr] = [];
      if (block.time_slot && block.slot_number) {
        blockedByDate[dateStr].push(block.time_slot);
      } else if (block.time_slot && !block.slot_number) {
        for (let i = 0; i < 4; i++) blockedByDate[dateStr].push(block.time_slot);
      } else if (!block.time_slot && block.slot_number) {
        ALL_TIME_SLOTS.forEach(s => blockedByDate[dateStr].push(s.time));
      } else {
        fullDayBlocks.add(dateStr);
      }
    });

    const availability = [];
    const currentDate = new Date(startDate);
    const endDateObj = new Date(endDate);

    while (currentDate <= endDateObj) {
      const dateStr = currentDate.toISOString().split('T')[0];
      const dayOfWeek = currentDate.getDay();

      if (dayOfWeek === 0 || dayOfWeek === 6) {
        const bookedTimes = bookingsByDate[dateStr] || [];
        const blockedTimes = blockedByDate[dateStr] || [];
        const isFullyBlocked = fullDayBlocks.has(dateStr);

        availability.push({
          date: dateStr,
          available: !isFullyBlocked,
          bookedTimes: [...bookedTimes, ...blockedTimes]
        });
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    res.json(availability);
  } catch (error) {
    console.error('Error fetching availability:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/public/booking-alex/slots/:date
 * Get detailed slot availability for a specific date (with 4-slot awareness)
 */
router.get('/slots/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const slots = await getAvailableSlots(date, supabase);
    res.json({ date, slots });
  } catch (error) {
    console.error('Error fetching slots:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * POST /api/public/booking-alex/book/:identifier
 */
router.post('/book/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    const { date, time, name, email } = req.body;

    if (!date || !time) {
      return res.status(400).json({ success: false, message: 'Date and time are required' });
    }

    const { lead, error: leadError } = await findLeadByIdentifier(identifier);
    if (leadError || !lead) {
      return res.status(404).json({
        success: false,
        message: 'Booking not found. Please check your link and try again.'
      });
    }

    const leadId = lead.id;

    // Check availability with 4-slot awareness
    const { data: bookedLeads } = await supabase
      .from('leads')
      .select('id, time_booked, booking_slot')
      .eq('date_booked', date)
      .in('status', ['Booked', 'Confirmed'])
      .neq('id', leadId)
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

    if (name && name !== lead.name) updateData.name = name;
    if (email && email !== lead.email) updateData.email = email;
    if (lead.replydesk_sent_at) updateData.replydesk_status = 'Booked';

    const { data: updatedLead, error: updateError } = await supabase
      .from('leads')
      .update(updateData)
      .eq('id', leadId)
      .select()
      .single();

    // Double-booking guard: verify no one else took this exact slot while we were writing
    const { data: conflicts } = await supabase
      .from('leads')
      .select('id')
      .eq('date_booked', date)
      .eq('time_booked', time)
      .eq('booking_slot', slotNumber)
      .in('status', ['Booked', 'Confirmed'])
      .neq('id', leadId);

    if (conflicts && conflicts.length > 0) {
      await supabase.from('leads').update({ status: 'New', date_booked: null, time_booked: null, booking_slot: null, is_confirmed: false }).eq('id', leadId);
      return res.status(409).json({ success: false, message: 'This time slot was just taken. Please select another time.' });
    }

    if (updateError) {
      console.error('Error updating lead:', updateError);
      return res.status(500).json({ success: false, message: 'Failed to create booking' });
    }

    // Add booking history
    try {
      const { data: currentLead } = await supabase
        .from('leads')
        .select('booking_history')
        .eq('id', leadId)
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
        performedByName: 'Client (Alex Booking)',
        details: {
          date, time, slotNumber,
          source: 'alex_booking_page',
          clientUpdatedName: name && name !== lead.name ? { from: lead.name, to: name } : null,
          clientUpdatedEmail: email && email !== lead.email ? { from: lead.email, to: email } : null
        }
      });

      await supabase
        .from('leads')
        .update({ booking_history: currentHistory })
        .eq('id', leadId);
    } catch (historyError) {
      console.error('Error adding booking history:', historyError);
    }

    // Send booking confirmation using existing template
    try {
      const bookingDate = new Date(`${date}T${time}:00Z`);
      await MessagingService.sendBookingConfirmation(
        leadId,
        DEFAULT_BOOKER_ID,
        bookingDate.toISOString(),
        { sendEmail: true, sendSms: true, templateId: 'template-1772086713575-19rl3l5xz' }
      );
    } catch (confirmError) {
      console.error('Error sending booking confirmation:', confirmError);
    }

    if (global.io) {
      global.io.emit('lead_updated', {
        leadId, type: 'booking_created',
        booking: { date, time }
      });
    }

    console.log(`Alex booking created: ${updatedLead.name} on ${date} at ${time}`);

    res.json({
      success: true,
      message: 'Booking confirmed successfully',
      booking: { date, time, leadId }
    });
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
