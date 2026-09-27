/**
 * Stats API - Optimized Version
 * 
 * This is a cleaned-up version of the stats API with unified filtering logic.
 * It ensures that the Stats API and Leads API use the exact same filtering logic.
 */

const express = require('express');
const { auth } = require('../middleware/auth');
const { getSupabaseClient } = require('../config/supabase-client');
const { 
  filterLeads,
  STATUS_FILTER_CONFIG 
} = require('../utils/leadFilters');

const supabase = getSupabaseClient();
const router = express.Router();

/**
 * Get lead counts by status
 * GET /api/stats/leads
 */
router.get('/leads', auth, async (req, res) => {
  try {
    const { 
      created_at_start, created_at_end,
      assigned_at_start, assigned_at_end,
      booked_at_start, booked_at_end,
      date_start, date_end
    } = req.query;

    // Determine date range
    let dateRange = null;
    if (date_start && date_end) {
      dateRange = { start: date_start, end: date_end };
    } else if (assigned_at_start && assigned_at_end) {
      dateRange = { start: assigned_at_start, end: assigned_at_end };
    } else if (booked_at_start && booked_at_end) {
      dateRange = { start: booked_at_start, end: booked_at_end };
    } else if (created_at_start && created_at_end) {
      dateRange = { start: created_at_start, end: created_at_end };
    }

    const hasDateFilter = !!dateRange;

    console.log(`📊 Fetching lead counts${hasDateFilter ? ` for date range: ${dateRange.start} to ${dateRange.end}` : ''}`);

    // Fetch all leads (same as leads API)
    const leads = [];
    let from = 0;
    const batchSize = 1000;

    while (true) {
      let query = supabase
        .from('leads')
        .select('status, custom_fields, call_status, booker_id, booking_status, has_sale, assigned_at, booked_at, date_booked, booking_history, created_at')
        .neq('postcode', 'ZZGHOST')
        .range(from, from + batchSize - 1);

      // Role-based filtering (same as leads API)
      if (req.user.role !== 'admin') {
        query = query.eq('booker_id', req.user.id).neq('status', 'Rejected');
      }

      const { data, error } = await query;
      
      if (error) throw error;
      if (!data || data.length === 0) break;
      
      leads.push(...data);
      from += batchSize;
      
      if (data.length < batchSize) break;
    }

    console.log(`📊 Total leads fetched: ${leads.length}`);

    // Calculate counts using the SAME filter logic as the Leads API
    const result = {
      total: leads.length,
      new: filterLeads(leads, 'New', dateRange).length,
      assigned: filterLeads(leads, 'Assigned', dateRange).length,
      booked: filterLeads(leads, 'Booked', dateRange).length,
      attended: filterLeads(leads, 'Attended', dateRange).length,
      attendedFilter: filterLeads(leads, 'Attended', dateRange).filter(l => l.booker_id).length,
      cancelled: filterLeads(leads, 'Cancelled', dateRange).length,
      cancelledFilter: filterLeads(leads, 'Cancelled', dateRange).filter(l => l.booker_id).length,
      noShow: filterLeads(leads, 'No Show', dateRange).filter(l => l.booker_id).length,
      rejected: filterLeads(leads, 'Rejected', dateRange).length,
      noAnswerCall: filterLeads(leads, 'No answer', dateRange).length,
      noAnswerX2: filterLeads(leads, 'No Answer x2', dateRange).length,
      noAnswerX3: filterLeads(leads, 'No Answer x3', dateRange).length,
      leftMessage: filterLeads(leads, 'Left Message', dateRange).length,
      notInterestedCall: filterLeads(leads, 'Not interested', dateRange).length,
      callBack: filterLeads(leads, 'Call back', dateRange).length,
      wrongNumber: filterLeads(leads, 'Wrong number', dateRange).length,
      salesConverted: filterLeads(leads, 'Sales', dateRange).filter(l => l.booker_id).length,
      notQualified: filterLeads(leads, 'Not Qualified', dateRange).length,
      inProgress: filterLeads(leads, 'In Progress', dateRange).length
    };

    console.log('📊 Lead counts:', {
      total: result.total,
      assigned: result.assigned,
      booked: result.booked,
      attended: result.attendedFilter,
      cancelled: result.cancelledFilter,
      sales: result.salesConverted
    });

    res.json(result);

  } catch (error) {
    console.error('❌ Lead stats error:', error);
    res.status(500).json({ 
      message: 'Server error',
      error: error.message 
    });
  }
});

module.exports = router;
