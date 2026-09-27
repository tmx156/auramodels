/**
 * Generic Lead Webhook
 *
 * Public endpoint for external landing pages (Vercel, Netlify, etc.)
 * to submit leads into the CRM via a simple JSON POST.
 *
 * POST /api/webhook/lead
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const { v4: uuidv4 } = require('uuid');
const { generateBookingCode, getBookingUrl } = require('../utils/bookingCodeGenerator');

// Initialize Supabase
const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey || config.supabase.anonKey
);

/**
 * POST /api/webhook/lead
 *
 * Accepts a JSON payload and creates a lead in the CRM.
 * No authentication required — designed for external forms.
 *
 * Required: name
 * Optional: email, phone, age, postcode, gender, parent_phone, image_url, lead_source, notes
 */
router.post('/', async (req, res) => {
  try {
    const body = req.body;
    console.log('📥 [Lead Webhook] Received submission:', JSON.stringify(body, null, 2));

    // --- Extract fields (flexible key names) ---
    const name = (
      body.name || body.full_name || body.fullName ||
      (body.first_name && body.last_name ? `${body.first_name} ${body.last_name}` : '') ||
      (body.firstName && body.lastName ? `${body.firstName} ${body.lastName}` : '')
    ).trim();

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'name is required'
      });
    }

    const email = body.email || body.Email || null;
    const phone = body.phone || body.telephone || body.Phone || body.mobile || null;
    const postcode = body.postcode || body.post_code || body.zip || body.Postcode || null;
    const parentPhone = body.parent_phone || body.parentPhone || body.guardian_phone || null;
    const imageUrl = body.image_url || body.photo || body.Photo || null;
    const leadSource = body.lead_source || body.source || body.utm_source || 'Website';
    const notes = body.notes || body.message || body.Notes || null;

    const rawAge = body.age || body.Age || null;
    const age = rawAge ? parseInt(rawAge, 10) : null;

    // Normalize gender
    let gender = null;
    const rawGender = body.gender || body.Gender || null;
    if (rawGender) {
      const g = rawGender.trim().toLowerCase();
      if (g === 'f' || g === 'female') gender = 'Female';
      else if (g === 'm' || g === 'male') gender = 'Male';
    }

    // Any extra fields go into custom_fields
    const knownKeys = new Set([
      'name', 'full_name', 'fullName', 'first_name', 'last_name', 'firstName', 'lastName',
      'email', 'Email', 'phone', 'telephone', 'Phone', 'mobile',
      'age', 'Age', 'postcode', 'post_code', 'zip', 'Postcode',
      'gender', 'Gender', 'parent_phone', 'parentPhone', 'guardian_phone',
      'image_url', 'photo', 'Photo',
      'lead_source', 'source', 'utm_source',
      'notes', 'message', 'Notes'
    ]);
    const customFields = {};
    for (const [key, value] of Object.entries(body)) {
      if (!knownKeys.has(key) && value !== null && value !== undefined && value !== '') {
        customFields[key] = value;
      }
    }

    // Generate booking code
    let bookingCode = null;
    try {
      bookingCode = await generateBookingCode(name);
    } catch (err) {
      console.error('⚠️ [Lead Webhook] Booking code generation failed:', err.message);
    }

    const now = new Date().toISOString();

    const leadData = {
      id: uuidv4(),
      name,
      email,
      phone,
      age,
      postcode,
      parent_phone: parentPhone,
      image_url: imageUrl,
      gender,
      lead_source: leadSource,
      notes: notes
        ? `${notes}\n\n(Submitted via ${leadSource} on ${new Date().toLocaleString('en-GB')})`
        : `Lead submitted via ${leadSource} on ${new Date().toLocaleString('en-GB')}`,
      status: 'New',
      is_confirmed: false,
      has_sale: 0,
      ever_booked: false,
      booking_code: bookingCode,
      custom_fields: Object.keys(customFields).length > 0 ? customFields : null,
      created_at: now,
      updated_at: now
    };

    // Insert into database
    const { data: lead, error } = await supabase
      .from('leads')
      .insert(leadData)
      .select('id, name, email, phone, gender, status, booking_code, lead_source')
      .single();

    if (error) {
      console.error('❌ [Lead Webhook] Insert error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to create lead',
        message: error.message
      });
    }

    const bookingUrl = lead.booking_code ? getBookingUrl(lead.booking_code) : null;

    console.log(`✅ [Lead Webhook] Lead created: ${lead.name} (${lead.id})`);

    return res.status(201).json({
      success: true,
      lead: {
        id: lead.id,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        status: lead.status,
        booking_url: bookingUrl
      }
    });
  } catch (err) {
    console.error('❌ [Lead Webhook] Error:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: err.message
    });
  }
});

/**
 * GET /api/webhook/lead
 * Returns usage docs / payload format
 */
router.get('/', (req, res) => {
  res.json({
    service: 'CRM Lead Webhook',
    method: 'POST',
    url: '/api/webhook/lead',
    contentType: 'application/json',
    required: { name: 'string — full name of the lead' },
    optional: {
      email: 'string',
      phone: 'string',
      age: 'number',
      postcode: 'string',
      gender: '"Male" or "Female"',
      parent_phone: 'string',
      image_url: 'string (URL)',
      lead_source: 'string (default: "Website")',
      notes: 'string'
    },
    example: {
      name: 'Jane Smith',
      email: 'jane@example.com',
      phone: '07700900000',
      age: 22,
      postcode: 'SW1A 1AA',
      gender: 'Female',
      lead_source: 'Vercel Landing Page'
    }
  });
});

module.exports = router;
