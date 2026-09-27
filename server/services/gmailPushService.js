const { createClient } = require('@supabase/supabase-js');
const gmailHistoryService = require('./gmailHistoryService');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Gmail Push Service
 * Handles incoming Google Cloud Pub/Sub notifications
 *
 * When Gmail detects changes, it sends a notification to our Pub/Sub topic.
 * This service:
 * 1. Decodes the base64-encoded Pub/Sub message
 * 2. Extracts the new historyId
 * 3. Triggers history-based sync via gmailHistoryService
 */

/**
 * Process Gmail Push Notification from Pub/Sub
 * @param {string} accountKey - 'primary' or 'secondary'
 * @param {object} pubsubMessage - Pub/Sub message from webhook
 * @returns {Promise<object>} - Processing result
 */
async function processGmailNotification(accountKey, pubsubMessage) {
  const result = {
    success: false,
    accountKey,
    error: null,
    messagesProcessed: 0
  };

  try {
    console.log(`🔔 [${accountKey}] Received Gmail push notification`);

    // Update last notification received timestamp
    await updateLastNotificationTimestamp(accountKey);

    // Validate Pub/Sub message structure
    if (!pubsubMessage || !pubsubMessage.message) {
      throw new Error('Invalid Pub/Sub message structure');
    }

    const message = pubsubMessage.message;

    // Decode base64-encoded data
    const decodedData = message.data
      ? Buffer.from(message.data, 'base64').toString('utf-8')
      : '{}';

    console.log(`📧 [${accountKey}] Decoded notification data:`, decodedData);

    let notificationData;
    try {
      notificationData = JSON.parse(decodedData);
    } catch (parseError) {
      console.warn(`⚠️ [${accountKey}] Failed to parse notification data:`, parseError.message);
      notificationData = {};
    }

    // Extract historyId from notification
    const newHistoryId = notificationData.historyId;

    if (!newHistoryId) {
      console.log(`⚠️ [${accountKey}] No historyId in notification - may be initial watch setup`);
      result.success = true;
      return result;
    }

    console.log(`📊 [${accountKey}] New historyId: ${newHistoryId}`);

    // Process history changes since last historyId
    const syncResult = await gmailHistoryService.processHistoryChanges(accountKey, newHistoryId);

    result.success = syncResult.success;
    result.messagesProcessed = syncResult.messagesAdded;
    result.syncDetails = syncResult;

    if (syncResult.success) {
      console.log(`✅ [${accountKey}] Push notification processed: ${syncResult.messagesAdded} new messages`);
    } else {
      console.error(`❌ [${accountKey}] Push notification processing failed`);
      result.error = syncResult.errors;
    }

    return result;

  } catch (error) {
    console.error(`❌ [${accountKey}] Error processing push notification:`, error.message);

    result.error = error.message;
    result.success = false;

    // Log error to database
    await logNotificationError(accountKey, error.message);

    return result;
  }
}

/**
 * Update last notification received timestamp
 * @param {string} accountKey - 'primary' or 'secondary'
 */
async function updateLastNotificationTimestamp(accountKey) {
  try {
    await supabase
      .from('gmail_watch_state')
      .update({
        last_notification_received: new Date().toISOString()
      })
      .eq('account_key', accountKey);

  } catch (error) {
    console.error(`❌ [${accountKey}] Failed to update notification timestamp:`, error.message);
  }
}

/**
 * Log notification processing error to database
 * @param {string} accountKey - 'primary' or 'secondary'
 * @param {string} errorMessage - Error message
 */
async function logNotificationError(accountKey, errorMessage) {
  try {
    await supabase
      .from('gmail_watch_state')
      .update({
        error_count: supabase.raw('COALESCE(error_count, 0) + 1'),
        last_error: `Notification error: ${errorMessage}`,
        updated_at: new Date().toISOString()
      })
      .eq('account_key', accountKey);

  } catch (error) {
    console.error(`❌ [${accountKey}] Failed to log error:`, error.message);
  }
}

/**
 * Validate Pub/Sub webhook secret token
 * @param {string} token - Token from webhook URL query parameter
 * @returns {boolean} - True if valid
 */
function validateWebhookToken(token) {
  const expectedToken = process.env.GMAIL_WEBHOOK_SECRET;

  if (!expectedToken) {
    console.error('❌ GMAIL_WEBHOOK_SECRET not configured');
    return false;
  }

  return token === expectedToken;
}

module.exports = {
  processGmailNotification,
  validateWebhookToken
};
