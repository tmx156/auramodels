const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const jwt = require('jsonwebtoken');

/**
 * 100% RELIABLE time formatter - NO Date objects, NO locale functions
 * Converts 24-hour time string (e.g., "14:30") to 12-hour format (e.g., "2:30 pm")
 * 
 * @param {string} timeStr - Time in "HH:MM" format (e.g., "12:30", "14:00", "09:30")
 * @returns {string} - Time in 12-hour format (e.g., "12:30 pm", "2:00 pm", "9:30 am")
 */
function formatTime24to12(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') {
    return '';
  }
  
  const parts = timeStr.split(':');
  if (parts.length < 2) {
    return timeStr; // Return as-is if invalid format
  }
  
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  
  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return timeStr; // Return as-is if invalid values
  }
  
  // Simple 24-hour to 12-hour conversion
  let displayHour;
  let period;
  
  if (hours === 0) {
    displayHour = 12;
    period = 'am';
  } else if (hours < 12) {
    displayHour = hours;
    period = 'am';
  } else if (hours === 12) {
    displayHour = 12;
    period = 'pm';
  } else {
    displayHour = hours - 12;
    period = 'pm';
  }
  
  return `${displayHour}:${String(minutes).padStart(2, '0')} ${period}`;
}

// Initialize Supabase using centralized config (with env overrides)
const supabaseUrl = process.env.SUPABASE_URL || config.supabase.url;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  config.supabase.anonKey;
const supabase = createClient(supabaseUrl, supabaseKey);

// SMS Service Configuration - The SMS Works
const SMS_CONFIG = {
  provider: 'thesmsworks',
  thesmsworks: {
    // Option 1: Pre-generated JWT token (if you have one)
    jwtToken: process.env.SMS_WORKS_JWT_TOKEN,
    // Option 2: API Key + Secret to generate JWT dynamically
    apiKey: process.env.SMS_WORKS_API_KEY,
    apiSecret: process.env.SMS_WORKS_API_SECRET,
    senderId: process.env.SMS_WORKS_SENDER_ID || 'Auralndn'
  }
};

// Initialize The SMS Works client status
let smsWorksConfigured = false;
let cachedJwtToken = null;
let jwtTokenExpiry = null;

/**
 * Generate JWT token from API Key and Secret
 * JWT expires after 1 hour, so we cache it and regenerate when needed
 */
function generateJWT() {
  if (!SMS_CONFIG.thesmsworks.apiKey || !SMS_CONFIG.thesmsworks.apiSecret) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: SMS_CONFIG.thesmsworks.apiKey,
    iat: now,
    exp: now + 3600 // Token valid for 1 hour
  };

  try {
    const token = jwt.sign(payload, SMS_CONFIG.thesmsworks.apiSecret, { algorithm: 'HS256' });
    cachedJwtToken = token;
    jwtTokenExpiry = now + 3600; // Cache expiry time
    return token;
  } catch (error) {
    console.error('❌ Failed to generate JWT token:', error.message);
    return null;
  }
}

/**
 * Get valid JWT token (either pre-generated or generate from API Key/Secret)
 */
function getJWTToken() {
  // Option 1: Use pre-generated JWT token if available
  if (SMS_CONFIG.thesmsworks.jwtToken) {
    // Strip "JWT " prefix if present (some dashboards include this)
    let token = SMS_CONFIG.thesmsworks.jwtToken.trim();
    if (token.startsWith('JWT ')) {
      token = token.substring(4);
    }
    return token;
  }

  // Option 2: Generate JWT from API Key + Secret
  if (SMS_CONFIG.thesmsworks.apiKey && SMS_CONFIG.thesmsworks.apiSecret) {
    const now = Math.floor(Date.now() / 1000);
    
    // Check if cached token is still valid (refresh 5 minutes before expiry)
    if (cachedJwtToken && jwtTokenExpiry && now < (jwtTokenExpiry - 300)) {
      return cachedJwtToken;
    }
    
    // Generate new token
    return generateJWT();
  }

  return null;
}

// Enhanced configuration logging (reduced for Railway)
console.log('🔍 SMS Configuration Check:');
console.log('  Provider:', SMS_CONFIG.provider);
console.log('  JWT Token:', SMS_CONFIG.thesmsworks.jwtToken ? '✅ Set (pre-generated)' : '❌ NOT SET');
console.log('  API Key:', SMS_CONFIG.thesmsworks.apiKey ? '✅ Set' : '❌ NOT SET');
console.log('  API Secret:', SMS_CONFIG.thesmsworks.apiSecret ? '✅ Set' : '❌ NOT SET');
console.log('  Sender ID:', SMS_CONFIG.thesmsworks.senderId || '❌ NOT SET');

// Check if we have either a JWT token OR API Key + Secret
if (SMS_CONFIG.thesmsworks.jwtToken || (SMS_CONFIG.thesmsworks.apiKey && SMS_CONFIG.thesmsworks.apiSecret)) {
  smsWorksConfigured = true;
  if (SMS_CONFIG.thesmsworks.jwtToken) {
    console.log('✅ The SMS Works configured (using pre-generated JWT)');
  } else {
    console.log('✅ The SMS Works configured (will generate JWT from API Key/Secret)');
  }
} else {
  console.warn('⚠️ The SMS Works credentials not configured - SMS disabled');
  console.warn('⚠️ Please set either:');
  console.warn('   - SMS_WORKS_JWT_TOKEN (pre-generated JWT), OR');
  console.warn('   - SMS_WORKS_API_KEY + SMS_WORKS_API_SECRET (to generate JWT dynamically)');
}

/**
 * Normalize phone numbers to E.164 where possible (UK default +44 for leading 0)
 */
function normalizePhoneE164(rawPhone) {
  if (!rawPhone) return rawPhone;
  let digits = String(rawPhone).trim();
  // Already E.164
  if (digits.startsWith('+')) return digits;
  // Remove non-digits
  digits = digits.replace(/\D/g, '');
  // UK common format: 0XXXXXXXXXX -> +44XXXXXXXXXX
  if (digits.length === 11 && digits.startsWith('0')) {
    return '+44' + digits.slice(1);
  }
  // If it looks like 10 digits, check if it's UK mobile (starts with 7)
  if (digits.length === 10 && digits.startsWith('7')) {
    return '+44' + digits; // UK mobile number
  }
  // If it looks like 11 digits starting with 1, check if it's a UK number that was incorrectly formatted as US
  if (digits.length === 11 && digits.startsWith('1') && digits[1] === '7') {
    return '+44' + digits.slice(1); // UK mobile number that was incorrectly formatted as US
  }
  // If it looks like 10 digits (US-style), leave as-is or prepend +1 if desired
  if (digits.length === 10) {
    return '+1' + digits; // safe default; adjust if needed by region
  }
  // If it already includes country code but no '+', attempt to prefix '+'
  if (!digits.startsWith('0')) {
    return '+' + digits;
  }
  return rawPhone;
}

function generateShortId(length = 8) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return out;
}

/**
 * Create short link using Supabase
 */
async function createShortLinkForContent(content) {
  try {
    let id = generateShortId(8);
    
    // Ensure uniqueness by checking if ID exists
    let attempts = 0;
    while (attempts < 5) {
      const { data: existing } = await supabase
        .from('short_links')
        .select('id')
        .eq('id', id)
        .single();
      
      if (!existing) break; // ID is unique
      id = generateShortId(8);
      attempts++;
    }
    
    // Insert the short link
    const { data, error } = await supabase
      .from('short_links')
      .insert({
        id,
        content,
        created_at: new Date().toISOString()
      });
    
    if (error) {
      console.error('Error creating short link:', error);
      return null;
    }
    
    const base = process.env.PUBLIC_BASE_URL || 'http://localhost:5000';
    return `${base}/c/${id}`;
  } catch (err) {
    console.error('Failed to create short link:', err);
    return null;
  }
}

/**
 * Process template variables
 */
const processTemplate = (template, lead, bookingDate = null) => {
  let processedTemplate = template;
  
  // Format booking date in UK timezone
  const bookingDateTime = bookingDate ? new Date(bookingDate) : null;
  
  const bookingDateStr = bookingDateTime ? bookingDateTime.toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Europe/London'
  }) : '';
  
  // 🔧 100% RELIABLE TIME FORMATTING
  // Use time_booked field DIRECTLY - no Date conversions, no locale functions
  // time_booked stores exactly what the user selected (e.g., "12:30", "14:00")
  const bookingTimeStr = lead.time_booked ? formatTime24to12(lead.time_booked) : '';
  
  console.log('🕐 SMS Template Processing:', {
    time_booked: lead.time_booked,
    formatted_time: bookingTimeStr,
    date_booked: bookingDate
  });
  
  // Common variables
  const variables = {
    '{leadName}': lead.name || 'Customer',
    '{leadEmail}': lead.email || '',
    '{leadPhone}': lead.phone || '',
    '{bookingDate}': bookingDateStr,
    '{bookingTime}': bookingTimeStr,
    '{companyName}': 'Auralndn',
    '{currentDate}': new Date().toLocaleDateString('en-GB', { timeZone: 'Europe/London' }),
    '{currentTime}': new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/London' })
  };
  
  // Replace variables in template
  Object.keys(variables).forEach(key => {
    const value = variables[key];
    processedTemplate = processedTemplate.replace(new RegExp(key, 'g'), value);
  });
  
  return processedTemplate;
};

/**
 * Get template from Supabase database
 */
const getTemplate = async (type) => {
  try {
    const { data: template, error } = await supabase
      .from('templates')
      .select('*')
      .eq('type', type)
      .eq('is_active', true)
      .single();
    
    if (error) {
      console.error(`Error getting template for type ${type}:`, error);
      return null;
    }
    
    return template;
  } catch (error) {
    console.error(`Error getting template for type ${type}:`, error);
    return null;
  }
};

/**
 * Send SMS message using The SMS Works API
 * @param {string} to - Recipient phone number (with country code)
 * @param {string} message - Message content
 * @returns {Promise} - SMS response
 */
// Helper function to track message delivery in database
const trackMessageDelivery = async (messageData) => {
  try {
    const { data, error } = await supabase
      .from('messages')
      .upsert({
        id: messageData.id || undefined, // Use existing ID if provided
        lead_id: messageData.leadId,
        type: 'sms',
        status: 'sent',
        sms_body: messageData.message,
        recipient_phone: messageData.to,
        sent_at: new Date().toISOString(),
        delivery_status: messageData.deliveryResult?.success ? 'delivered' : 'failed',
        provider_message_id: messageData.deliveryResult?.messageId,
        delivery_provider: 'thesmsworks',
        delivery_attempts: 1,
        last_delivery_attempt: new Date().toISOString(),
        delivery_response: messageData.deliveryResult?.fullResponse || null,
        error_message: messageData.deliveryResult?.success ? null : messageData.deliveryResult?.error,
        sent_by: messageData.sentBy || null,
        sent_by_name: messageData.sentByName || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id',
        returning: 'representation'
      });

    if (error) {
      console.error('❌ Failed to track message delivery:', error);
    } else {
      console.log('✅ Message delivery tracked in database:', data?.[0]?.id);
    }

    return { data, error };
  } catch (error) {
    console.error('❌ Error tracking message delivery:', error);
    return { data: null, error };
  }
};


const sendSMS = async (to, message) => {
  try {
    const normalized = normalizePhoneE164(to);
    console.log(`🔍 DEBUG: Full SMS Sending Process`);
    console.log(`📱 Recipient Number (normalized): ${normalized}`);
    console.log(`📝 Message Length: ${message.length} characters`);
    
    if (!smsWorksConfigured) {
      console.error('❌ The SMS Works client NOT configured');
      throw new Error('The SMS Works client not configured. Please check your SMS_WORKS_API_KEY.');
    }
    
    // Remove '+' from destination for The SMS Works API (they expect format like 447123456789)
    const destination = normalized.replace(/^\+/, '');
    
    // Get sender ID - can be text (alphanumeric) or numeric (replyable number)
    // If it's numeric, remove + and non-digits. If it's text, use as-is (max 11 chars for alphanumeric)
    let senderId = SMS_CONFIG.thesmsworks.senderId || 'Auralndn';
    
    // If sender is numeric, sanitize it (remove + and non-digits)
    // If sender is text (contains letters), use it as-is (alphanumeric sender)
    if (/^\d/.test(senderId)) {
      // Numeric sender - sanitize
      senderId = String(senderId).replace(/^\+/, '').replace(/\D/g, '') || undefined;
    } else {
      // Text/alphanumeric sender (e.g., "Auralndn") - use as-is, limit to 11 chars
      senderId = String(senderId).trim().substring(0, 11);
    }
    
    // Detailed environment and configuration logging
    console.log('🔐 Configuration Details:', {
      apiKey: SMS_CONFIG.thesmsworks.apiKey ? 'SET' : 'NOT SET',
      senderId: senderId || 'NOT SET',
      destination: destination
    });

    // Prepare payload for The SMS Works API
    const payload = {
      sender: senderId || 'Auralndn',
      destination: destination,
      content: message
    };

    console.log('📤 Payload Prepared:', JSON.stringify({ ...payload, apiKey: '***' }, null, 2));

    // Get valid JWT token (either pre-generated or generated from API Key/Secret)
    const jwtToken = getJWTToken();
    if (!jwtToken) {
      throw new Error('Failed to get JWT token. Please check your SMS Works credentials.');
    }

    // The SMS Works API requires "JWT " prefix (tested and confirmed working)
    // Try JWT prefix first (confirmed working), then fallbacks
    const authHeaders = [
      `JWT ${jwtToken}`,           // JWT prefix (CONFIRMED WORKING)
      jwtToken,                    // Direct JWT token (fallback)
      `Bearer ${jwtToken}`         // Bearer prefix (fallback)
    ];

    // Make API call to The SMS Works with enhanced error handling
    let lastError = null;
    for (const authHeader of authHeaders) {
      try {
        console.log(`🔐 Trying Authorization: ${authHeader.substring(0, 30)}...`);
        
        const response = await axios.post('https://api.thesmsworks.co.uk/v1/message/send', payload, {
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': authHeader
          },
          timeout: 10000 // 10-second timeout
        });

        console.log('🌐 Full API Response:', JSON.stringify(response.data, null, 2));

        // The SMS Works returns an object with messageId and status
        const resp = response.data;
        
        console.log(`✅ SMS API Response Details:`, {
          messageId: resp?.messageId || resp?.id,
          status: resp?.status,
          credits: resp?.credits
        });

        return {
          success: true,
          provider: 'thesmsworks',
          messageId: resp?.messageId || resp?.id || null,
          status: resp?.status || 'submitted',
          credits: resp?.credits || null,
          fullResponse: resp // Store full response for tracking
        };
      } catch (apiError) {
        // If it's a 401, try next auth format
        if (apiError.response?.status === 401 && authHeader !== authHeaders[authHeaders.length - 1]) {
          console.log(`⚠️  Auth format failed, trying next...`);
          lastError = apiError;
          continue;
        }
        
        // If it's not 401, or it's the last format, throw the error
        console.error('❌ Detailed API Error:', {
          message: apiError.message,
          response: apiError.response?.data,
          status: apiError.response?.status,
          headers: apiError.response?.headers
        });
        
        throw apiError;
      }
    }
    
    // If we get here, all auth formats failed
    if (lastError) {
      throw lastError;
    }
  } catch (error) {
    console.error(`❌ Comprehensive SMS Sending Error:`, {
      message: error.message,
      stack: error.stack,
      responseData: error.response?.data,
      responseStatus: error.response?.status
    });
    
    return { 
      success: false, 
      provider: 'thesmsworks', 
      error: error.message,
      fullError: error
    };
  }
};

/**
 * Send booking confirmation SMS using template
 * @param {Object} lead - Lead object with name, phone, and booking details
 * @param {string} appointmentDate - Appointment date/time
 * @returns {Promise} - SMS response
 */
const sendBookingConfirmation = async (lead, appointmentDate) => {
  try {
    // Get booking confirmation template
    const template = await getTemplate('booking_confirmation');
    
    if (!template) {
      console.warn('No booking confirmation template found, using default message');
      const defaultMessage = `Hi ${lead.name}! Your appointment has been confirmed for ${appointmentDate}. We'll see you soon! - Modelling Studio CRM`;
      return sendSMS(lead.phone, defaultMessage);
    }
    
    // Format date in UK timezone
    const bookingDateTime = appointmentDate ? new Date(appointmentDate) : null;
    const bookingDateStr = bookingDateTime ? bookingDateTime.toLocaleDateString('en-GB', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: 'Europe/London'
    }) : '';
    
    // 🔧 100% RELIABLE TIME FORMATTING
    // Use time_booked field DIRECTLY - no Date conversions, no locale functions
    const bookingTimeStr = lead.time_booked ? formatTime24to12(lead.time_booked) : '';
    
    console.log('🕐 SMS sendBookingConfirmation:', {
      time_booked: lead.time_booked,
      formatted_time: bookingTimeStr,
      date_booked: appointmentDate
    });

    // Concise SMS template
    const conciseSmsBody = `Hi ${lead.name}, your photoshoot is confirmed for ${bookingDateStr} at ${bookingTimeStr}. 

Studio: 60 Higher Ardwick, Manchester, M12 6DA

Bring: 3 outfits, ID, ready hair/makeup. Full details: `;

    // Create a short link for full details
    const url = await createShortLinkForContent(template.sms_body || template.content);
    const finalSmsBody = conciseSmsBody + url;

    return sendSMS(lead.phone, finalSmsBody);
  } catch (error) {
    console.error('Error sending booking confirmation:', error);
    // Fallback to default message
    const defaultMessage = `Hi ${lead.name}! Your appointment has been confirmed for ${appointmentDate}. We'll see you soon! - Modelling Studio CRM`;
    return sendSMS(lead.phone, defaultMessage);
  }
};

/**
 * Send appointment reminder SMS using template
 * @param {Object} lead - Lead object with name, phone, and booking details
 * @param {string} appointmentDate - Appointment date/time
 * @returns {Promise} - SMS response
 */
const sendAppointmentReminder = async (lead, appointmentDate) => {
  try {
    // Get appointment reminder template
    const template = await getTemplate('appointment_reminder');
    
    if (!template) {
      console.warn('No appointment reminder template found, using default message');
      const defaultMessage = `Hi ${lead.name}! Just a reminder about your appointment tomorrow at ${appointmentDate}. See you there! - Modelling Studio CRM`;
      return sendSMS(lead.phone, defaultMessage);
    }
    
    // Process template with variables
    const processedMessage = processTemplate(template.sms_body || template.content, lead, appointmentDate);
    
    return sendSMS(lead.phone, processedMessage);
  } catch (error) {
    console.error('Error sending appointment reminder:', error);
    // Fallback to default message
    const defaultMessage = `Hi ${lead.name}! Just a reminder about your appointment tomorrow at ${appointmentDate}. See you there! - Modelling Studio CRM`;
    return sendSMS(lead.phone, defaultMessage);
  }
};

/**
 * Send lead status update SMS
 * @param {Object} lead - Lead object with name and phone
 * @param {string} status - New status
 * @returns {Promise} - SMS response
 */
const sendStatusUpdate = async (lead, status) => {
  const message = `Hi ${lead.name}! Your lead status has been updated to: ${status}. We'll keep you informed of any changes. - Modelling Studio CRM`;
  return sendSMS(lead.phone, message);
};

/**
 * Send custom SMS message
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} message - Custom message
 * @returns {Promise} - SMS response
 */
const sendCustomMessage = async (phoneNumber, message) => {
  return sendSMS(phoneNumber, message);
};

/**
 * Get SMS provider status
 * @returns {Object} - Status of SMS provider
 */

const getSMSStatus = async () => {
  return {
    configuredProvider: SMS_CONFIG.provider,
    thesmsworks: {
      available: smsWorksConfigured,
      configured: smsWorksConfigured
    }
  };
};

/**
 * Test SMS service
 * @param {string} phoneNumber - Test phone number
 * @returns {Promise} - Test result
 */
const testSMSService = async (phoneNumber) => {
  const testMessage = 'This is a test message from your CRM system via The SMS Works.';
  return sendSMS(phoneNumber, testMessage);
};

module.exports = {
  sendSMS,
  trackMessageDelivery,
  sendBookingConfirmation,
  sendAppointmentReminder,
  sendStatusUpdate,
  sendCustomMessage,
  getSMSStatus,
  testSMSService
}; 