/**
 * SalesAPE API Integration Routes
 * 
 * These endpoints allow SalesAPE to:
 * - GET leads from our CRM
 * - POST/PUT leads to our CRM
 * - Read/Write custom fields
 * 
 * Authentication: API Key via middleware
 */

const express = require('express');
const router = express.Router();
const salesapeAuth = require('../middleware/salesapeAuth');
const dbManager = require('../database-connection-manager');
const { createClient } = require('@supabase/supabase-js');
const salesapeService = require('../utils/salesapeService');

// Supabase configuration - use centralized config
const config = require('../config');
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey || config.supabase.anonKey);

// Alex A.I user ID (fixed UUID)
const ALEX_AI_USER_ID = '00000000-0000-0000-0000-000000000001';

/**
 * @route   GET /api/salesape/leads
 * @desc    Get leads (SalesAPE can read leads from CRM)
 * @access  SalesAPE API Key
 */
router.get('/leads', salesapeAuth, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      status, 
      search,
      created_at_start,
      created_at_end,
      updated_since // For syncing only updated leads
    } = req.query;

    // Validate and cap limit
    const validatedLimit = Math.min(parseInt(limit) || 50, 100);
    const pageInt = Math.max(parseInt(page) || 1, 1);
    const from = (pageInt - 1) * validatedLimit;
    const to = from + validatedLimit - 1;

    // Build query
    let query = supabase
      .from('leads')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    // Filter out ghost bookings
    query = query.neq('postcode', 'ZZGHOST');

    // Apply filters
    if (status) {
      query = query.eq('status', status);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,parent_phone.ilike.%${search}%,email.ilike.%${search}%`);
    }

    if (created_at_start) {
      query = query.gte('created_at', created_at_start);
    }

    if (created_at_end) {
      query = query.lte('created_at', created_at_end);
    }

    // For syncing: get leads updated since a certain time
    if (updated_since) {
      query = query.gte('updated_at', updated_since);
    }

    const { data: leads, error, count } = await query;

    if (error) {
      console.error('SalesAPE GET leads error:', error);
      return res.status(500).json({ 
        message: 'Error fetching leads',
        error: error.message
      });
    }

    console.log(`✅ SalesAPE: Retrieved ${leads?.length || 0} leads (total: ${count})`);

    res.json({
      success: true,
      data: leads || [],
      pagination: {
        page: pageInt,
        limit: validatedLimit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / validatedLimit)
      }
    });
  } catch (error) {
    console.error('SalesAPE GET leads error:', error);
    res.status(500).json({ 
      message: 'Server error',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/salesape/leads/:id
 * @desc    Get single lead by ID
 * @access  SalesAPE API Key
 */
router.get('/leads/:id', salesapeAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: lead, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ 
          message: 'Lead not found',
          error: 'Lead with this ID does not exist'
        });
      }
      console.error('SalesAPE GET lead error:', error);
      return res.status(500).json({ 
        message: 'Error fetching lead',
        error: error.message
      });
    }

    res.json({
      success: true,
      data: lead
    });
  } catch (error) {
    console.error('SalesAPE GET lead error:', error);
    res.status(500).json({ 
      message: 'Server error',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/salesape/leads
 * @desc    Create new lead (SalesAPE can create leads in CRM)
 * @access  SalesAPE API Key
 */
router.post('/leads', salesapeAuth, async (req, res) => {
  try {
    const leadData = req.body;

    // Map SalesAPE fields to our CRM structure
    const mappedLead = {
      name: leadData.name || leadData.full_name || leadData.contact_name,
      phone: leadData.phone || leadData.phone_number || leadData.mobile,
      email: leadData.email || leadData.email_address,
      postcode: leadData.postcode || leadData.postal_code || leadData.zip,
      age: leadData.age ? parseInt(leadData.age) : null,
      notes: leadData.notes || leadData.qualification_notes || leadData.comments || '',
      status: leadData.status || 'New',
      date_booked: leadData.date_booked || leadData.appointment_date || null,
      time_booked: leadData.time_booked || leadData.appointment_time || null,
      // Store SalesAPE metadata
      salesape_id: leadData.salesape_id || leadData.id,
      salesape_qualified: leadData.qualified || false,
      salesape_conversation_id: leadData.conversation_id || null,
      // Custom fields (stored in notes or as JSON)
      custom_fields: leadData.custom_fields ? JSON.stringify(leadData.custom_fields) : null
    };

    // Remove null/undefined values
    Object.keys(mappedLead).forEach(key => {
      if (mappedLead[key] === null || mappedLead[key] === undefined) {
        delete mappedLead[key];
      }
    });

    // Check for duplicates (by phone or email)
    if (mappedLead.phone || mappedLead.email) {
      let duplicateQuery = supabase.from('leads').select('id, name, phone, email');

      if (mappedLead.phone) {
        duplicateQuery = duplicateQuery.eq('phone', mappedLead.phone);
      } else if (mappedLead.email) {
        duplicateQuery = duplicateQuery.eq('email', mappedLead.email);
      }

      const { data: existingLeads } = await duplicateQuery;

      if (existingLeads && existingLeads.length > 0) {
        console.log(`⚠️ SalesAPE: Duplicate lead detected - ${mappedLead.name} (${mappedLead.phone || mappedLead.email})`);
        // Return existing lead instead of creating duplicate
        return res.json({
          success: true,
          data: existingLeads[0],
          duplicate: true,
          message: 'Lead already exists'
        });
      }
    }

    // Insert lead
    const { data: newLead, error } = await supabase
      .from('leads')
      .insert([mappedLead])
      .select()
      .single();

    if (error) {
      console.error('SalesAPE POST lead error:', error);
      return res.status(500).json({ 
        message: 'Error creating lead',
        error: error.message
      });
    }

    console.log(`✅ SalesAPE: Created new lead - ${newLead.name} (ID: ${newLead.id})`);

    res.status(201).json({
      success: true,
      data: newLead,
      message: 'Lead created successfully'
    });
  } catch (error) {
    console.error('SalesAPE POST lead error:', error);
    res.status(500).json({ 
      message: 'Server error',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/salesape/leads/:id
 * @desc    Update existing lead (SalesAPE can update leads in CRM)
 * @access  SalesAPE API Key
 */
router.put('/leads/:id', salesapeAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Map SalesAPE fields to our CRM structure
    const mappedUpdate = {};

    if (updateData.name || updateData.full_name) mappedUpdate.name = updateData.name || updateData.full_name;
    if (updateData.phone || updateData.phone_number) mappedUpdate.phone = updateData.phone || updateData.phone_number;
    if (updateData.email || updateData.email_address) mappedUpdate.email = updateData.email || updateData.email_address;
    if (updateData.postcode || updateData.postal_code) mappedUpdate.postcode = updateData.postcode || updateData.postal_code;
    if (updateData.age !== undefined) mappedUpdate.age = parseInt(updateData.age);
    if (updateData.notes || updateData.qualification_notes) {
      mappedUpdate.notes = updateData.notes || updateData.qualification_notes;
    }
    if (updateData.status) mappedUpdate.status = updateData.status;
    if (updateData.date_booked || updateData.appointment_date) {
      mappedUpdate.date_booked = updateData.date_booked || updateData.appointment_date;
    }
    if (updateData.time_booked || updateData.appointment_time) {
      mappedUpdate.time_booked = updateData.time_booked || updateData.appointment_time;
    }

    // Update SalesAPE metadata
    if (updateData.salesape_id || updateData.id) {
      mappedUpdate.salesape_id = updateData.salesape_id || updateData.id;
    }
    if (updateData.qualified !== undefined) {
      mappedUpdate.salesape_qualified = updateData.qualified;
    }
    if (updateData.conversation_id) {
      mappedUpdate.salesape_conversation_id = updateData.conversation_id;
    }
    if (updateData.custom_fields) {
      mappedUpdate.custom_fields = JSON.stringify(updateData.custom_fields);
    }

    // Always update updated_at timestamp
    mappedUpdate.updated_at = new Date().toISOString();

    // Update lead
    const { data: updatedLead, error } = await supabase
      .from('leads')
      .update(mappedUpdate)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ 
          message: 'Lead not found',
          error: 'Lead with this ID does not exist'
        });
      }
      console.error('SalesAPE PUT lead error:', error);
      return res.status(500).json({ 
        message: 'Error updating lead',
        error: error.message
      });
    }

    console.log(`✅ SalesAPE: Updated lead - ${updatedLead.name} (ID: ${updatedLead.id})`);

    res.json({
      success: true,
      data: updatedLead,
      message: 'Lead updated successfully'
    });
  } catch (error) {
    console.error('SalesAPE PUT lead error:', error);
    res.status(500).json({ 
      message: 'Server error',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/salesape/fields
 * @desc    Get available fields and custom fields for leads
 * @access  SalesAPE API Key
 */
router.get('/fields', salesapeAuth, async (req, res) => {
  try {
    // Return schema information about lead fields
    const fields = {
      standard_fields: [
        { name: 'id', type: 'uuid', required: false, description: 'Unique lead identifier' },
        { name: 'name', type: 'string', required: true, description: 'Lead full name' },
        { name: 'phone', type: 'string', required: false, description: 'Contact phone number' },
        { name: 'email', type: 'string', required: false, description: 'Contact email address' },
        { name: 'postcode', type: 'string', required: false, description: 'Postal/ZIP code' },
        { name: 'age', type: 'number', required: false, description: 'Age of lead' },
        { name: 'notes', type: 'string', required: false, description: 'Additional notes' },
        { name: 'status', type: 'string', required: false, description: 'Lead status (New, Assigned, Booked, etc.)' },
        { name: 'date_booked', type: 'date', required: false, description: 'Appointment date' },
        { name: 'time_booked', type: 'string', required: false, description: 'Appointment time' },
        { name: 'booker_id', type: 'uuid', required: false, description: 'Assigned team member ID' }
      ],
      custom_fields: [
        { name: 'salesape_id', type: 'string', description: 'SalesAPE lead ID' },
        { name: 'salesape_qualified', type: 'boolean', description: 'Whether lead is qualified by SalesAPE' },
        { name: 'salesape_conversation_id', type: 'string', description: 'SalesAPE conversation ID' },
        { name: 'custom_fields', type: 'json', description: 'Additional custom fields as JSON' }
      ],
      status_values: ['New', 'Assigned', 'Booked', 'Confirmed', 'Completed', 'Cancelled', 'No Answer']
    };

    res.json({
      success: true,
      data: fields
    });
  } catch (error) {
    console.error('SalesAPE GET fields error:', error);
    res.status(500).json({ 
      message: 'Server error',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/salesape/health
 * @desc    Health check endpoint for SalesAPE
 * @access  SalesAPE API Key
 */
router.get('/health', salesapeAuth, async (req, res) => {
  try {
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/salesape/webhook
 * @desc    Webhook endpoint for SalesApe to create leads
 * @access  SalesApe API Key
 */
router.post('/webhook', salesapeAuth, async (req, res) => {
  try {
    const { fields } = req.body;

    if (!fields) {
      return res.status(400).json({
        message: 'Missing fields in request body',
        error: 'Expected fields object with lead data'
      });
    }

    // Map SalesApe webhook fields to CRM structure
    const leadData = {
      name: `${fields['First Name'] || ''} ${fields['Last Name'] || ''}`.trim(),
      phone: fields['Phone Number'] || '',
      email: fields['Email'] || '',
      notes: fields['Context'] || '',
      status: 'Assigned', // Auto-assign to SalesApe
      // Assign to SalesApe AI user
      booker_id: ALEX_AI_USER_ID,
      created_by_user_id: ALEX_AI_USER_ID,
      updated_by_user_id: ALEX_AI_USER_ID,
      // Store SalesApe metadata
      airtable_record_id: fields['CRM ID'] || null,
      salesape_id: fields['CRM ID'] || null
    };

    // Remove empty fields
    Object.keys(leadData).forEach(key => {
      if (!leadData[key] || leadData[key] === '') {
        delete leadData[key];
      }
    });

    // Check for duplicate by CRM ID first
    if (leadData.airtable_record_id) {
      const { data: existingLead } = await supabase
        .from('leads')
        .select('*')
        .eq('airtable_record_id', leadData.airtable_record_id)
        .single();

      if (existingLead) {
        console.log(`⚠️ SalesApe Webhook: Lead already exists with CRM ID ${leadData.airtable_record_id}`);
        return res.json({
          success: true,
          data: existingLead,
          duplicate: true,
          message: 'Lead already exists'
        });
      }
    }

    // Check for duplicate by phone/email
    if (leadData.phone || leadData.email) {
      let duplicateQuery = supabase.from('leads').select('*');

      if (leadData.phone) {
        duplicateQuery = duplicateQuery.eq('phone', leadData.phone);
      } else if (leadData.email) {
        duplicateQuery = duplicateQuery.eq('email', leadData.email);
      }

      const { data: existingLeads } = await duplicateQuery;

      if (existingLeads && existingLeads.length > 0) {
        const existingLead = existingLeads[0];

        // Update with SalesApe ID if missing
        if (!existingLead.airtable_record_id && leadData.airtable_record_id) {
          await supabase
            .from('leads')
            .update({
              airtable_record_id: leadData.airtable_record_id,
              salesape_id: leadData.airtable_record_id
            })
            .eq('id', existingLead.id);
        }

        console.log(`⚠️ SalesApe Webhook: Duplicate lead found - ${leadData.name}`);
        return res.json({
          success: true,
          data: existingLead,
          duplicate: true,
          message: 'Lead already exists, updated with SalesApe ID'
        });
      }
    }

    // Create new lead
    const { data: newLead, error } = await supabase
      .from('leads')
      .insert([leadData])
      .select()
      .single();

    if (error) {
      console.error('SalesApe Webhook error:', error);
      return res.status(500).json({
        message: 'Error creating lead',
        error: error.message
      });
    }

    console.log(`✅ SalesApe Webhook: Created new lead - ${newLead.name} (ID: ${newLead.id})`);

    res.status(201).json({
      success: true,
      data: newLead,
      message: 'Lead created successfully'
    });
  } catch (error) {
    console.error('SalesApe Webhook error:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
});

/**
 * @route   PATCH /api/salesape/tracking/:crmId
 * @desc    Update SalesApe funnel tracking data for a lead
 * @access  SalesApe API Key
 */
router.patch('/tracking/:crmId', salesapeAuth, async (req, res) => {
  try {
    const { crmId } = req.params;
    const trackingData = req.body;

    // Map SalesApe tracking fields to database columns
    const updateData = {};

    if (trackingData.SalesAPE_Initial_Message_Sent !== undefined) {
      updateData.salesape_initial_message_sent = trackingData.SalesAPE_Initial_Message_Sent;
    }
    if (trackingData.SalesAPE_User_Engaged !== undefined) {
      updateData.salesape_user_engaged = trackingData.SalesAPE_User_Engaged;
    }
    if (trackingData.SalesAPE_Goal_Presented !== undefined) {
      updateData.salesape_goal_presented = trackingData.SalesAPE_Goal_Presented;
    }
    if (trackingData.SalesAPE_Goal_Hit !== undefined) {
      updateData.salesape_goal_hit = trackingData.SalesAPE_Goal_Hit;
    }
    if (trackingData.Not_Interested_Opted_Out !== undefined) {
      updateData.salesape_opted_out = trackingData.Not_Interested_Opted_Out;
    }
    if (trackingData.Follow_Ups_Ended !== undefined) {
      updateData.salesape_follow_ups_ended = trackingData.Follow_Ups_Ended;
    }
    if (trackingData.Conversation_Summary) {
      updateData.salesape_conversation_summary = trackingData.Conversation_Summary;
    }
    if (trackingData.Full_Conversation) {
      updateData.salesape_full_transcript = trackingData.Full_Conversation;
    }
    if (trackingData.Portal_Link) {
      updateData.salesape_conversation_url = trackingData.Portal_Link;
    }
    if (trackingData.Airtable_Record_ID) {
      updateData.airtable_record_id = trackingData.Airtable_Record_ID;
    }

    // Always update timestamp
    updateData.updated_at = new Date().toISOString();

    // Update lead by CRM ID (either airtable_record_id or salesape_id)
    const { data: updatedLead, error } = await supabase
      .from('leads')
      .update(updateData)
      .or(`airtable_record_id.eq.${crmId},salesape_id.eq.${crmId}`)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          message: 'Lead not found',
          error: `No lead found with CRM ID: ${crmId}`
        });
      }
      console.error('SalesApe Tracking update error:', error);
      return res.status(500).json({
        message: 'Error updating tracking data',
        error: error.message
      });
    }

    console.log(`✅ SalesApe: Updated tracking for lead ${updatedLead.name} (CRM ID: ${crmId}) - Status: ${trackingData.SalesAPE_Status}`);

    res.json({
      success: true,
      data: updatedLead,
      message: 'Tracking data updated successfully'
    });
  } catch (error) {
    console.error('SalesApe Tracking error:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/salesape/leads/:id/book-appointment
 * @desc    Book calendar appointment for a lead
 * @access  SalesApe API Key
 */
router.post('/leads/:id/book-appointment', salesapeAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { date, time, duration = 60, booker_id, event_type = 'Meeting Booked' } = req.body;

    if (!date || !time) {
      return res.status(400).json({
        message: 'Date and time are required',
        error: 'Missing required booking parameters'
      });
    }

    // Parse the booking time
    const appointmentDate = new Date(`${date}T${time}:00.000Z`);
    const endTime = new Date(appointmentDate.getTime() + (duration * 60 * 1000));

    // Check for conflicts in the calendar
    const { data: conflicts, error: conflictError } = await supabase
      .from('leads')
      .select('id, name, date_booked, time_booked')
      .eq('date_booked', date)
      .eq('status', 'Booked')
      .neq('id', id);

    if (conflictError) {
      console.error('Error checking conflicts:', conflictError);
    } else if (conflicts && conflicts.length > 0) {
      // Check for time conflicts
      const timeConflicts = conflicts.filter(conflict => {
        if (!conflict.time_booked) return false;
        const conflictTime = new Date(`${date}T${conflict.time_booked}:00.000Z`);
        const conflictEnd = new Date(conflictTime.getTime() + (60 * 60 * 1000)); // Assume 1 hour

        return (appointmentDate < conflictEnd && endTime > conflictTime);
      });

      if (timeConflicts.length > 0) {
        return res.status(409).json({
          message: 'Time slot conflict',
          error: `Appointment slot conflicts with existing booking`,
          conflicts: timeConflicts
        });
      }
    }

    // ✅ BLOCKED SLOTS CHECK: Prevent booking on blocked days/times
    const { data: blockedSlots, error: blockedError } = await supabase
      .from('blocked_slots')
      .select('*')
      .eq('date', date);

    if (!blockedError && blockedSlots && blockedSlots.length > 0) {
      const isBlocked = blockedSlots.some(block => {
        // Full day block
        if (!block.time_slot) {
          return true; // Entire day is blocked
        }

        // Specific time slot block
        if (time && block.time_slot === time) {
          return true;
        }

        return false;
      });

      if (isBlocked) {
        const blockReason = blockedSlots.find(b => !b.time_slot || b.time_slot === time)?.reason || 'Unavailable';
        return res.status(409).json({
          message: 'This time slot is blocked',
          error: `Cannot book appointment: ${blockReason}`,
          blockedSlots: blockedSlots.filter(b => !b.time_slot || b.time_slot === time)
        });
      }
    }

    // Get the lead first
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', id)
      .single();

    if (leadError || !lead) {
      return res.status(404).json({
        message: 'Lead not found',
        error: 'Lead with this ID does not exist'
      });
    }

    // Update lead with booking information
    const bookingData = {
      status: 'Booked',
      date_booked: date,
      time_booked: time,
      booked_at: new Date().toISOString(),
      ever_booked: 1,
      updated_at: new Date().toISOString()
    };

    if (booker_id) {
      bookingData.booker_id = booker_id;
    }

    const { data: bookedLead, error: bookingError } = await supabase
      .from('leads')
      .update(bookingData)
      .eq('id', id)
      .select()
      .single();

    if (bookingError) {
      console.error('SalesApe Booking error:', bookingError);
      return res.status(500).json({
        message: 'Error booking appointment',
        error: bookingError.message
      });
    }

    // Notify SalesApe of successful booking
    if (bookedLead.airtable_record_id) {
      try {
        await salesapeService.notifyBooking(bookedLead, event_type);
      } catch (notifyError) {
        console.error('Error notifying SalesApe of booking:', notifyError);
        // Don't fail the booking if notification fails
      }
    }

    console.log(`✅ SalesApe: Booked appointment for ${bookedLead.name} on ${date} at ${time}`);

    res.json({
      success: true,
      data: bookedLead,
      message: 'Appointment booked successfully',
      appointment: {
        date,
        time,
        duration,
        event_type
      }
    });
  } catch (error) {
    console.error('SalesApe Booking error:', error);
    res.status(500).json({
      message: 'Server error',
      error: error.message
    });
  }
});

module.exports = router;

