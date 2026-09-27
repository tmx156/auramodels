const { createClient } = require('@supabase/supabase-js');
const { randomUUID } = require('crypto');
const gmailService = require('../utils/gmailService');
const GmailEmailExtractor = require('../utils/gmailEmailExtractor');
const supabaseStorage = require('../utils/supabaseStorage');
const { readBookingHistory } = require('../utils/bookingHistory');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Socket.IO instance (set by server.js)
let io = null;

/**
 * Gmail Message Processor
 * Processes individual Gmail messages from Push Notifications
 * Extracted and refactored from gmailPoller.js for push notification architecture
 */

/**
 * Set Socket.IO instance for real-time events
 * @param {object} ioInstance - Socket.IO server instance
 */
function setSocketIO(ioInstance) {
  io = ioInstance;
  console.log('✅ Gmail Message Processor: Socket.IO instance configured');
}

/**
 * Process a single Gmail message
 * @param {string} accountKey - 'primary' or 'secondary'
 * @param {string} messageId - Gmail message ID
 * @returns {Promise<boolean>} - True if processed and stored, false if skipped
 */
async function processGmailMessage(accountKey, messageId) {
  try {
    console.log(`📧 [${accountKey}] Processing message: ${messageId}`);

    // Get Gmail client for this account
    const gmail = await gmailService.getGmailClient(accountKey);
    const accountInfo = gmailService.getAccountInfo(accountKey);

    // Fetch full message from Gmail API
    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full'
    });

    const message = response.data;
    const headers = message.payload.headers;

    // Extract email headers
    const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

    const from = getHeader('From');
    const to = getHeader('To');
    const subject = getHeader('Subject');
    const date = getHeader('Date');

    // Extract email address from "Name <email@example.com>" format
    const extractEmail = (str) => {
      const match = str.match(/<([^>]+)>/);
      return match ? match[1] : str.trim();
    };

    const fromEmail = extractEmail(from);
    const toEmail = extractEmail(to);

    console.log(`📧 [${accountKey}] From: ${fromEmail}, To: ${toEmail}, Subject: "${subject}"`);

    // Only process emails TO our account (received emails, not sent)
    // Use proper matching to avoid false positives
    const accountEmail = accountInfo.email.toLowerCase();
    const toEmailLower = toEmail.toLowerCase();
    
    const isToOurAccount = toEmailLower === accountEmail || 
                           toEmailLower.endsWith(`<${accountEmail}>`) ||
                           toEmailLower.includes(`<${accountEmail}>`);
    
    if (!isToOurAccount) {
      console.log(`📧 [${accountKey}] Skipping - not sent to ${accountInfo.email} (To: ${toEmail})`);
      return false;
    }

    // Find lead by sender email
    const lead = await findLead(fromEmail);

    if (!lead) {
      console.log(`📧 [${accountKey}] No lead found for ${fromEmail} - skipping (unknown sender)`);
      return false;
    }

    console.log(`📧 [${accountKey}] Found lead: ${lead.name} (${lead.email})`);

    // Check for duplicates using gmail_message_id
    const { data: existingByGmailId, error: gmailIdCheckError } = await supabase
      .from('messages')
      .select('id')
      .eq('gmail_message_id', messageId)
      .eq('lead_id', lead.id)
      .limit(1);

    if (gmailIdCheckError) {
      throw new Error(`DB_ERROR_GMAIL_ID_CHECK: ${gmailIdCheckError.message}`);
    }

    if (existingByGmailId && existingByGmailId.length > 0) {
      console.log(`📧 [${accountKey}] Duplicate detected - already in DB (message ID: ${existingByGmailId[0].id})`);
      return false;
    }

    // Extract email content using enhanced extractor (HTML + embedded images)
    // (reuses the `gmail` client obtained at the top of this function)
    const extractor = new GmailEmailExtractor(gmail, accountKey, supabaseStorage);
    const emailContent = await extractor.extractEmailContent(message, messageId);
    
    // Get text and HTML versions
    const bodyText = emailContent.text || extractor.cleanEmailBody(emailContent.text || '', false);
    const htmlBody = emailContent.html || null;
    const embeddedImages = emailContent.embeddedImages || [];

    if (!bodyText || bodyText.trim().length === 0) {
      console.warn(`📧 [${accountKey}] Extracted content too short or empty - skipping`);
      return false;
    }

    console.log(`📧 [${accountKey}] Body extracted: ${bodyText.substring(0, 100)}...`);
    if (htmlBody) {
      console.log(`📧 [${accountKey}] HTML body extracted: ${htmlBody.length} characters`);
    }
    if (embeddedImages.length > 0) {
      console.log(`📧 [${accountKey}] Found ${embeddedImages.length} embedded image(s)`);
    }

    // Store embedded images metadata
    const embeddedImagesMetadata = embeddedImages.map(img => ({
      ...img,
      is_embedded: true
    }));

    // Insert to messages table
    const recordId = randomUUID();
    const emailReceivedDate = date ? new Date(date).toISOString() : new Date().toISOString();
    const processingDate = new Date().toISOString();

    const { data: insertedMessage, error: insertError } = await supabase
      .from('messages')
      .insert({
        id: recordId,
        lead_id: lead.id,
        type: 'email',
        subject: subject,
        content: bodyText, // Plain text version
        email_body: htmlBody || null, // HTML version for Gmail-style rendering
        recipient_email: fromEmail,
        status: 'received',
        gmail_message_id: messageId,
        gmail_account_key: accountKey, // Track which account received it
        attachments: embeddedImagesMetadata.length > 0 ? embeddedImagesMetadata : null, // Store embedded images
        sent_at: emailReceivedDate,
        created_at: processingDate,
        updated_at: processingDate,
        read_status: false
      })
      .select('id')
      .single();

    if (insertError) {
      // Check if it's a unique constraint violation (duplicate)
      if (insertError.code === '23505') {
        console.log(`📧 [${accountKey}] Duplicate caught by database constraint - skipping`);
        return false;
      }
      throw new Error(`DB_ERROR_INSERT: ${insertError.message}`);
    }

    if (!insertedMessage) {
      throw new Error('DB_ERROR_INSERT: No data returned after insert');
    }

    // 🔔 REPLY ROUTING: Find original sender and notify them
    await routeReplyToOriginalSender(lead, subject, fromEmail, recordId, accountKey);

    // Update booking history
    await updateLeadHistory(lead, subject, bodyText, emailReceivedDate, accountKey);

    // Emit Socket.IO events
    emitEvents(lead, recordId, subject, bodyText, emailReceivedDate, accountKey);

    console.log(`✅ [${accountKey}] Email stored successfully: "${subject}" from ${fromEmail}`);
    return true;

  } catch (error) {
    console.error(`❌ [${accountKey}] Error processing message ${messageId}:`, error.message);
    throw error;
  }
}

/**
 * Extract email body from Gmail message payload
 * @param {object} payload - Gmail message payload
 * @returns {string} - Extracted email body
 */
function extractEmailBody(payload) {
  let body = '';

  // Helper function to decode base64url
  const decodeBase64Url = (data) => {
    if (!data) return '';
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf8');
  };

  // Recursive function to extract text from parts
  const extractFromParts = (parts) => {
    if (!parts) return '';

    for (const part of parts) {
      // Check for nested parts
      if (part.parts) {
        const nested = extractFromParts(part.parts);
        if (nested) return nested;
      }

      // Extract text/plain content
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }

    // Fall back to text/html if no plain text
    for (const part of parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        const html = decodeBase64Url(part.body.data);
        return htmlToText(html);
      }
    }

    return '';
  };

  // Check if message has parts (multipart)
  if (payload.parts) {
    body = extractFromParts(payload.parts);
  }
  // Single part message
  else if (payload.body?.data) {
    body = decodeBase64Url(payload.body.data);
    if (payload.mimeType === 'text/html') {
      body = htmlToText(body);
    }
  }

  // Clean up the body
  body = cleanEmailBody(body);

  return body;
}

/**
 * Convert HTML to plain text
 * @param {string} html - HTML content
 * @returns {string} - Plain text
 */
function htmlToText(html) {
  if (!html) return '';

  let text = html;

  // Remove style and script tags
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

  // Convert block elements to newlines
  text = text.replace(/<\/?(div|p|br|h[1-6]|li|tr)[^>]*>/gi, '\n');
  text = text.replace(/<\/td>/gi, '\t');

  // Remove all other HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');

  // Clean up whitespace
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/^\s+|\s+$/gm, '');

  return text.trim();
}

/**
 * Clean email body - remove quoted replies, signatures, etc.
 * @param {string} body - Raw email body
 * @returns {string} - Cleaned email body
 */
function cleanEmailBody(body) {
  if (!body) return '';

  const lines = body.split(/\r?\n/);
  const customerLines = [];
  let foundCustomerContent = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Stop at quoted reply markers
    if (
      trimmed.match(/^On .+wrote:?/i) ||
      trimmed.match(/^From:.*Sent:.*To:/i) ||
      trimmed.match(/^----+ ?Original [Mm]essage ?----+/)
    ) {
      if (foundCustomerContent) break;
      continue;
    }

    // Stop at signature markers
    if (foundCustomerContent && (
      trimmed.match(/^Sent from/i) ||
      trimmed.match(/^Get Outlook/i) ||
      trimmed.match(/^(Regards|Kind regards|Best regards|Thanks|Thank you)[\s,]*$/i)
    )) {
      break;
    }

    // Add non-empty lines
    if (trimmed.length > 0) {
      customerLines.push(line);
      foundCustomerContent = true;
    }
  }

  let result = customerLines.join('\n');

  // Clean up extra whitespace
  result = result.replace(/\n{3,}/g, '\n\n');
  result = result.replace(/[ \t]+/g, ' ');
  result = result.trim();

  return result;
}

/**
 * Find lead by email address
 * @param {string} email - Email address
 * @returns {Promise<object|null>} - Lead object or null
 */
async function findLead(email) {
  if (!email) return null;

  const { data: leadData, error: leadError } = await supabase
    .from('leads')
    .select('*')
    .ilike('email', email.trim())
    .single();

  if (leadError && leadError.code === 'PGRST116') {
    // No lead found
    return null;
  }

  if (leadError) {
    console.error(`❌ Database error finding lead for ${email}:`, leadError.message);
    throw new Error(`DB_ERROR_LEAD_SEARCH: ${leadError.message}`);
  }

  return leadData;
}

/**
 * Update lead booking history
 * @param {object} lead - Lead object
 * @param {string} subject - Email subject
 * @param {string} body - Email body
 * @param {string} emailReceivedDate - Email received timestamp
 * @param {string} accountKey - 'primary' or 'secondary'
 */
async function updateLeadHistory(lead, subject, body, emailReceivedDate, accountKey) {
  // Read whichever shape the column holds. If it cannot be read we must NOT
  // overwrite it - doing so would wipe the lead's entire history.
  const { history, readable } = readBookingHistory(lead);
  if (!readable) {
    console.warn(`⚠️ Booking history for lead ${lead.id} (${lead.name}) is unreadable - skipping update so existing history is not lost`);
    return;
  }

  const accountInfo = gmailService.getAccountInfo(accountKey);

  const updatedHistory = [{
    action: 'EMAIL_RECEIVED',
    timestamp: emailReceivedDate,
    details: {
      subject,
      body: body.substring(0, 150) + '...',
      direction: 'received',
      channel: 'email',
      account: accountInfo.email,
      read: false
    }
  }, ...history];

  const { error: updateError } = await supabase
    .from('leads')
    .update({
      booking_history: updatedHistory,
      updated_at: new Date().toISOString()
    })
    .eq('id', lead.id);

  if (updateError) {
    console.error('❌ Error updating lead booking history:', updateError.message);
  }
}

/**
 * Emit Socket.IO events for real-time updates
 * @param {object} lead - Lead object
 * @param {string} messageId - Message ID
 * @param {string} subject - Email subject
 * @param {string} body - Email body
 * @param {string} emailReceivedDate - Email received timestamp
 * @param {string} accountKey - 'primary' or 'secondary'
 */
function emitEvents(lead, messageId, subject, body, emailReceivedDate, accountKey) {
  if (!io) {
    console.warn('⚠️ Socket.IO not configured - skipping event emission');
    return;
  }

  const rooms = [];
  if (lead.booker_id) rooms.push(`user_${lead.booker_id}`);
  rooms.push('admins');

  const accountInfo = gmailService.getAccountInfo(accountKey);

  const payload = {
    messageId,
    leadId: lead.id,
    leadName: lead.name,
    leadEmail: lead.email,
    leadPhone: lead.phone,
    leadStatus: lead.status,
    content: subject || body.slice(0, 120),
    timestamp: emailReceivedDate,
    direction: 'received',
    channel: 'email',
    account: accountInfo.email,
    accountKey,
    subject,
    body
  };

  rooms.forEach(room => {
    io.to(room).emit('email_received', payload);
    io.to(room).emit('message_received', payload);
    io.to(room).emit('lead_updated', {
      type: 'LEAD_UPDATED',
      data: { lead }
    });
  });

  console.log(`📤 Socket.IO events emitted to rooms: ${rooms.join(', ')}`);
}

/**
 * 🔔 REPLY ROUTING: Find original sender and notify them of reply
 * This ensures email replies go to the user who sent the original message
 */
async function routeReplyToOriginalSender(lead, subject, fromEmail, messageId, accountKey) {
  try {
    // Normalize subject by removing Re:/Fwd:/FW: prefixes
    const normalizedSubject = subject.replace(/^(re|fwd?|fw):\s*/i, '').trim().toLowerCase();
    
    if (!normalizedSubject) return;

    // Find recent sent emails to this lead with similar subject
    const { data: sentMessages, error } = await supabase
      .from('messages')
      .select('id, sent_by, sent_by_name, subject, sent_at, content')
      .eq('lead_id', lead.id)
      .eq('type', 'email')
      .not('sent_by', 'is', null) // Only sent messages (have sent_by)
      .order('sent_at', { ascending: false })
      .limit(10);

    if (error || !sentMessages || sentMessages.length === 0) {
      return; // No sent messages found
    }

    // Find matching message by subject (normalized)
    const matchingMessage = sentMessages.find(msg => {
      const msgSubject = (msg.subject || '').replace(/^(re|fwd?|fw):\s*/i, '').trim().toLowerCase();
      return msgSubject === normalizedSubject || 
             normalizedSubject.includes(msgSubject) || 
             msgSubject.includes(normalizedSubject);
    });

    if (!matchingMessage || !matchingMessage.sent_by) {
      return; // No matching original message
    }

    const originalSenderId = matchingMessage.sent_by;
    const originalSenderName = matchingMessage.sent_by_name || 'Unknown';

    console.log(`📧 [REPLY ROUTING] Reply from ${fromEmail} matches original message sent by ${originalSenderName}`);
    console.log(`📧 [REPLY ROUTING] Notifying user ${originalSenderId} of reply to lead ${lead.name}`);

    // Emit specific event to original sender
    if (io) {
      io.to(`user_${originalSenderId}`).emit('email_reply_received', {
        messageId,
        leadId: lead.id,
        leadName: lead.name,
        replyFrom: fromEmail,
        subject: subject,
        originalMessageId: matchingMessage.id,
        timestamp: new Date().toISOString()
      });

      // Also emit to admins
      io.to('admins').emit('email_reply_received', {
        messageId,
        leadId: lead.id,
        leadName: lead.name,
        replyFrom: fromEmail,
        subject: subject,
        originalSenderId: originalSenderId,
        originalSenderName: originalSenderName,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error('❌ [REPLY ROUTING] Error routing reply:', error.message);
    // Don't throw - this shouldn't break email processing
  }
}

module.exports = {
  setSocketIO,
  processGmailMessage,
  extractEmailBody,
  htmlToText,
  cleanEmailBody,
  findLead,
  updateLeadHistory,
  emitEvents
};
