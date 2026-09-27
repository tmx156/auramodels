const { createClient } = require('@supabase/supabase-js');
const gmailService = require('../utils/gmailService');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Gmail History Service
 * Implements historyId-based incremental sync for efficient Gmail API usage
 *
 * How it works:
 * 1. Gmail assigns a historyId to every mailbox state change
 * 2. We store the last processed historyId in the database
 * 3. When notified, we fetch only changes since that historyId
 * 4. This reduces API calls by 90% compared to polling
 */

/**
 * Get stored historyId for an account
 * @param {string} accountKey - 'primary' or 'secondary'
 * @returns {Promise<string|null>} - The stored historyId or null
 */
async function getStoredHistoryId(accountKey) {
  try {
    const { data, error } = await supabase
      .from('gmail_watch_state')
      .select('history_id')
      .eq('account_key', accountKey)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No record found - first time setup
        console.log(`📝 No history record found for ${accountKey} account`);
        return null;
      }
      throw error;
    }

    return data?.history_id || null;
  } catch (error) {
    console.error(`❌ Error getting stored historyId for ${accountKey}:`, error.message);
    return null;
  }
}

/**
 * Update stored historyId after processing changes
 * @param {string} accountKey - 'primary' or 'secondary'
 * @param {string} newHistoryId - The new historyId to store
 * @returns {Promise<boolean>} - Success status
 */
async function updateHistoryId(accountKey, newHistoryId) {
  try {
    const { error } = await supabase
      .from('gmail_watch_state')
      .update({
        history_id: newHistoryId,
        last_sync_completed: new Date().toISOString(),
        error_count: 0,
        last_error: null
      })
      .eq('account_key', accountKey);

    if (error) throw error;

    console.log(`✅ Updated historyId for ${accountKey}: ${newHistoryId}`);
    return true;
  } catch (error) {
    console.error(`❌ Error updating historyId for ${accountKey}:`, error.message);
    return false;
  }
}

/**
 * Initialize historyId for first-time setup (start from "now")
 * @param {string} accountKey - 'primary' or 'secondary'
 * @param {string} historyId - The initial historyId
 * @returns {Promise<boolean>} - Success status
 */
async function initializeHistoryId(accountKey, historyId) {
  try {
    const accountInfo = gmailService.getAccountInfo(accountKey);

    const { error } = await supabase
      .from('gmail_watch_state')
      .upsert({
        account_key: accountKey,
        email_address: accountInfo.email,
        history_id: historyId,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'account_key'
      });

    if (error) throw error;

    console.log(`✅ Initialized historyId for ${accountKey} (${accountInfo.email}): ${historyId}`);
    return true;
  } catch (error) {
    console.error(`❌ Error initializing historyId for ${accountKey}:`, error.message);
    return false;
  }
}

/**
 * Process history changes since last historyId
 * @param {string} accountKey - 'primary' or 'secondary'
 * @param {string} newHistoryId - The new historyId from notification
 * @returns {Promise<object>} - Processing results
 */
async function processHistoryChanges(accountKey, newHistoryId) {
  const result = {
    success: false,
    messagesAdded: 0,
    messagesProcessed: 0,
    errors: []
  };

  try {
    console.log(`📬 Processing history changes for ${accountKey} account...`);

    // Get the last stored historyId
    const startHistoryId = await getStoredHistoryId(accountKey);

    if (!startHistoryId) {
      console.log(`⚠️ No previous historyId found for ${accountKey}. Initializing from current state.`);
      await initializeHistoryId(accountKey, newHistoryId);
      result.success = true;
      return result;
    }

    // Fetch history changes from Gmail API
    const gmail = await gmailService.getGmailClient(accountKey);
    const accountInfo = gmailService.getAccountInfo(accountKey);

    console.log(`🔍 Fetching history changes from ${startHistoryId} to ${newHistoryId}...`);

    const response = await gmail.users.history.list({
      userId: 'me',
      startHistoryId: startHistoryId,
      historyTypes: ['messageAdded'], // Only track new messages
      maxResults: 100
    });

    const history = response.data.history || [];

    if (history.length === 0) {
      console.log(`✅ No new messages in history for ${accountKey}`);
      await updateHistoryId(accountKey, newHistoryId);
      result.success = true;
      return result;
    }

    console.log(`📨 Found ${history.length} history records for ${accountKey}`);

    // Process each history record
    const gmailMessageProcessor = require('./gmailMessageProcessor');

    for (const record of history) {
      if (record.messagesAdded) {
        for (const messageAdded of record.messagesAdded) {
          const messageId = messageAdded.message.id;
          result.messagesProcessed++;

          try {
            const processed = await gmailMessageProcessor.processGmailMessage(accountKey, messageId);
            if (processed) {
              result.messagesAdded++;
            }
          } catch (error) {
            console.error(`❌ Error processing message ${messageId}:`, error.message);
            result.errors.push({
              messageId,
              error: error.message
            });
          }
        }
      }
    }

    // Update the stored historyId
    await updateHistoryId(accountKey, newHistoryId);

    result.success = true;
    console.log(`✅ History sync completed for ${accountKey}: ${result.messagesAdded} new messages stored`);

    return result;

  } catch (error) {
    console.error(`❌ Error processing history changes for ${accountKey}:`, error.message);

    // Increment error counter in database
    try {
      await supabase
        .from('gmail_watch_state')
        .update({
          error_count: supabase.raw('error_count + 1'),
          last_error: error.message
        })
        .eq('account_key', accountKey);
    } catch (dbError) {
      console.error(`❌ Failed to update error count:`, dbError.message);
    }

    result.errors.push({
      general: error.message
    });

    return result;
  }
}

/**
 * Get current historyId from Gmail (for initialization)
 * @param {string} accountKey - 'primary' or 'secondary'
 * @returns {Promise<string|null>} - The current historyId
 */
async function getCurrentHistoryId(accountKey) {
  try {
    const gmail = await gmailService.getGmailClient(accountKey);

    const response = await gmail.users.getProfile({
      userId: 'me'
    });

    return response.data.historyId;
  } catch (error) {
    console.error(`❌ Error getting current historyId for ${accountKey}:`, error.message);
    return null;
  }
}

module.exports = {
  getStoredHistoryId,
  updateHistoryId,
  initializeHistoryId,
  processHistoryChanges,
  getCurrentHistoryId
};
