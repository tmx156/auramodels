const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

const router = express.Router();
// Use anon key for read operations (RLS allows everyone to view)
const supabase = createClient(config.supabase.url, config.supabase.anonKey);
// Use service role key for admin operations (bypasses RLS)
const supabaseAdmin = createClient(config.supabase.url, config.supabase.serviceRoleKey || config.supabase.anonKey);

// @route   GET /api/blocked-slots
// @desc    Get all blocked slots (optionally filtered by date range)
// @access  Private (All users can view blocked slots for booking validation)
router.get('/', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    let query = supabase
      .from('blocked_slots')
      .select('*')
      .order('date', { ascending: true })
      .order('time_slot', { ascending: true });

    // Apply date range filter if provided
    if (start_date) {
      query = query.gte('date', start_date);
    }
    if (end_date) {
      query = query.lte('date', end_date);
    }

    const { data: blockedSlots, error } = await query;

    if (error) {
      console.error('Error fetching blocked slots:', error);
      return res.status(500).json({ message: 'Error fetching blocked slots', error: error.message });
    }

    console.log(`✅ Fetched ${blockedSlots.length} blocked slots`);
    res.json(blockedSlots);
  } catch (error) {
    console.error('Get blocked slots error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/blocked-slots
// @desc    Create a new blocked slot
// @access  Admin only
router.post('/', auth, adminAuth, async (req, res) => {
  try {
    const { date, time_slot, slot_number, reason } = req.body;

    // Validation
    if (!date) {
      return res.status(400).json({ message: 'Date is required' });
    }

    // Validate slot_number if provided
    if (slot_number && ![1, 2, 3, 4].includes(slot_number)) {
      return res.status(400).json({ message: 'slot_number must be 1, 2, 3, or 4' });
    }

    // Check if this exact block already exists (use admin client to bypass RLS)
    let existingQuery = supabaseAdmin
      .from('blocked_slots')
      .select('id')
      .eq('date', date);

    if (time_slot) {
      existingQuery = existingQuery.eq('time_slot', time_slot);
    } else {
      existingQuery = existingQuery.is('time_slot', null);
    }

    if (slot_number) {
      existingQuery = existingQuery.eq('slot_number', slot_number);
    } else {
      existingQuery = existingQuery.is('slot_number', null);
    }

    const { data: existing } = await existingQuery;

    if (existing && existing.length > 0) {
      return res.status(409).json({
        message: 'This slot is already blocked',
        existing: existing[0]
      });
    }

    // Create the blocked slot (use admin client to bypass RLS)
    const { data: blockedSlot, error } = await supabaseAdmin
      .from('blocked_slots')
      .insert([{
        date,
        time_slot: time_slot || null,
        slot_number: slot_number || null,
        reason: reason || 'Unavailable',
        created_by: req.user.id
      }])
      .select()
      .single();

    if (error) {
      console.error('Error creating blocked slot:', error);
      return res.status(500).json({ message: 'Error creating blocked slot', error: error.message });
    }

    console.log(`✅ Admin ${req.user.name} blocked slot:`, {
      date,
      time_slot: time_slot || 'full day',
      slot_number: slot_number || 'all',
      reason
    });

    res.status(201).json(blockedSlot);
  } catch (error) {
    console.error('Create blocked slot error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/blocked-slots/bulk
// @desc    Block multiple slots at once (useful for blocking entire days or week)
// @access  Admin only
router.post('/bulk', auth, adminAuth, async (req, res) => {
  try {
    const { dates, time_slot, slot_number, reason } = req.body;

    // Validation
    if (!dates || !Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({ message: 'dates array is required' });
    }

    // Validate slot_number if provided
    if (slot_number && ![1, 2, 3, 4].includes(slot_number)) {
      return res.status(400).json({ message: 'slot_number must be 1, 2, 3, or 4' });
    }

    // Create blocked slots for all dates (use admin client to bypass RLS)
    const blockedSlots = dates.map(date => ({
      date,
      time_slot: time_slot || null,
      slot_number: slot_number || null,
      reason: reason || 'Unavailable',
      created_by: req.user.id
    }));

    const { data, error } = await supabaseAdmin
      .from('blocked_slots')
      .insert(blockedSlots)
      .select();

    if (error) {
      console.error('Error creating bulk blocked slots:', error);
      return res.status(500).json({ message: 'Error creating blocked slots', error: error.message });
    }

    console.log(`✅ Admin ${req.user.name} blocked ${data.length} slots`);
    res.status(201).json(data);
  } catch (error) {
    console.error('Bulk create blocked slots error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/blocked-slots/:id
// @desc    Delete a blocked slot
// @access  Admin only
router.delete('/:id', auth, adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // First get the blocked slot details for logging (use admin client to bypass RLS)
    const { data: blockedSlot } = await supabaseAdmin
      .from('blocked_slots')
      .select('*')
      .eq('id', id)
      .single();

    const { error } = await supabaseAdmin
      .from('blocked_slots')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting blocked slot:', error);
      return res.status(500).json({ message: 'Error deleting blocked slot', error: error.message });
    }

    console.log(`✅ Admin ${req.user.name} unblocked slot:`, {
      date: blockedSlot?.date,
      time_slot: blockedSlot?.time_slot || 'full day',
      slot_number: blockedSlot?.slot_number || 'all'
    });

    res.json({ message: 'Blocked slot deleted successfully' });
  } catch (error) {
    console.error('Delete blocked slot error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/blocked-slots/by-date
// @desc    Delete blocked slots by date and optional time/slot filters
// @access  Admin only
router.delete('/by-date/:date', auth, adminAuth, async (req, res) => {
  try {
    const { date } = req.params;
    const { time_slot, slot_number } = req.query;

    let deleteQuery = supabaseAdmin
      .from('blocked_slots')
      .delete()
      .eq('date', date);

    if (time_slot) {
      deleteQuery = deleteQuery.eq('time_slot', time_slot);
    }
    if (slot_number) {
      deleteQuery = deleteQuery.eq('slot_number', parseInt(slot_number));
    }

    const { error } = await deleteQuery;

    if (error) {
      console.error('Error deleting blocked slots:', error);
      return res.status(500).json({ message: 'Error deleting blocked slots', error: error.message });
    }

    console.log(`✅ Admin ${req.user.name} unblocked slots for date ${date}`);
    res.json({ message: 'Blocked slots deleted successfully' });
  } catch (error) {
    console.error('Delete blocked slots by date error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/blocked-slots/check
// @desc    Check if a specific slot is blocked
// @access  Private
router.get('/check', async (req, res) => {
  try {
    const { date, time_slot, slot_number } = req.query;

    if (!date) {
      return res.status(400).json({ message: 'date is required' });
    }

    // Check for blocked slots
    let query = supabase
      .from('blocked_slots')
      .select('*')
      .eq('date', date);

    // A slot is blocked if:
    // 1. Full day is blocked (time_slot is NULL)
    // 2. The specific time slot is blocked (time_slot matches)
    const { data: blockedSlots, error } = await query;

    if (error) {
      console.error('Error checking blocked slots:', error);
      return res.status(500).json({ message: 'Error checking blocked slots', error: error.message });
    }

    // Check if blocked
    const isBlocked = blockedSlots.some(block => {
      // Full day block
      if (!block.time_slot) {
        // If slot_number specified in block, check if it matches
        if (block.slot_number && slot_number) {
          return parseInt(block.slot_number) === parseInt(slot_number);
        }
        // No slot_number in block means all slots blocked
        return true;
      }

      // Specific time slot block
      if (time_slot && block.time_slot === time_slot) {
        // If slot_number specified in block, check if it matches
        if (block.slot_number && slot_number) {
          return parseInt(block.slot_number) === parseInt(slot_number);
        }
        // No slot_number in block means all slots blocked
        return true;
      }

      return false;
    });

    res.json({
      isBlocked,
      blockedSlots: isBlocked ? blockedSlots.filter(block => {
        if (!block.time_slot) return true;
        return time_slot && block.time_slot === time_slot;
      }) : []
    });
  } catch (error) {
    console.error('Check blocked slot error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
