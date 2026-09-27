/**
 * Leads API - Optimized Version
 * 
 * This is a cleaned-up version of the leads API with unified filtering logic.
 * It ensures that the Leads API and Stats API use the exact same filtering logic.
 */

const express = require('express');
const { auth } = require('../middleware/auth');
const { getSupabaseClient } = require('../config/supabase-client');
const { 
  filterLeads, 
  getSqlDateColumn,
  STATUS_FILTER_CONFIG
} = require('../utils/leadFilters');

const supabase = getSupabaseClient();
const router = express.Router();

/**
 * Fetch leads with filtering
 * GET /api/leads
 */
router.get('/', auth, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      status, 
      booker, 
      search,
      created_at_start,
      created_at_end,
      assigned_at_start,
      assigned_at_end,
      booked_at_start,
      booked_at_end,
      status_changed_at_start,
      status_changed_at_end
    } = req.query;

    const pageInt = Math.max(parseInt(page) || 1, 1);
    const limitInt = Math.min(parseInt(limit) || 50, 100);
    const from = (pageInt - 1) * limitInt;
    const to = from + limitInt - 1;

    console.log(`🔍 Fetching leads - Status: ${status || 'all'}, Page: ${pageInt}, Limit: ${limitInt}`);

    // Determine date range for filtering
    let dateRange = null;
    const sqlDateColumn = status ? getSqlDateColumn(status) : null;
    
    if (sqlDateColumn === 'created_at' && created_at_start && created_at_end) {
      dateRange = { start: created_at_start, end: created_at_end };
    } else if (sqlDateColumn === 'assigned_at' && assigned_at_start && assigned_at_end) {
      dateRange = { start: assigned_at_start, end: assigned_at_end };
    } else if (sqlDateColumn === 'booked_at' && booked_at_start && booked_at_end) {
      dateRange = { start: booked_at_start, end: booked_at_end };
    } else if (status_changed_at_start && status_changed_at_end) {
      // For booking_history filtering - no SQL filter, JS filter only
      dateRange = { start: status_changed_at_start, end: status_changed_at_end };
    }

    // Build base query
    let query = supabase
      .from('leads')
      .select('id, name, phone, email, postcode, age, gender, image_url, booker_id, created_by_user_id, updated_by_user_id, status, date_booked, is_confirmed, is_double_confirmed, booking_status, has_sale, created_at, assigned_at, booked_at, custom_fields, call_status, review_date, review_time, review_slot, lead_source, entry_date, booking_history', { count: 'exact' })
      .order('created_at', { ascending: false })
      .neq('postcode', 'ZZGHOST');

    // Role-based filtering
    if (req.user.role === 'admin' || req.user.role === 'viewer') {
      // Admins and viewers see all leads
    } else if (req.user.role === 'photographer') {
      query = query.in('status', ['Booked', 'Attended', 'Sale']);
    } else {
      // Bookers see only their assigned leads
      query = query.eq('booker_id', req.user.id).neq('status', 'Rejected');
    }

    // Apply status-specific SQL filters
    if (status && status !== 'all') {
      const config = STATUS_FILTER_CONFIG[status];
      
      if (config) {
        switch (config.type) {
          case 'simple':
            if (status === 'Rejected') {
              query = query.eq('status', 'Rejected');
            } else {
              query = query.eq('status', config.statusMatch[0]);
              if (status === 'Assigned' && req.user.role !== 'admin') {
                query = query.is('call_status', null);
              }
            }
            break;
            
          case 'special':
            // For special statuses, we need to fetch and filter in JS
            // Don't apply status filter in SQL
            break;
            
          case 'call_status':
            // For call statuses, we need to fetch and filter in JS
            // Don't apply status filter in SQL
            break;
            
          case 'has_sale':
            query = query.eq('has_sale', 1);
            break;
        }
      }
    }

    // Apply booker filter
    if (booker) {
      query = query.eq('booker_id', booker);
    }

    // Apply search filter
    if (search && search.trim()) {
      const term = search.trim().replace(/[%_\\]/g, '\\$&');
      const like = `%${term}%`;
      query = query.or([
        `name.ilike.${like}`,
        `phone.ilike.${like}`,
        `parent_phone.ilike.${like}`,
        `email.ilike.${like}`,
        `postcode.ilike.${like}`
      ].join(','));
    }

    // Apply SQL date filter (only for non-booking_history columns)
    if (sqlDateColumn && dateRange) {
      query = query.gte(sqlDateColumn, dateRange.start).lte(sqlDateColumn, dateRange.end);
    }

    // For complex filters (special statuses, call statuses), fetch all and filter in JS
    const needsJsFiltering = status && 
      status !== 'all' && 
      ['special', 'call_status'].includes(STATUS_FILTER_CONFIG[status]?.type);

    let leads;
    let totalCount;

    if (needsJsFiltering) {
      // Fetch all leads (with pagination bypass)
      console.log(`📊 Using JS filtering for status: ${status}`);
      
      const allLeads = [];
      let fetchFrom = 0;
      const batchSize = 1000;
      
      while (true) {
        const batchQuery = query.range(fetchFrom, fetchFrom + batchSize - 1);
        const { data, error } = await batchQuery;
        
        if (error) throw error;
        if (!data || data.length === 0) break;
        
        allLeads.push(...data);
        fetchFrom += batchSize;
        
        if (data.length < batchSize) break;
      }
      
      // Filter in JavaScript
      const filtered = filterLeads(allLeads, status, dateRange);
      totalCount = filtered.length;
      
      // Paginate the filtered results
      leads = filtered.slice(from, to + 1);
      
      console.log(`📊 JS filtered: ${allLeads.length} → ${filtered.length}, showing ${leads.length}`);
    } else {
      // Simple query with SQL filtering
      query = query.range(from, to);
      const { data, error, count } = await query;
      
      if (error) throw error;
      
      leads = data || [];
      totalCount = count || 0;
    }

    // Fetch booker info
    const bookerIds = [...new Set(leads.map(l => l.booker_id).filter(Boolean))];
    let usersMap = {};
    
    if (bookerIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, name, email')
        .in('id', bookerIds);
      
      if (users) {
        users.forEach(u => { usersMap[u.id] = u; });
      }
    }

    // Transform leads
    const transformedLeads = leads.map(lead => ({
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      postcode: lead.postcode,
      age: lead.age,
      gender: lead.gender,
      image_url: lead.image_url,
      status: lead.status,
      date_booked: lead.date_booked,
      is_confirmed: lead.is_confirmed,
      is_double_confirmed: lead.is_double_confirmed,
      booking_status: lead.booking_status,
      has_sale: lead.has_sale,
      created_at: lead.created_at,
      assigned_at: lead.assigned_at,
      booked_at: lead.booked_at,
      lead_source: lead.lead_source,
      custom_fields: lead.custom_fields,
      call_status: lead.call_status,
      booker: lead.booker_id && usersMap[lead.booker_id] ? {
        id: usersMap[lead.booker_id].id,
        name: usersMap[lead.booker_id].name,
        email: usersMap[lead.booker_id].email
      } : null
    }));

    console.log(`✅ Returning ${transformedLeads.length} leads (total: ${totalCount})`);

    res.json({
      leads: transformedLeads,
      totalPages: Math.max(1, Math.ceil(totalCount / limitInt)),
      currentPage: pageInt,
      total: totalCount,
      limit: limitInt
    });

  } catch (error) {
    console.error('❌ Get leads error:', error);
    res.status(500).json({ 
      message: 'Server error',
      error: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

module.exports = router;
