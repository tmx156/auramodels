const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

// @route   GET /api/callback-reminders/test
// @desc    Test endpoint to manually trigger callback reminder check
// @access  Private (Admin only)
router.get('/test', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const CallbackReminderService = require('../services/callbackReminderService');
    const service = new CallbackReminderService();
    
    // Manually trigger the check
    await service.checkDueCallbacks();
    
    res.json({ 
      success: true, 
      message: 'Callback reminder check executed manually',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in test endpoint:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   GET /api/callback-reminders/debug
// @desc    Debug endpoint to see pending callbacks
// @access  Private
router.get('/debug', auth, async (req, res) => {
  try {
    const now = new Date();
    const futureDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Next 24 hours

    const { data: reminders, error } = await supabase
      .from('callback_reminders')
      .select(`
        *,
        leads:lead_id (
          id,
          name,
          phone
        )
      `)
      .eq('user_id', req.user.id)
      .eq('status', 'pending')
      .gte('callback_time', now.toISOString())
      .lte('callback_time', futureDate.toISOString())
      .order('callback_time', { ascending: true });

    if (error) {
      return res.status(500).json({ message: 'Database error', error: error.message });
    }

    // Format for display
    const formatted = (reminders || []).map(r => ({
      id: r.id,
      leadName: r.leads?.name || 'Unknown',
      callbackTimeUTC: r.callback_time,
      callbackTimeUK: new Date(r.callback_time).toLocaleString('en-GB', {
        timeZone: 'Europe/London',
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: 'short'
      }),
      note: r.callback_note,
      status: r.status,
      created: r.created_at
    }));

    res.json({
      success: true,
      count: formatted.length,
      reminders: formatted,
      currentTimeUTC: now.toISOString(),
      currentTimeUK: now.toLocaleString('en-GB', { timeZone: 'Europe/London' })
    });
  } catch (error) {
    console.error('Error in debug endpoint:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   PATCH /api/callback-reminders/:id/complete
// @desc    Mark a callback reminder as completed
// @access  Private
router.patch('/:id/complete', auth, async (req, res) => {
  try {
    const reminderId = req.params.id;
    console.log(`✅ Complete request for callback ${reminderId} by user ${req.user.id}`);

    // Check if the reminder exists and belongs to this user
    const { data: reminders, error: fetchError } = await supabase
      .from('callback_reminders')
      .select('*')
      .eq('id', reminderId);

    if (fetchError) {
      console.error('Error fetching callback reminder:', fetchError);
      return res.status(500).json({ message: 'Database error', error: fetchError.message });
    }

    if (!reminders || reminders.length === 0) {
      return res.status(404).json({ message: 'Callback reminder not found' });
    }

    const reminder = reminders[0];

    if (reminder.user_id !== req.user.id) {
      return res.status(403).json({ message: 'You can only complete your own callback reminders' });
    }

    // Mark as completed
    const { error: updateError } = await supabase
      .from('callback_reminders')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', reminderId);

    if (updateError) {
      console.error('Error completing callback reminder:', updateError);
      return res.status(500).json({ message: 'Failed to complete callback reminder' });
    }

    console.log(`✅ Callback reminder ${reminderId} marked complete by user ${req.user.id}`);
    res.json({ success: true, message: 'Callback reminder marked as complete' });
  } catch (error) {
    console.error('Error completing callback reminder:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @route   DELETE /api/callback-reminders/:id
// @desc    Delete a callback reminder (user can only delete their own)
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const reminderId = req.params.id;
    console.log(`🗑️ Delete request for callback ${reminderId} by user ${req.user.id}`);

    // First check if the reminder exists and belongs to this user
    const { data: reminders, error: fetchError } = await supabase
      .from('callback_reminders')
      .select('*')
      .eq('id', reminderId);

    if (fetchError) {
      console.error('Error fetching callback reminder:', fetchError);
      return res.status(500).json({ message: 'Database error', error: fetchError.message });
    }

    if (!reminders || reminders.length === 0) {
      console.log(`🗑️ Callback ${reminderId} not found`);
      return res.status(404).json({ message: 'Callback reminder not found' });
    }

    const reminder = reminders[0];

    // Check ownership - user can only delete their own callbacks
    if (reminder.user_id !== req.user.id) {
      console.log(`🗑️ User ${req.user.id} tried to delete callback owned by ${reminder.user_id}`);
      return res.status(403).json({ message: 'You can only delete your own callback reminders' });
    }

    // Delete the reminder
    const { error: deleteError } = await supabase
      .from('callback_reminders')
      .delete()
      .eq('id', reminderId);

    if (deleteError) {
      console.error('Error deleting callback reminder:', deleteError);
      return res.status(500).json({ message: 'Failed to delete callback reminder' });
    }

    console.log(`🗑️ Callback reminder ${reminderId} deleted by user ${req.user.id}`);

    res.json({ success: true, message: 'Callback reminder deleted' });
  } catch (error) {
    console.error('Error deleting callback reminder:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;

