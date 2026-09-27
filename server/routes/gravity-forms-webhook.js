/**
 * Gravity Forms Webhook Integration
 *
 * This endpoint receives lead submissions from Gravity Forms
 * and imports them directly into the CRM.
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
 * Webhook endpoint to receive leads from Gravity Forms
 * POST /api/gravity-forms-webhook/submit
 *
 * Expected JSON payload from Gravity Forms (field names will vary based on your form):
 * {
 *   "name": "John Doe",              // or separate first_name/last_name fields
 *   "email": "john@example.com",
 *   "phone": "1234567890",
 *   "age": 25,
 *   "postcode": "12345",
 *   "notes": "Additional information",
 *   "parent_phone": "0987654321"     // optional
 * }
 */
router.post('/submit', async (req, res) => {
  try {
    console.log('📥 Received Gravity Forms submission:', JSON.stringify(req.body, null, 2));

    // Extract data from Gravity Forms webhook
    // Gravity Forms sends field data with labels as keys
    // Handle exact field names from your form
    const formData = req.body;

    // Map Gravity Forms field names to CRM database fields
    // Handle both field IDs (numbers) and field labels
    const getName = () => {
      return formData['1'] ||           // Field ID 1 = Name
             formData['Name'] ||
             formData['name'] ||
             formData['Full Name'] ||
             (formData['First Name'] && formData['Last Name']
               ? `${formData['First Name']} ${formData['Last Name']}`
               : '');
    };

    const getEmail = () => {
      return formData['7'] ||           // Field ID 7 = Email
             formData['Email'] ||
             formData['email'] ||
             null;
    };

    const getPhone = () => {
      return formData['15'] ||          // Field ID 15 = Phone
             formData['Telephone Number'] ||
             formData['Phone'] ||
             formData['phone'] ||
             formData['telephone_number'] ||
             null;
    };

    const getAge = () => {
      const ageValue = formData['11'] || // Field ID 11 = Age
                       formData['Age'] ||
                       formData['age'];
      return ageValue ? parseInt(ageValue) : null;
    };

    const getPostcode = () => {
      return formData['5'] ||           // Field ID 5 = Postcode
             formData['Post Code'] ||
             formData['Postcode'] ||
             formData['postcode'] ||
             formData['post_code'] ||
             null;
    };

    const getParentPhone = () => {
      return formData['14'] ||          // Field ID 14 = Parent's Number
             formData["Parent's Number"] ||
             formData['Parent Number'] ||
             formData['parent_phone'] ||
             formData['parents_number'] ||
             null;
    };

    const getPhotoUrl = () => {
      return formData['6'] ||           // Field ID 6 = Photo
             formData['Upload Photo'] ||
             formData['Photo'] ||
             formData['photo'] ||
             formData['image_url'] ||
             null;
    };

    const getGender = () => {
      const genderValue = formData['Gender'] ||
                          formData['gender'] ||
                          formData['16'] ||           // Field ID 16 = Gender (actual field ID from Gravity Forms)
                          formData['12'] ||          // Field ID 12 = Gender (alternative)
                          null;
      
      // Normalize gender value to match database constraint (Female/Male)
      if (!genderValue) return null;
      
      const normalized = genderValue.trim().toUpperCase();
      
      // Handle single letter abbreviations: "F" -> "Female", "M" -> "Male"
      if (normalized === 'F') return 'Female';
      if (normalized === 'M') return 'Male';
      
      // Handle full words: "female" -> "Female", "male" -> "Male"
      if (normalized === 'FEMALE') return 'Female';
      if (normalized === 'MALE') return 'Male';
      
      // Handle case variations: "Female", "female", etc.
      const lowerNormalized = normalized.toLowerCase();
      if (lowerNormalized === 'female') return 'Female';
      if (lowerNormalized === 'male') return 'Male';
      
      // Return as-is if it's already "Female" or "Male"
      if (normalized === 'FEMALE' || normalized === 'MALE') {
        return normalized.charAt(0) + normalized.slice(1).toLowerCase();
      }
      
      return null;
    };

    const fullName = getName().trim();

    // Validate required fields
    if (!fullName || fullName === '') {
      console.error('❌ Validation failed: Name is required');
      return res.status(400).json({
        success: false,
        error: 'Name is required',
        message: 'Please provide a Name field in the form submission'
      });
    }

    // Store any unprocessed fields in custom_fields
    const processedKeys = [
      '1', '5', '6', '7', '11', '12', '14', '15', '16', '17',  // Field IDs (16 = Gender, 17 = other field)
      'Name', 'name', 'Full Name', 'First Name', 'Last Name',
      'Email', 'email',
      'Telephone Number', 'Phone', 'phone', 'telephone_number',
      'Age', 'age',
      'Post Code', 'Postcode', 'postcode', 'post_code',
      "Parent's Number", 'Parent Number', 'parent_phone', 'parents_number',
      'Upload Photo', 'Photo', 'photo', 'image_url',
      'Gender', 'gender',  // Gender field
      'Lead Code', 'lead_code',  // Lead Code field
      // Gravity Forms metadata fields
      'id', 'form_id', 'post_id', 'date_created', 'date_updated',
      'is_starred', 'is_read', 'ip', 'source_url', 'user_agent',
      'currency', 'payment_status', 'payment_date', 'payment_amount',
      'payment_method', 'transaction_id', 'is_fulfilled', 'created_by',
      'transaction_type', 'status', 'source_id', 'submission_speeds'
    ];

    // Extract Gender explicitly
    const gender = getGender();

    // Extract Lead Code (hidden field from Gravity Forms)
    const getLeadCode = () => {
      return formData['17'] ||           // Field ID 17 = Lead Code
             formData['Lead Code'] ||
             formData['lead_code'] ||
             null;
    };
    const leadCode = getLeadCode();

    // Store any unprocessed fields in custom_fields (excluding Gender which has its own column)
    const customFields = {};
    if (leadCode) {
      customFields.lead_code = leadCode;
    }
    Object.keys(formData).forEach(key => {
      if (!processedKeys.includes(key)) {
        customFields[key] = formData[key];
      }
    });

    // Prepare lead data for database
    const submissionId = formData.id || '';
    const sourceUrl = formData.source_url || '';
    const notes = `Lead imported from Gravity Forms${submissionId ? ` (ID: ${submissionId})` : ''}${sourceUrl ? ` from ${sourceUrl}` : ''} on ${new Date().toLocaleString('en-GB')}`;

    // Generate a clean booking code slug (e.g., "tanya-booking")
    let bookingCode = null;
    try {
      bookingCode = await generateBookingCode(fullName);
      console.log(`📋 Generated booking code: ${bookingCode} for ${fullName}`);
    } catch (bookingCodeError) {
      console.error('⚠️ Failed to generate booking code:', bookingCodeError.message);
      // Continue without booking code - not critical
    }

    const leadData = {
      id: uuidv4(),
      name: fullName,
      email: getEmail(),
      phone: getPhone(),
      age: getAge(),
      postcode: getPostcode(),
      parent_phone: getParentPhone(),
      image_url: getPhotoUrl(),
      gender: gender || null, // Store in dedicated column
      notes: notes,
      status: 'New', // Default status for new leads
      is_confirmed: false,
      has_sale: 0,
      ever_booked: false,
      booking_code: bookingCode, // Clean booking slug for public booking links
      custom_fields: Object.keys(customFields).length > 0 ? customFields : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    console.log('📝 Prepared lead data:', {
      name: leadData.name,
      email: leadData.email,
      phone: leadData.phone,
      status: leadData.status,
      gender: leadData.gender || 'Not provided',
      genderInLeadData: leadData.hasOwnProperty('gender'),
      genderValue: leadData.gender,
      formData16: formData['16'], // Debug: show what field 16 contains
      formData17: formData['17']  // Debug: show what field 17 contains
    });

    // Insert lead into database
    console.log('💾 Inserting lead with gender:', leadData.gender);
    const { data: lead, error } = await supabase
      .from('leads')
      .insert(leadData)
      .select('*') // Select all fields to see what Supabase returns
      .single();

    if (error) {
      console.error('❌ Error inserting lead:', error);
      console.error('❌ Error details:', JSON.stringify(error, null, 2));
      
      // Check if error is related to missing gender column
      if (error.message && error.message.includes('gender')) {
        console.error('⚠️ Gender column might not exist. Please run the migration: server/migrations/add_gender_column.sql');
      }
      
      return res.status(500).json({
        success: false,
        error: 'Failed to create lead',
        message: error.message,
        details: error.details,
        hint: error.message && error.message.includes('gender') 
          ? 'Gender column might not exist. Run migration: server/migrations/add_gender_column.sql'
          : null
      });
    }

    console.log('✅ Lead created successfully');
    console.log('📋 Lead object keys:', Object.keys(lead));
    console.log('📋 Gender in lead object:', lead.gender);
    console.log('📋 Gender in leadData:', leadData.gender);
    console.log('📋 Full lead object (first 500 chars):', JSON.stringify(lead).substring(0, 500));
    
    if (!lead.hasOwnProperty('gender')) {
      console.error('❌ WARNING: Gender property not found in returned lead object!');
      console.error('   This likely means the gender column does not exist in the database.');
      console.error('   Please run the migration: server/migrations/add_gender_column.sql');
    }

    // Return success response - always include gender and booking link
    const bookingUrl = lead.booking_code ? getBookingUrl(lead.booking_code) : null;
    
    res.status(201).json({
      success: true,
      message: 'Lead imported successfully',
      lead: {
        id: lead.id,
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        gender: lead.gender !== undefined ? lead.gender : (leadData.gender || null),
        status: lead.status,
        booking_code: lead.booking_code,
        booking_url: bookingUrl
      }
    });

  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * Test endpoint to verify webhook is working
 * GET /api/gravity-forms-webhook/test
 */
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Gravity Forms webhook endpoint is ready',
    endpoint: '/api/gravity-forms-webhook/submit',
    method: 'POST',
    format: 'JSON',
    requiredFields: [
      'Name (Required) - Field ID: 1'
    ],
    optionalFields: [
      'Age - Field ID: 11',
      "Parent's Number - Field ID: 14",
      'Email - Field ID: 7',
      'Telephone Number - Field ID: 15',
      'Post Code - Field ID: 5',
      'Upload Photo - Field ID: 6',
      'Gender - Field ID: 12 (Female/Male)'
    ],
    formFieldMapping: {
      '1 or Name': 'Lead full name (REQUIRED)',
      '7 or Email': 'Lead email address',
      '15 or Telephone Number': 'Lead phone number',
      '11 or Age': 'Lead age',
      '5 or Post Code': 'Lead postal code',
      '14 or Parent\'s Number': 'Parent/guardian phone number',
      '6 or Upload Photo': 'Photo URL or file upload',
      '12 or Gender': 'Gender (Female/Male)'
    },
    exampleWithFieldIDs: {
      '1': 'John Doe',
      '7': 'john@example.com',
      '15': '07700900000',
      '11': '25',
      '5': 'SW1A 1AA',
      '14': '07700900001',
      '6': 'https://example.com/photo.jpg',
      '12': 'Male',
      'id': '12345',
      'source_url': 'https://example.com/contact/'
    },
    exampleWithFieldLabels: {
      'Name': 'John Doe',
      'Age': 25,
      "Parent's Number": '07700900001',
      'Email': 'john@example.com',
      'Telephone Number': '07700900000',
      'Post Code': 'SW1A 1AA',
      'Upload Photo': 'https://example.com/photo.jpg',
      'Gender': 'Male'
    }
  });
});

/**
 * Health check endpoint
 * GET /api/gravity-forms-webhook/health
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'Gravity Forms Webhook',
    timestamp: new Date().toISOString(),
    endpoints: {
      submit: '/api/gravity-forms-webhook/submit',
      test: '/api/gravity-forms-webhook/test',
      health: '/api/gravity-forms-webhook/health'
    }
  });
});

module.exports = router;
