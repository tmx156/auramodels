// const Database = require('better-sqlite3'); // Removed - using Supabase only
const path = require('path');
const { sendEmail: sendActualEmail } = require('./emailService');
const { sendSMS: sendActualSMS } = require('./smsService');
const { fromZonedTime } = require('date-fns-tz');
const emailAccountService = require('./emailAccountService');

// Supabase configuration - use singleton client to prevent connection leaks
const { getSupabaseClient } = require('../config/supabase-client');
const supabase = getSupabaseClient();

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

// const getDb = () => {
//   return new Database(path.join(__dirname, '..', 'local-crm.db'));
// }; // Removed - using Supabase only

// Helper function to add booking history entry using Supabase
async function addBookingHistoryEntry(leadId, action, performedById, performedByName, details, leadSnapshot) {
  try {
    console.log(`📝 Adding booking history entry for lead ${leadId}, action: ${action}`);

    // Add entry to lead's booking_history array
    const historyEntry = {
      action,
      performed_by: performedById,
      performed_by_name: performedByName,
      details: details || {},
      lead_snapshot: leadSnapshot,
      timestamp: new Date().toISOString()
    };

    // Get current booking history
    const { data: currentLead, error: fetchError } = await supabase
      .from('leads')
      .select('booking_history')
      .eq('id', leadId)
      .single();

    if (fetchError) {
      console.error('❌ Error fetching current booking history:', fetchError);
      return null;
    }

    // Parse booking_history - it may be stored as JSON string or array
    let currentHistory = [];
    if (currentLead.booking_history) {
      try {
        if (typeof currentLead.booking_history === 'string') {
          currentHistory = JSON.parse(currentLead.booking_history);
        } else if (Array.isArray(currentLead.booking_history)) {
          currentHistory = currentLead.booking_history;
        }
      } catch (parseError) {
        console.warn('⚠️ Failed to parse booking_history, using empty array:', parseError.message);
        currentHistory = [];
      }
    }
    
    if (!Array.isArray(currentHistory)) {
      currentHistory = [];
    }
    
    const updatedHistory = [...currentHistory, historyEntry];

    // Update the lead with new booking history
    const { error: updateError } = await supabase
      .from('leads')
      .update({ booking_history: updatedHistory })
      .eq('id', leadId);

    if (updateError) {
      console.error('❌ Error updating booking history:', updateError);
      throw updateError;
    }

    console.log(`✅ Booking history entry added to lead ${leadId}`);
    return updatedHistory.length - 1; // Return index of new entry
  } catch (error) {
    console.error('❌ Error adding booking history entry:', error);
    console.error('❌ Error details:', {
      message: error.message,
      details: error.details || error.error?.details || 'No details available',
      hint: error.hint || error.error?.hint || '',
      code: error.code || error.error?.code || ''
    });

    // Don't throw the error - this should not break the booking confirmation flow
    // Just log the error and return null to indicate failure
    console.warn('⚠️ Continuing without booking history entry to prevent booking confirmation failure');
    return null;
  }
}

class MessagingService {
  // Process template variables
  static processTemplate(template, lead, user, bookingDate = null, bookerInfo = null) {
    // Validate inputs
    if (!template) {
      console.error('❌ Template is null or undefined');
      return {
        subject: 'Booking Notification',
        email_body: 'Your booking has been confirmed.',
        sms_body: 'Your booking has been confirmed.'
      };
    }

    // Debug: Check template structure
    console.log('🔍 Template structure:', {
      hasSubject: !!template.subject,
      hasContent: !!template.content,
      hasEmailBody: !!template.email_body,
      hasSmsBody: !!template.sms_body,
      templateKeys: Object.keys(template)
    });

    let processedTemplate = {
      subject: template.subject || 'Booking Notification',
      // Prioritize specific body fields over generic content to avoid long SMS
      email_body: template.email_body || template.content || 'Your booking has been confirmed.',
      sms_body: template.sms_body || template.content || 'Your booking has been confirmed.'
    };

    // Validate required parameters
    if (!lead) {
      console.error('❌ Lead is null or undefined');
      return {
        subject: 'Booking Notification',
        email_body: 'Your booking has been confirmed.',
        sms_body: 'Your booking has been confirmed.'
      };
    }

    // User can be null for public bookings - continue with lead info
    if (!user) {
      console.log('ℹ️ User is null (public booking) - using lead info only');
    }

    // Format booking date in UK timezone
    const bookingDateTime = bookingDate ? new Date(bookingDate) : null;
    
    const bookingDateStr = bookingDateTime ? bookingDateTime.toLocaleDateString('en-GB', {
      timeZone: 'Europe/London',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }) : '';
    
    // 🔧 100% RELIABLE TIME FORMATTING
    // Use time_booked field DIRECTLY - no Date conversions, no locale functions
    // time_booked stores exactly what the user selected (e.g., "12:30", "14:00")
    const bookingTimeStr = lead.time_booked ? formatTime24to12(lead.time_booked) : '';
    
    console.log('🕐 MessagingService Template Processing:', {
      time_booked: lead.time_booked,
      formatted_time: bookingTimeStr,
      date_booked: bookingDate
    });

    const variables = {
      '{leadName}': lead.name || 'Valued Customer',
      '{leadEmail}': lead.email || '',
      '{leadPhone}': lead.phone || '',
      '{userName}': user?.name || 'Auralndn',
      '{userEmail}': user?.email || '',
      '{bookerName}': bookerInfo?.name || lead.booker_name || 'Auralndn',
      '{bookerEmail}': bookerInfo?.email || '',
      '{bookingDate}': bookingDateStr,
      '{bookingTime}': bookingTimeStr,
      '{companyName}': 'Auralndn',
      '{currentDate}': new Date().toLocaleDateString('en-GB', { timeZone: 'Europe/London' }),
      '{currentTime}': new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/London' })
    };

    // Replace variables in all fields with safety checks
    Object.keys(variables).forEach(key => {
      const value = variables[key] || ''; // Ensure value is never undefined
      try {
        if (processedTemplate.subject && typeof processedTemplate.subject === 'string') {
          processedTemplate.subject = processedTemplate.subject.replace(new RegExp(key, 'g'), value);
        }
        if (processedTemplate.email_body && typeof processedTemplate.email_body === 'string') {
          processedTemplate.email_body = processedTemplate.email_body.replace(new RegExp(key, 'g'), value);
        }
        if (processedTemplate.sms_body && typeof processedTemplate.sms_body === 'string') {
          processedTemplate.sms_body = processedTemplate.sms_body.replace(new RegExp(key, 'g'), value);
        }
      } catch (error) {
        console.error(`❌ Error replacing variable ${key}:`, error);
        console.error('Template content:', processedTemplate);
      }
    });

    return processedTemplate;
  }

  // Send booking confirmation
  static async sendBookingConfirmation(leadId, userId, bookingDate, options = {}) {
    try {
      // Get lead using Supabase
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();

      if (leadError || !lead) {
        console.error('Error fetching lead:', leadError);
        throw new Error('Lead not found');
      }

      // Get booker info separately using manual join
      let bookerInfo = null;
      if (lead.booker_id) {
        const { data: booker, error: bookerError } = await supabase
          .from('users')
          .select('name, email')
          .eq('id', lead.booker_id)
          .single();

        if (!bookerError && booker) {
          bookerInfo = booker;
        }
      }

      // Get user using Supabase (optional - may be null for public bookings)
      let user = null;
      if (userId) {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .single();

        if (userError || !userData) {
          console.error('Error fetching user:', userError);
          // Don't throw - user is optional for public bookings
        } else {
          user = userData;
        }
      }

      // Get booking confirmation template using Supabase
      let template = null;

      // If templateId is provided in options, fetch that specific template
      if (options.templateId) {
        const { data: specificTemplate, error: specificError } = await supabase
          .from('templates')
          .select('*')
          .eq('id', options.templateId)
          .eq('is_active', true)
          .single();

        if (specificError) {
          console.error('Error fetching specific template:', specificError);
        } else {
          template = specificTemplate;
        }
      }

      // Fall back to first active booking_confirmation template if no templateId or not found
      if (!template) {
        const { data: templates, error: templateError } = await supabase
          .from('templates')
          .select('*')
          .eq('type', 'booking_confirmation')
          .eq('is_active', true)
          .limit(1);

        if (templateError) {
          console.error('Error fetching template:', templateError);
          return null;
        }

        if (!templates || templates.length === 0) {
          console.log('❌ No booking confirmation template found');
          return null;
        }

        template = templates[0];
      }
      console.log('✅ Found template:', {
        id: template.id,
        name: template.name,
        type: template.type,
        hasSubject: !!template.subject,
        hasEmailBody: !!template.email_body,
        hasSmsBody: !!template.sms_body,
        hasContent: !!template.content,
        emailBodyLength: template.email_body?.length || 0,
        smsBodyLength: template.sms_body?.length || 0,
        contentLength: template.content?.length || 0
      });

      // Use bookingDate parameter if provided, otherwise fall back to lead.date_booked
      const effectiveBookingDate = bookingDate || lead.date_booked;
      
      console.log('📅 Booking date for template:', {
        provided: bookingDate,
        fromLead: lead.date_booked,
        effective: effectiveBookingDate
      });
      
      const processedTemplate = this.processTemplate(template, lead, user, effectiveBookingDate, bookerInfo);

      // Determine effective channels
      // IMPORTANT: Only send if BOTH user wants it AND template allows it
      const userWantsEmail = typeof options.sendEmail === 'boolean' ? options.sendEmail : true;
      const userWantsSms = typeof options.sendSms === 'boolean' ? options.sendSms : true;
      const templateAllowsEmail = template.send_email !== false; // Default to true if not set
      const templateAllowsSms = template.send_sms !== false; // Default to true if not set

      const effectiveSendEmail = userWantsEmail && templateAllowsEmail;
      const effectiveSendSms = userWantsSms && templateAllowsSms;

      console.log(`📧 Booking confirmation channels: userWantsEmail=${userWantsEmail}, templateAllowsEmail=${templateAllowsEmail}, effectiveSendEmail=${effectiveSendEmail}`);
      console.log(`📱 Booking confirmation channels: userWantsSms=${userWantsSms}, templateAllowsSms=${templateAllowsSms}, effectiveSendSms=${effectiveSendSms}`);

      // If neither channel selected/allowed, do nothing
      if (!effectiveSendEmail && !effectiveSendSms) {
        console.log('ℹ️ Booking confirmation suppressed (both email and SMS disabled by user or template)');
        return null;
      }

      // Create message record using Supabase with generated ID
      const { v4: uuidv4 } = require('uuid');
      const messageId = uuidv4();

      const { data: messageResult, error: messageError } = await supabase
        .from('messages')
        .insert({
          id: messageId, // Explicitly provide ID
          lead_id: leadId,
          type: (effectiveSendEmail && effectiveSendSms) ? 'both' : (effectiveSendEmail ? 'email' : 'sms'),
          content: effectiveSendEmail ? processedTemplate.email_body : processedTemplate.sms_body,
          status: 'pending', // Start as pending, will be updated after actual send
          email_status: effectiveSendEmail ? 'pending' : null,
          subject: effectiveSendEmail ? processedTemplate.subject : null,
          recipient_email: effectiveSendEmail ? lead.email : null,
          recipient_phone: effectiveSendSms ? lead.phone : null,
          sent_by: userId && userId !== 'system' ? userId : null,
          sent_by_name: user?.name || 'System',
          sent_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (messageError) {
        console.error('Error creating message record:', messageError);
        // Continue with sending even if logging fails
      }

      const message = {
        id: messageResult?.id,
        lead_id: leadId,
        type: (effectiveSendEmail && effectiveSendSms) ? 'both' : (effectiveSendEmail ? 'email' : 'sms'),
        subject: processedTemplate.subject,
        email_body: processedTemplate.email_body,
        sms_body: processedTemplate.sms_body,
        recipient_email: lead.email,
        recipient_phone: lead.phone,
        sent_by: userId,
        booking_date: bookingDate,
        attachments: []
      };

      // Load template attachments if present
      try {
        console.log(`📎 [MSG-${messageResult?.id || 'NEW'}] Loading attachments for template ID: ${template.id}`);

        // Get template with attachments from Supabase
        const { data: tpl, error: templateError } = await supabase
          .from('templates')
          .select('attachments')
          .eq('id', template.id)
          .single();

        if (templateError) {
          console.error(`📎 [MSG-${messageResult?.id || 'NEW'}] Error fetching template attachments:`, templateError.message);
        }
        
        if (tpl && tpl.attachments) {
          console.log(`📎 [MSG-${messageResult?.id || 'NEW'}] Found attachments data: ${tpl.attachments}`);
          
          try {
            const arr = JSON.parse(tpl.attachments);
            console.log(`📎 [MSG-${messageResult?.id || 'NEW'}] Parsed attachments array:`, arr);
            
            if (Array.isArray(arr) && arr.length > 0) {
              const fs = require('fs');
              const supabaseStorage = require('./supabaseStorage');
              message.attachments = [];
              
              // Process attachments synchronously to avoid race conditions
              for (const [idx, a] of arr.entries()) {
                console.log(`📎 [MSG-${messageResult?.id || 'NEW'}][${idx}] Processing attachment:`, a);

                if (a.url) {
                  console.log(`📎 [MSG-${messageResult?.id || 'NEW'}][${idx}] Original URL: ${a.url}`);

                  // Check if this is a Supabase Storage URL
                  if (a.url.includes('supabase.co/storage/v1/object/public/template-attachments/')) {
                    console.log(`📎 [MSG-${messageResult?.id || 'NEW'}][${idx}] Detected Supabase Storage URL`);

                    // Extract filename from URL
                    const urlParts = a.url.split('/');
                    const filename = urlParts[urlParts.length - 1];

                    try {
                      console.log(`📎 [MSG-${messageResult?.id || 'NEW'}][${idx}] Downloading from Supabase Storage: ${filename}`);

                      // Download file from Supabase Storage
                      const downloadResult = await supabaseStorage.downloadFile(filename);

                      if (downloadResult.success && downloadResult.buffer) {
                        console.log(`📎 [MSG-${messageResult?.id || 'NEW'}][${idx}] Download successful, buffer size: ${downloadResult.buffer.length} bytes`);

                        // Create temporary file
                        const tempDir = path.join(__dirname, '..', 'uploads', 'temp_email_attachments');
                        if (!fs.existsSync(tempDir)) {
                          fs.mkdirSync(tempDir, { recursive: true });
                          console.log(`📎 [MSG-${messageResult?.id || 'NEW'}][${idx}] Created temp directory: ${tempDir}`);
                        }

                        const tempFilePath = path.join(tempDir, filename);
                        fs.writeFileSync(tempFilePath, downloadResult.buffer);

                        // Verify file was written
                        const stats = fs.statSync(tempFilePath);
                        console.log(`📎 [MSG-${messageResult?.id || 'NEW'}][${idx}] File written successfully: ${stats.size} bytes`);

                        const attachment = {
                          filename: a.originalName || a.filename || filename,
                          path: tempFilePath
                        };
                        message.attachments.push(attachment);
                        console.log(`📎 [MSG-${messageResult?.id || 'NEW'}][${idx}] ✅ Downloaded and attached: ${attachment.filename}`);
                      } else {
                        console.error(`📎 [MSG-${messageResult?.id || 'NEW'}][${idx}] ❌ Download failed: ${downloadResult.error || 'No buffer returned'}`);
                      }
                    } catch (downloadError) {
                      console.error(`📎 [MSG-${messageResult?.id || 'NEW'}][${idx}] ❌ Error downloading from Supabase Storage:`, downloadError.message);
                      console.error(`📎 [MSG-${messageResult?.id || 'NEW'}][${idx}] Error stack:`, downloadError.stack);
                    }
                  } else {
                    // Handle legacy local file paths
                    console.log(`📎 [MSG-${messageResult?.id || 'NEW'}][${idx}] Detected legacy local file path`);

                    const cleanUrl = a.url.replace(/^\//, ''); // Remove leading slash
                    let filePath = path.join(__dirname, '..', cleanUrl);

                    console.log(`📎 [MSG-${messageResult?.id || 'NEW'}][${idx}] Clean URL: ${cleanUrl}`);
                    console.log(`📎 [MSG-${messageResult?.id || 'NEW'}][${idx}] Constructed path: ${filePath}`);

                    // If file doesn't exist, try alternative path constructions
                    if (!fs.existsSync(filePath)) {
                      console.log(`📎 [MSG-${messageResult?.id || 'NEW'}][${idx}] File not found, trying alternative paths...`);

                      // Try absolute path from project root
                      const alternativePath1 = path.resolve(process.cwd(), cleanUrl);
                      console.log(`📎 [MSG-${messageResult?.id || 'NEW'}][${idx}] Trying path 1: ${alternativePath1}`);

                      if (fs.existsSync(alternativePath1)) {
                        filePath = alternativePath1;
                        console.log(`📎 [MSG-${messageResult?.id || 'NEW'}][${idx}] ✅ Found at alternative path 1`);
                      } else {
                        // Try with server directory prefix
                        const alternativePath2 = path.resolve(__dirname, '..', '..', cleanUrl);
                        console.log(`📎 [MSG-${messageResult?.id || 'NEW'}][${idx}] Trying path 2: ${alternativePath2}`);

                        if (fs.existsSync(alternativePath2)) {
                          filePath = alternativePath2;
                          console.log(`📎 [MSG-${messageResult?.id || 'NEW'}][${idx}] ✅ Found at alternative path 2`);
                        } else {
                          console.warn(`📎 [MSG-${messageResult?.id || 'NEW'}][${idx}] ❌ File not found at any location: ${filePath}`);
                        }
                      }
                    }

                    // Final check if file exists
                    if (fs.existsSync(filePath)) {
                      const attachment = {
                        filename: a.originalName || a.filename || `attachment_${idx}`,
                        path: filePath
                      };
                      message.attachments.push(attachment);
                      console.log(`📎 [MSG-${messageResult?.id || 'NEW'}][${idx}] ✅ Added attachment: ${attachment.filename} from ${filePath}`);
                    } else {
                      console.warn(`📎 [MSG-${messageResult?.id || 'NEW'}][${idx}] ❌ File not found at any location: ${filePath}`);
                    }
                  }
                } else {
                  console.warn(`📎 [MSG-${messageResult?.id || 'NEW'}][${idx}] ❌ No URL found in attachment data`);
                }
              }
              
              console.log(`📎 [MSG-${messageResult?.id || 'NEW'}] Final attachments count: ${message.attachments.length}/${arr.length}`);
            } else {
              console.log(`📎 [MSG-${messageResult?.id || 'NEW'}] No valid attachments array found`);
            }
          } catch (parseError) {
            console.error(`📎 [MSG-${messageResult?.id || 'NEW'}] Error parsing attachments JSON:`, parseError.message);
            console.error(`📎 [MSG-${messageResult?.id || 'NEW'}] Raw attachments data:`, tpl.attachments);
          }
        } else {
          console.log(`📎 [MSG-${messageResult?.id || 'NEW'}] No attachments found for template`);
        }

        // Note: No need to close Supabase connection
      } catch (dbError) {
        console.error(`📎 [MSG-${messageResult?.id || 'NEW'}] Database error loading attachments:`, dbError.message);
      }

      // Send actual messages according to effective channels
      // Track which services were used for notification
      let emailResult = null;
      let smsResult = null;

      // Resolve email account using priority: template > user > default
      let resolvedEmailAccount = 'primary'; // fallback
      let emailAccountInfo = null;

      if (effectiveSendEmail) {
        try {
          // Use priority resolution: options > template > user > default
          // Always pass template.id - the resolution service will check if template has email_account_id
          const resolution = await emailAccountService.resolveEmailAccount({
            emailAccountId: options.emailAccountId,
            templateId: template?.id || null,
            userId: userId
          });

          if (resolution.type === 'database' && resolution.account) {
            // Pass the database account object directly to sendEmail
            resolvedEmailAccount = resolution.account;
            emailAccountInfo = {
              id: resolution.account.id,
              email: resolution.account.email,
              name: resolution.account.name
            };
            console.log(`📧 Resolved email account: ${resolution.account.email} (database)`);
          } else {
            // Fall back to legacy env var account
            // Priority: resolution result > template setting > options > primary
            resolvedEmailAccount = resolution.accountKey || template.email_account || options.emailAccount || 'primary';
            console.log(`📧 Using legacy email account: ${resolvedEmailAccount}`);
          }
        } catch (resolveError) {
          console.error('📧 Error resolving email account, using fallback:', resolveError.message);
          resolvedEmailAccount = options.emailAccount || template.email_account || 'primary';
        }

        emailResult = await this.sendEmail(message, resolvedEmailAccount);
      }
      if (effectiveSendSms) {
        smsResult = await this.sendSMS(message);
      }

      // Return message with metadata about what was sent
      return {
        ...message,
        emailAccount: effectiveSendEmail ? (emailAccountInfo || resolvedEmailAccount) : null,
        emailSent: !!emailResult,
        smsSent: !!smsResult,
        smsProvider: 'The SMS Works'
      };
    } catch (error) {
      console.error('Error sending booking confirmation:', error);
      throw error;
    }
  }

  // Send appointment reminder
  static async sendAppointmentReminder(leadId, userId, bookingDate, reminderDays = 5) {
    try {
      // Get lead using Supabase
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();

      if (leadError || !lead) {
        console.error('Error fetching lead for reminder:', leadError);
        throw new Error('Lead not found');
      }

      // Get booker info separately using manual join
      let bookerInfo = null;
      if (lead.booker_id) {
        const { data: booker, error: bookerError } = await supabase
          .from('users')
          .select('name, email')
          .eq('id', lead.booker_id)
          .single();

        if (!bookerError && booker) {
          bookerInfo = booker;
        }
      }

      // Get user using Supabase
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        console.error('Error fetching user for reminder:', userError);
        throw new Error('User not found');
      }

      // Get appointment reminder template using Supabase
      const { data: templates, error: templateError } = await supabase
        .from('templates')
        .select('*')
        .eq('type', 'appointment_reminder')
        .eq('is_active', true)
        .limit(1);

      if (templateError) {
        console.error('Error fetching reminder template:', templateError);
        return null;
      }

      if (!templates || templates.length === 0) {
        console.log('No appointment reminder template found');
        return null;
      }

      const template = templates[0];
      const processedTemplate = this.processTemplate(template, lead, user, bookingDate, bookerInfo);

      // Create message record using Supabase
      const { data: messageResult, error: messageError } = await supabase
        .from('messages')
        .insert({
          lead_id: leadId,
          type: template.send_email && template.send_sms ? 'both' :
                template.send_email ? 'email' : 'sms',
          content: template.send_email ? processedTemplate.email_body : processedTemplate.sms_body,
          status: 'sent',
          email_status: template.send_email ? 'sent' : null,
          subject: template.send_email ? processedTemplate.subject : null,
          recipient_email: template.send_email ? lead.email : null,
          recipient_phone: template.send_sms ? lead.phone : null,
          sent_by: userId && userId !== 'system' ? userId : null,
          sent_by_name: user?.name || 'System',
          template_id: template?.id || null,
          sent_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (messageError) {
        console.error('Error creating reminder message record:', messageError);
        // Continue with sending even if logging fails
      }

      const message = {
        id: messageResult?.id,
        lead_id: leadId,
        type: template.send_email && template.send_sms ? 'both' :
              template.send_email ? 'email' : 'sms',
        subject: processedTemplate.subject,
        email_body: processedTemplate.email_body,
        sms_body: processedTemplate.sms_body,
        recipient_email: lead.email,
        recipient_phone: lead.phone,
        sent_by: userId,
        booking_date: bookingDate,
        reminder_days: reminderDays
      };

      // Send actual messages - respect template settings
      // Use email account resolution: template > user > default
      let resolvedEmailAccount = 'primary';

      if (template.send_email !== false && lead.email) {
        try {
          const resolution = await emailAccountService.resolveEmailAccount({
            templateId: template?.id || null,
            userId: userId
          });

          if (resolution.type === 'database' && resolution.account) {
            resolvedEmailAccount = resolution.account;
            console.log(`📧 Reminder using email account: ${resolution.account.email} (database)`);
          } else {
            resolvedEmailAccount = template.email_account || resolution.accountKey || 'primary';
            console.log(`📧 Reminder using legacy email account: ${resolvedEmailAccount}`);
          }
        } catch (resolveError) {
          console.error('📧 Error resolving email account for reminder:', resolveError.message);
          resolvedEmailAccount = template.email_account || 'primary';
        }

        await this.sendEmail(message, resolvedEmailAccount);
      }
      if (template.send_sms !== false && lead.phone) {
        await this.sendSMS(message);
      }

      return message;
    } catch (error) {
      console.error('Error sending appointment reminder:', error);
      throw error;
    }
  }

  // Send email
  // emailAccount can be: 'primary', 'secondary', 'tertiary', 'quaternary', 'quinary', 'senary', 'septenary', a UUID string, or a database account object
  static async sendEmail(message, emailAccount = 'primary') {
    const messageId = message.id || 'unknown';
    const accountDisplay = typeof emailAccount === 'object' && emailAccount.email
      ? emailAccount.email
      : emailAccount;

    console.log('\n' + '='.repeat(80));
    console.log(`📧 [EMAIL SEND ATTEMPT]`);
    console.log('='.repeat(80));
    console.log(`📧 Message ID: ${messageId}`);
    console.log(`📧 Lead ID:    ${message.lead_id}`);
    console.log(`📧 To:         ${message.recipient_email}`);
    console.log(`📧 Subject:    ${message.subject}`);
    console.log(`📧 Email Account: ${accountDisplay}`);
    console.log(`📧 Body Length: ${message.email_body ? message.email_body.length : 0} characters`);

    // Log attachments information
    if (message.attachments && message.attachments.length > 0) {
      console.log(`📎 Attachments: ${message.attachments.length} files`);
      message.attachments.forEach((att, idx) => {
        console.log(`   ${idx + 1}. ${att.filename} (${att.path ? '✅ Path exists' : '❌ No path'})`);
      });
    } else {
      console.log(`📎 Attachments: None`);
    }

    console.log('-' .repeat(80));
  
    try {
      if (!message.recipient_email || !message.subject || !message.email_body) {
        const errorMsg = `📩 [MSG-${messageId}] Missing required fields: ${!message.recipient_email ? 'recipient_email, ' : ''}${!message.subject ? 'subject, ' : ''}${!message.email_body ? 'email_body' : ''}`.replace(/, $/, '');
        console.error(errorMsg);
        throw new Error(errorMsg);
      }
      
      console.log('📤 Sending email via Gmail SMTP...');
      
      // Actually send the email using the email service
      const startTime = Date.now();
      let emailResult = await sendActualEmail(
        message.recipient_email,
        message.subject,
        message.email_body,
        message.attachments || [],
        emailAccount // Pass the email account key
      );
      
      // If secondary/tertiary account fails with invalid_grant, try primary account as fallback
      if (!emailResult.success && ['secondary', 'tertiary', 'quaternary', 'quinary', 'senary', 'septenary'].includes(emailAccount) && emailResult.isInvalidGrant) {
        console.log(`⚠️ [MSG-${messageId}] ${emailAccount} account token expired, attempting fallback to primary account...`);
        
        try {
          emailResult = await sendActualEmail(
            message.recipient_email,
            message.subject,
            message.email_body,
            message.attachments || [],
            'primary' // Fallback to primary account
          );
          
          if (emailResult.success) {
            console.log(`✅ [MSG-${messageId}] Successfully sent via primary account (fallback)`);
            // Update emailAccount to reflect the account actually used
            emailAccount = 'primary';
          }
        } catch (fallbackError) {
          console.error(`❌ [MSG-${messageId}] Fallback to primary account also failed:`, fallbackError.message);
        }
      }
      
      const timeTaken = Date.now() - startTime;
      
      if (emailResult.success) {
        console.log('\n' + '✅'.repeat(40));
        console.log('✅ EMAIL SENT SUCCESSFULLY');
        console.log('✅'.repeat(40));
        console.log(`✅ Message ID: ${emailResult.messageId || 'N/A'}`);
        console.log(`✅ Response:   ${emailResult.response || 'No response'}`);
        console.log(`✅ Account:    ${emailResult.fallbackUsed ? 'primary (fallback)' : emailAccount}`);
        console.log(`✅ Time Taken: ${timeTaken}ms`);
        if (emailResult.fallbackUsed) {
          console.log(`⚠️  Note: Secondary account token expired, used primary account`);
        }
      } else {
        console.log('\n' + '❌'.repeat(40));
        console.log('❌ EMAIL SEND FAILED');
        console.log('❌'.repeat(40));
        console.log(`❌ Error: ${emailResult.error || 'Unknown error'}`);
        console.log(`❌ Code:  ${emailResult.code || 'N/A'}`);
        
        if (emailResult.isInvalidGrant) {
          console.log(`❌ Fix it on the Email Accounts page: press "Fix now" on this account. The new token saves automatically.`);
        }
      }
      
      // Update message status based on actual email result using Supabase
      const status = emailResult.success ? 'sent' : 'failed';
      const errorMessage = emailResult.error || (emailResult.success ? null : 'Unknown error');

      console.log(`📩 [MSG-${messageId}] Updating message status to: ${status}`);

      const { error: updateError } = await supabase
        .from('messages')
        .update({
          email_status: status,
          status: status,
          error_message: errorMessage,
          updated_at: new Date().toISOString()
        })
        .eq('id', message.id);

      if (updateError) {
        console.error(`❌ Error updating message ${messageId}:`, updateError);
      } else {
        console.log(`✅ Message ${messageId} updated successfully`);
      }

      // Add booking history entry for email sent
      console.log(`📩 [MSG-${messageId}] Adding booking history entry...`);

      try {
        const historyEntry = await addBookingHistoryEntry(
          message.lead_id,
          'EMAIL_SENT',
          message.sent_by,
          message.sent_by_name,
          {
            subject: message.subject,
            body: message.email_body,
            direction: 'sent',
            channel: 'email',
            status: status,
            error: errorMessage,
            messageId: messageId,
            emailResult: emailResult.success ? 'success' : 'failed'
          },
          message // Pass the full message as leadSnapshot for better history tracking
        );

        if (historyEntry !== null) {
          console.log(`✅ [MSG-${messageId}] Booking history entry added successfully`);
        } else {
          console.warn(`⚠️ [MSG-${messageId}] Booking history entry failed but continuing...`);
        }
      } catch (historyError) {
        console.error(`❌ [MSG-${messageId}] Unexpected error in booking history:`, historyError);
        // Continue processing - don't let history errors break email confirmation
      }
      
      console.log(`✅ [MSG-${messageId}] Email processing completed. Status: ${status}`);
      console.log(`   - Email sent: ${emailResult.success ? '✅ Yes' : '❌ No'}`);
      console.log(`   - Error: ${errorMessage || 'None'}`);

      // Note: No need to close Supabase connection

      // Notify clients to refresh inbox in real-time
      if (global.io) {
        global.io.emit('messages_synced', {
          totalSynced: 1,
          totalSkipped: 0,
          source: 'email_send',
          timestamp: new Date().toISOString()
        });
      }
      return emailResult.success;
      
    } catch (error) {
      console.error(`❌ [MSG-${messageId}] Error in sendEmail:`, error);
      
      // Update message status to failed using Supabase
      try {
        const errorMessage = error.message || 'Unknown error';

        console.error(`📩 [MSG-${messageId}] Updating message status to failed with error:`, errorMessage);

        const { error: updateError } = await supabase
          .from('messages')
          .update({
            email_status: 'failed',
            status: 'failed',
            error_message: errorMessage,
            updated_at: new Date().toISOString()
          })
          .eq('id', message.id);

        if (updateError) {
          console.error(`❌ Error updating failed message ${messageId}:`, updateError);
        }
        
        // Add error to booking history
        try {
          await addBookingHistoryEntry(
            message.lead_id,
            'EMAIL_FAILED',
            message.sent_by,
            message.sent_by_name || 'System',
            {
              subject: message.subject || 'No subject',
              error: errorMessage,
              direction: 'outbound',
              channel: 'email',
              status: 'failed',
              messageId: messageId
            },
            message
          );
        } catch (historyError) {
          console.error(`❌ [MSG-${messageId}] Error adding failed email to history:`, historyError);
          // Continue - don't let history errors break the process
        }

        // Note: No need to close Supabase connection
      } catch (dbError) {
        console.error(`❌ [MSG-${messageId}] Error updating database:`, dbError);
      }
      
      // Still notify clients to refresh so failures reflect in UI
      if (global.io) {
        global.io.emit('messages_synced', {
          totalSynced: 0,
          totalSkipped: 0,
          source: 'email_send_failed',
          timestamp: new Date().toISOString()
        });
      }
      
      return false;
    }  
  }

  // Send SMS
  static async sendSMS(message) {
    const messageId = message.id || 'unknown';
    console.log('\n' + '='.repeat(80));
    console.log(`📨 [SMS SEND ATTEMPT]`);
    console.log('='.repeat(80));
    console.log(`📨 Message ID: ${messageId}`);
    console.log(`📨 Lead ID:    ${message.lead_id}`);
    console.log(`📨 To:         ${message.recipient_phone}`);
    console.log(`📨 Body Length: ${message.sms_body ? message.sms_body.length : 0} characters`);
    console.log('-'.repeat(80));

    try {
      if (!message.recipient_phone || !message.sms_body) {
        const errorMsg = `📲 [MSG-${messageId}] Missing required fields: ${!message.recipient_phone ? 'recipient_phone, ' : ''}${!message.sms_body ? 'sms_body' : ''}`.replace(/, $/, '');
        console.error(errorMsg);
        throw new Error(errorMsg);
      }

      console.log('📤 Sending SMS via The SMS Works...');

      const startTime = Date.now();
      const smsResult = await sendActualSMS(message.recipient_phone, message.sms_body);
      const timeTaken = Date.now() - startTime;

      const wasSuccessful = !!(smsResult && smsResult.success);

      if (wasSuccessful) {
        console.log('\n' + '✅'.repeat(40));
        console.log('✅ SMS SENT SUCCESSFULLY');
        console.log('✅'.repeat(40));
        console.log(`✅ Provider:   ${smsResult.provider || 'thesmsworks'}`);
        console.log(`✅ Message ID: ${smsResult.messageId || 'N/A'}`);
        console.log(`✅ Status:     ${smsResult.status || 'submitted'}`);
        console.log(`✅ Time Taken: ${timeTaken}ms`);
      } else {
        console.log('\n' + '❌'.repeat(40));
        console.log('❌ SMS SEND FAILED');
        console.log('❌'.repeat(40));
        console.log(`❌ Error: ${smsResult && smsResult.error ? smsResult.error : 'Unknown error'}`);
      }

      // Update message status in Supabase
      const status = wasSuccessful ? 'sent' : 'failed';
      const errorMessage = wasSuccessful ? null : (smsResult && smsResult.error ? smsResult.error : 'Unknown error');

      console.log(`📨 [MSG-${messageId}] Updating message status to: ${status}`);

      const { error: updateError } = await supabase
        .from('messages')
        .update({
          status: status,
          error_message: errorMessage,
          updated_at: new Date().toISOString()
        })
        .eq('id', message.id);

      if (updateError) {
        console.error(`❌ Error updating SMS message ${messageId}:`, updateError);
      } else {
        console.log(`✅ SMS message ${messageId} updated successfully`);
      }

      // Add booking history entry for SMS sent/failed
      console.log(`📨 [MSG-${messageId}] Adding booking history entry...`);
      try {
        await addBookingHistoryEntry(
          message.lead_id,
          wasSuccessful ? 'SMS_SENT' : 'SMS_FAILED',
          message.sent_by,
          message.sent_by_name || 'System',
          {
            body: message.sms_body,
            direction: 'sent',
            channel: 'sms',
            status: status,
            error: errorMessage,
            provider: smsResult ? smsResult.provider : 'thesmsworks',
            messageId: smsResult ? smsResult.messageId : null
          },
          message
        );
      } catch (historyError) {
        console.error(`❌ [MSG-${messageId}] Error adding SMS to booking history:`, historyError);
        // Continue - don't let history errors break the process
      }

      // Real-time event for SMS send attempts (no notification bell)
      if (global.io) {
        try {
          global.io.emit('messages_synced', {
            totalSynced: wasSuccessful ? 1 : 0,
            totalSkipped: 0,
            source: wasSuccessful ? 'sms_send' : 'sms_send_failed',
            timestamp: new Date().toISOString()
          });
        } catch {}
      }

      return wasSuccessful;
    } catch (error) {
      console.error(`❌ [MSG-${messageId}] Error in sendSMS:`, error);

      // Update status to failed using Supabase
      try {
        const errorMessage = error.message || 'Unknown error';

        const { error: updateError } = await supabase
          .from('messages')
          .update({
            status: 'failed',
            error_message: errorMessage,
            updated_at: new Date().toISOString()
          })
          .eq('id', message.id);

        if (updateError) {
          console.error(`❌ Error updating failed SMS message ${messageId}:`, updateError);
        }

        try {
          await addBookingHistoryEntry(
            message.lead_id,
            'SMS_FAILED',
            message.sent_by,
            message.sent_by_name || 'System',
            {
              body: message.sms_body || 'No body',
              direction: 'outbound',
              channel: 'sms',
              status: 'failed',
              error: errorMessage,
              messageId: messageId
            },
            message
          );
        } catch (historyError) {
          console.error(`❌ [MSG-${messageId}] Error adding failed SMS to booking history:`, historyError);
          // Continue - don't let history errors break the process
        }
      } catch (dbError) {
        console.error(`❌ [MSG-${messageId}] Error updating database for SMS failure:`, dbError);
        // Note: No database connection to close with Supabase
      }

      if (global.io) {
        try {
          global.io.emit('messages_synced', {
            totalSynced: 0,
            totalSkipped: 0,
            source: 'sms_send_failed',
            timestamp: new Date().toISOString()
          });
        } catch {}
      }

      return false;
    }
  }

  // Stub for logging received SMS (to be called by future reply API)
  static async logSMSReceived(leadId, from, body) {
    const historyEntry = JSON.stringify({
      action: 'SMS_RECEIVED',
      timestamp: new Date().toISOString(),
      performed_by: null,
      performed_by_name: from || 'Lead',
      details: {
        body,
        direction: 'received',
        channel: 'sms',
        status: 'received'
      }
    });

    // For SQLite, we'll just log this for now
    console.log(`SMS received for lead ${leadId}: ${historyEntry}`);
  }

  // Get message history for a lead using Supabase
  static async getMessageHistory(leadId) {
    try {
      const { data: messages, error } = await supabase
        .from('messages')
        .select(`
          *,
          templates (
            name,
            type
          )
        `)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error getting message history:', error);
        return [];
      }

      // Transform the data to match the expected format
      const transformedMessages = messages.map(msg => ({
        ...msg,
        template_name: msg.templates?.name,
        template_type: msg.templates?.type
      }));

      return transformedMessages || [];
    } catch (error) {
      console.error('Error getting message history:', error);
      return [];
    }
  }

  // Schedule appointment reminders (legacy method - now handled by scheduler)
  static async scheduleAppointmentReminders() {
    console.log('Appointment reminders are now handled by the scheduler');
  }
}

module.exports = MessagingService; 