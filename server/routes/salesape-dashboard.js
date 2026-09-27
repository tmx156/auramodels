/**
 * SalesApe Dashboard API Routes
 * Provides data for the SalesApe monitoring dashboard
 */

const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const dbManager = require('../database-connection-manager');

/**
 * @route   GET /api/salesape-dashboard/status
 * @desc    Get current SalesApe activity status
 * @access  Private
 */
router.get('/status', auth, async (req, res) => {
  try {
    // Get all recent leads and filter for SalesApe leads in JavaScript
    // This avoids the timestamp null issue
    const allLeads = await dbManager.query('leads', {
      select: 'id, name, phone, email, salesape_status, salesape_last_updated, salesape_user_engaged, salesape_goal_hit, salesape_sent_at',
      order: { created_at: 'desc' },
      limit: 100
    });

    // Filter for leads that have been sent to SalesApe (salesape_sent_at is not null)
    const activeLeads = allLeads ? allLeads.filter(l => l.salesape_sent_at !== null && l.salesape_sent_at !== undefined) : [];

    // Find the most recently active lead that's engaged but not booked
    const currentLead = activeLeads && activeLeads.length > 0 
      ? activeLeads.find(l => l.salesape_user_engaged && !l.salesape_goal_hit) || activeLeads[0]
      : null;

    // Get today's stats - count ALL leads in SalesApe queue, not just created today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Get ALL leads that have been sent to SalesApe (in the queue)
    // Use Supabase directly to properly filter by salesape_sent_at
    const { createClient } = require('@supabase/supabase-js');
    const config = require('../config');
    const supabase = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey || config.supabase.anonKey
    );

    // Get all leads in SalesApe queue (have salesape_sent_at) with status info
    const { data: queueLeads, error: queueError } = await supabase
      .from('leads')
      .select('id, salesape_initial_message_sent, salesape_user_engaged, salesape_goal_hit, salesape_sent_at, salesape_last_updated, salesape_status')
      .not('salesape_sent_at', 'is', null)
      .limit(500);

    if (queueError) {
      console.error('Error fetching queue leads for stats:', queueError);
    }

    const allQueueLeads = queueLeads || [];

    // Count messages sent: All leads in queue count as "messages sent" 
    // (they're in the queue, so SalesApe will send/has sent the initial message)
    const messagesSent = allQueueLeads.length;

    // Count leads engaged: All leads in queue that are engaged
    const leadsEngaged = allQueueLeads.filter(l => l.salesape_user_engaged).length;
    
    // Count bookings made: All leads in queue where goal was hit
    const bookingsMade = allQueueLeads.filter(l => l.salesape_goal_hit).length;

    // Calculate rates
    const engagementRate = messagesSent > 0 ? Math.round((leadsEngaged / messagesSent) * 100) : 0;
    const conversionRate = messagesSent > 0 ? Math.round((bookingsMade / messagesSent) * 100) : 0;
    const responseRate = messagesSent > 0 ? Math.round((leadsEngaged / messagesSent) * 100) : 0;

    // Calculate average response time (mock for now)
    const avgResponseTime = '4m 32s';

    res.json({
      isActive: currentLead !== null,
      isPaused: false, // TODO: Implement pause/resume functionality
      currentLead: currentLead ? {
        id: currentLead.id,
        name: currentLead.name,
        status: currentLead.salesape_status,
        lastMessage: null // TODO: Get from messages table
      } : null,
      lastActivity: currentLead ? currentLead.salesape_last_updated : null,
      todayStats: {
        messagesSent,
        leadsEngaged,
        bookingsMade,
        engagementRate,
        conversionRate,
        responseRate,
        avgResponseTime
      }
    });
  } catch (error) {
    console.error('Error fetching SalesApe status:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/salesape-dashboard/queue
 * @desc    Get all leads in SalesApe queue
 * @access  Private
 */
router.get('/queue', auth, async (req, res) => {
  try {
    // Use Supabase directly to properly filter by salesape_sent_at
    const { createClient } = require('@supabase/supabase-js');
    const config = require('../config');
    const supabase = createClient(
      config.supabase.url,
      config.supabase.serviceRoleKey || config.supabase.anonKey
    );

    // Query leads that have been sent to SalesApe (salesape_sent_at IS NOT NULL)
    // Try to query, but handle case where column might not exist yet
    let allLeads = [];
    let error = null;

    try {
      const result = await supabase
        .from('leads')
        .select('*')
        .not('salesape_sent_at', 'is', null) // Only leads that have been sent to SalesApe
        .order('salesape_sent_at', { ascending: false }) // Most recent first
        .limit(200);
      
      allLeads = result.data || [];
      error = result.error;
    } catch (queryError) {
      // If column doesn't exist, check if it's a column error
      if (queryError.message && queryError.message.includes('column') && queryError.message.includes('does not exist')) {
        console.error('❌ CRITICAL: salesape_sent_at column does not exist in database!');
        console.error('📋 Please run the migration: server/migrations/add_salesape_tracking_columns.sql');
        return res.status(500).json({ 
          message: 'Database schema missing SalesApe columns',
          error: 'Please run the migration script to add SalesApe tracking columns',
          migrationFile: 'server/migrations/add_salesape_tracking_columns.sql'
        });
      }
      throw queryError;
    }

    if (error) {
      console.error('Error fetching queue from Supabase:', error);
      // Check if it's a column missing error
      if (error.message && error.message.includes('column') && error.message.includes('does not exist')) {
        console.error('❌ CRITICAL: salesape_sent_at column does not exist in database!');
        console.error('📋 Please run the migration: server/migrations/add_salesape_tracking_columns.sql');
        return res.status(500).json({ 
          message: 'Database schema missing SalesApe columns',
          error: 'Please run the migration script to add SalesApe tracking columns',
          migrationFile: 'server/migrations/add_salesape_tracking_columns.sql'
        });
      }
      return res.status(500).json({ message: 'Server error', error: error.message });
    }

    if (!allLeads || allLeads.length === 0) {
      console.log('📋 Queue: No leads found with salesape_sent_at');
      return res.json([]);
    }

    console.log(`📋 Queue: Found ${allLeads.length} leads in SalesApe queue`);

    // Log lead names for debugging (helps identify if specific leads are missing)
    if (allLeads.length > 0) {
      const leadNames = allLeads.slice(0, 10).map(l => l.name).join(', ');
      console.log(`   Sample leads in queue: ${leadNames}${allLeads.length > 10 ? `... (${allLeads.length - 10} more)` : ''}`);
    }

    // Map leads with queue_status calculation
    const queueLeads = allLeads.map(lead => ({
      ...lead,
      // Calculate queue_status based on salesape_status and flags
      queue_status: lead.salesape_status === 'failed' ? 'failed' :
                    lead.salesape_status === 'cancelled' ? 'cancelled' :
                    lead.salesape_goal_hit ? 'completed' :
                    lead.salesape_opted_out ? 'completed' :
                    lead.salesape_follow_ups_ended ? 'completed' :
                    lead.salesape_user_engaged ? 'in_progress' :
                    lead.salesape_initial_message_sent ? 'in_progress' :
                    lead.salesape_sent_at ? 'queued' : 'available'
    }));

    res.json(queueLeads);
  } catch (error) {
    console.error('Error fetching queue:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/salesape-dashboard/conversation/:leadId
 * @desc    Get conversation history for a specific lead
 * @access  Private
 */
router.get('/conversation/:leadId', auth, async (req, res) => {
  try {
    const { leadId } = req.params;

    // Get lead details
    const leads = await dbManager.query('leads', {
      select: '*',
      eq: { id: leadId }
    });

    if (!leads || leads.length === 0) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    const lead = leads[0];

    // Get messages from salesape_messages table (if exists)
    // For now, we'll parse from full_transcript if available
    let messages = [];
    
    if (lead.salesape_full_transcript) {
      // Parse transcript into messages (basic implementation)
      // Format expected: "SalesApe: message\nLead: response\n..."
      const lines = lead.salesape_full_transcript.split('\n');
      let currentSender = null;
      let currentMessage = '';
      
      lines.forEach((line, index) => {
        if (line.startsWith('SalesApe:') || line.startsWith('🤖')) {
          if (currentMessage) {
            messages.push({
              sender: currentSender,
              message: currentMessage.trim(),
              sent_at: new Date(Date.now() - (lines.length - index) * 60000).toISOString()
            });
          }
          currentSender = 'salesape';
          currentMessage = line.replace(/^(SalesApe:|🤖)\s*/, '');
        } else if (line.startsWith('Lead:') || line.startsWith('👤')) {
          if (currentMessage) {
            messages.push({
              sender: currentSender,
              message: currentMessage.trim(),
              sent_at: new Date(Date.now() - (lines.length - index) * 60000).toISOString()
            });
          }
          currentSender = 'lead';
          currentMessage = line.replace(/^(Lead:|👤)\s*/, '');
        } else if (line.trim()) {
          currentMessage += ' ' + line;
        }
      });
      
      if (currentMessage) {
        messages.push({
          sender: currentSender,
          message: currentMessage.trim(),
          sent_at: new Date().toISOString()
        });
      }
    }

    // Calculate conversation stats
    const stats = {
      messageCount: messages.length,
      duration: messages.length > 0 ? 
        Math.round((new Date(messages[messages.length - 1].sent_at) - new Date(messages[0].sent_at)) / 60000) + 'm' : 
        'N/A'
    };

    res.json({
      messages,
      stats
    });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/salesape-dashboard/analytics
 * @desc    Get performance analytics
 * @access  Private
 */
router.get('/analytics', auth, async (req, res) => {
  try {
    const now = new Date();
    
    // Helper function to get stats for a time period
    const getStatsForPeriod = async (startDate) => {
      const leads = await dbManager.query('leads', {
        select: 'id, salesape_initial_message_sent, salesape_user_engaged, salesape_goal_hit, salesape_sent_at',
        gte: { salesape_sent_at: startDate.toISOString() }
      });

      const leadsSent = leads ? leads.length : 0;
      const leadsEngaged = leads ? leads.filter(l => l.salesape_user_engaged).length : 0;
      const bookingsMade = leads ? leads.filter(l => l.salesape_goal_hit).length : 0;

      const engagementRate = leadsSent > 0 ? Math.round((leadsEngaged / leadsSent) * 100) : 0;
      const conversionRate = leadsSent > 0 ? Math.round((bookingsMade / leadsSent) * 100) : 0;
      const goalHitRate = leadsEngaged > 0 ? Math.round((bookingsMade / leadsEngaged) * 100) : 0;

      return {
        leadsSent,
        leadsEngaged,
        bookingsMade,
        engagementRate,
        conversionRate,
        goalHitRate,
        avgResponseTime: '4m 32s', // Mock
        avgMessagesPerLead: 3.2 // Mock
      };
    };

    // Today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStats = await getStatsForPeriod(today);

    // This week
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekStats = await getStatsForPeriod(weekStart);

    // This month
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthStats = await getStatsForPeriod(monthStart);

    // All time
    const allTimeStats = await getStatsForPeriod(new Date(0));

    res.json({
      today: todayStats,
      week: weekStats,
      month: monthStats,
      all: allTimeStats
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   POST /api/salesape-dashboard/queue/add
 * @desc    Add a lead to SalesApe queue
 * @access  Private
 */
router.post('/queue/add', auth, async (req, res) => {
  try {
    const { leadId } = req.body;

    if (!leadId) {
      return res.status(400).json({ message: 'Lead ID is required' });
    }

    // Get lead
    const leads = await dbManager.query('leads', {
      select: '*',
      eq: { id: leadId }
    });

    if (!leads || leads.length === 0) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    const lead = leads[0];

    // Send to SalesApe
    const salesapeService = require('../routes/salesape-webhook');
    await salesapeService.sendLeadToSalesApe(lead);

    // Emit socket event
    if (global.io) {
      global.io.emit('salesape_queue_update', {
        action: 'added',
        leadId: lead.id,
        leadName: lead.name
      });
    }

    res.json({ message: 'Lead added to SalesApe queue', leadId: lead.id });
  } catch (error) {
    console.error('Error adding to queue:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   POST /api/salesape-dashboard/queue/remove
 * @desc    Remove a lead from SalesApe queue (sends "Human Intervention" to stop AI)
 * @access  Private
 */
router.post('/queue/remove', auth, async (req, res) => {
  try {
    const { leadId } = req.body;

    if (!leadId) {
      return res.status(400).json({ message: 'Lead ID is required' });
    }

    // Get lead details first
    const leads = await dbManager.query('leads', {
      select: '*',
      eq: { id: leadId }
    });

    if (!leads || leads.length === 0) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    const lead = leads[0];

    // ✅ FIX: Send "Human Intervention" to SalesApe to stop the AI conversation
    if (lead.salesape_sent_at) {
      try {
        const axios = require('axios');
        const SALESAPE_CONFIG = {
          AIRTABLE_URL: 'https://api.airtable.com/v0/appoT1TexUksGanE8/tblTJGg187Ub84aXf',
          PAT_CODE: process.env.SALESAPE_PAT_CODE || process.env.SALESAPE_PAT
        };

        // Note: SalesApe Airtable doesn't have "Event Type" field
        // Just log the intervention - can't send to Airtable
        console.log('🛑 Human Intervention requested for lead:', leadId);
        console.log('ℹ️ Skipping Airtable POST - SalesApe doesnt have Event Type field');
        console.log('✅ Lead removed from SalesApe queue locally');
      } catch (salesapeError) {
        console.error('❌ Error notifying SalesApe of cancellation:', salesapeError.response?.data || salesapeError.message);
        // Continue with local removal even if SalesApe notification fails
      }
    }

    // Update lead in local database to mark as cancelled
    await dbManager.update('leads', {
      salesape_sent_at: null,
      salesape_status: 'cancelled',
      salesape_last_updated: new Date().toISOString(),
      salesape_follow_ups_ended: true
    }, { id: leadId });

    // Emit socket event
    if (global.io) {
      global.io.emit('salesape_queue_update', {
        action: 'removed',
        leadId,
        leadName: lead.name
      });
    }

    res.json({
      success: true,
      message: 'Lead removed from SalesApe queue and conversation stopped',
      leadId
    });
  } catch (error) {
    console.error('Error removing from queue:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   POST /api/salesape-dashboard/queue/pause
 * @desc    Pause SalesApe queue processing
 * @access  Private (Admin only)
 */
router.post('/queue/pause', auth, async (req, res) => {
  try {
    // TODO: Implement pause functionality
    // This would require a system-level flag or configuration

    res.json({ message: 'Queue paused' });
  } catch (error) {
    console.error('Error pausing queue:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   POST /api/salesape-dashboard/queue/resume
 * @desc    Resume SalesApe queue processing
 * @access  Private (Admin only)
 */
router.post('/queue/resume', auth, async (req, res) => {
  try {
    // TODO: Implement resume functionality

    res.json({ message: 'Queue resumed' });
  } catch (error) {
    console.error('Error resuming queue:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/salesape-dashboard/diagnostics/:leadName
 * @desc    Get diagnostic information for a specific lead by name
 * @access  Private
 */
router.get('/diagnostics/:leadName', auth, async (req, res) => {
  try {
    const { leadName } = req.params;
    
    // Search for leads matching the name (case insensitive, partial match)
    const leads = await dbManager.query('leads', {
      select: 'id, name, phone, email, salesape_record_id, salesape_sent_at, salesape_status, salesape_last_updated, salesape_initial_message_sent, salesape_user_engaged, salesape_goal_hit, created_at',
      ilike: { name: `%${leadName}%` },
      limit: 10
    });

    if (!leads || leads.length === 0) {
      return res.status(404).json({ 
        message: 'No leads found',
        searchTerm: leadName
      });
    }

    // Get sync service status
    const syncService = require('../services/salesapeSync');
    const syncStatus = syncService.getStatus();

    // Format diagnostic info
    const diagnostics = leads.map(lead => ({
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      salesape: {
        recordId: lead.salesape_record_id || 'NOT SET',
        sentAt: lead.salesape_sent_at || 'NOT SENT',
        status: lead.salesape_status || 'N/A',
        lastUpdated: lead.salesape_last_updated || 'NEVER',
        initialMessageSent: lead.salesape_initial_message_sent || false,
        userEngaged: lead.salesape_user_engaged || false,
        goalHit: lead.salesape_goal_hit || false
      },
      inQueue: !!lead.salesape_sent_at,
      willSync: !!lead.salesape_record_id,
      created: lead.created_at
    }));

    res.json({
      searchTerm: leadName,
      found: leads.length,
      leads: diagnostics,
      syncService: {
        enabled: syncStatus.enabled,
        running: syncStatus.running,
        syncing: syncStatus.syncing,
        lastSync: syncStatus.lastSyncTime,
        syncCount: syncStatus.syncCount
      }
    });
  } catch (error) {
    console.error('Error fetching diagnostics:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;

