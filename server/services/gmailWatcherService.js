const { createClient } = require('@supabase/supabase-js');
const gmailService = require('../utils/gmailService');
const gmailHistoryService = require('./gmailHistoryService');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Gmail Watcher Service
 * Manages Gmail Push Notification watch lifecycle
 *
 * Gmail watches expire after 7 days and must be renewed.
 * This service handles:
 * - Creating watches on startup
 * - Auto-renewing watches 24 hours before expiration
 * - Tracking watch state in database
 * - Graceful shutdown
 */

// Watch renewal check interval (every hour)
const RENEWAL_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const RENEWAL_THRESHOLD_HOURS = 24; // Renew 24h before expiration

let renewalTimer = null;
let isWatching = false;

/**
 * Start watching both Gmail accounts
 * Creates watches and starts renewal monitoring
 */
async function startWatching() {
  if (isWatching) {
    console.log('📧 Gmail Watcher: Already watching');
    return;
  }

  console.log('📧 Gmail Watcher: Starting...');

  try {
    // Watch both accounts
    await watchAccount('primary');
    await watchAccount('secondary');

    // Start renewal monitoring
    startRenewalMonitoring();

    isWatching = true;
    console.log('✅ Gmail Watcher: Started successfully');

  } catch (error) {
    console.error('❌ Gmail Watcher: Failed to start:', error.message);
    throw error;
  }
}

/**
 * Watch a specific Gmail account
 * @param {string} accountKey - 'primary' or 'secondary'
 */
async function watchAccount(accountKey) {
  try {
    const accountInfo = gmailService.getAccountInfo(accountKey);
    console.log(`📧 [${accountKey}] Setting up watch for ${accountInfo.email}...`);

    // Get Gmail client
    const gmail = await gmailService.getGmailClient(accountKey);

    // Get Google Cloud Pub/Sub topic name
    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
    if (!projectId) {
      throw new Error('GOOGLE_CLOUD_PROJECT_ID not set in environment variables');
    }

    const topicName = `gmail-notifications-${accountKey}`;
    const fullTopicName = `projects/${projectId}/topics/${topicName}`;

    console.log(`📧 [${accountKey}] Creating watch with topic: ${fullTopicName}`);

    // Create watch via Gmail API
    const response = await gmail.users.watch({
      userId: 'me',
      requestBody: {
        labelIds: ['INBOX'],
        topicName: fullTopicName
      }
    });

    const historyId = response.data.historyId;
    const expiration = response.data.expiration; // Unix timestamp in milliseconds

    console.log(`✅ [${accountKey}] Watch created successfully`);
    console.log(`📊 [${accountKey}] History ID: ${historyId}`);
    console.log(`📊 [${accountKey}] Expires: ${new Date(parseInt(expiration)).toISOString()}`);

    // Store watch state in database
    await storeWatchState(accountKey, accountInfo.email, historyId, expiration);

    // Initialize historyId for incremental sync
    await gmailHistoryService.initializeHistoryId(accountKey, historyId);

    console.log(`✅ [${accountKey}] Watch state saved to database`);

  } catch (error) {
    console.error(`❌ [${accountKey}] Failed to create watch:`, error.message);

    // Log detailed error for debugging
    if (error.response?.data) {
      console.error(`❌ [${accountKey}] API Error Details:`, JSON.stringify(error.response.data, null, 2));
    }

    // Store error in database
    await storeWatchError(accountKey, error.message);

    throw error;
  }
}

/**
 * Store watch state in database
 * @param {string} accountKey - 'primary' or 'secondary'
 * @param {string} emailAddress - Email address
 * @param {string} historyId - Gmail historyId
 * @param {string} expiration - Expiration timestamp (milliseconds)
 */
async function storeWatchState(accountKey, emailAddress, historyId, expiration) {
  try {
    const expirationDate = new Date(parseInt(expiration));

    const { error } = await supabase
      .from('gmail_watch_state')
      .upsert({
        account_key: accountKey,
        email_address: emailAddress,
        history_id: historyId,
        watch_expiration: expirationDate.toISOString(),
        is_active: true,
        error_count: 0,
        last_error: null,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'account_key'
      });

    if (error) throw error;

  } catch (error) {
    console.error(`❌ [${accountKey}] Failed to store watch state:`, error.message);
    throw error;
  }
}

/**
 * Store watch error in database
 * @param {string} accountKey - 'primary' or 'secondary'
 * @param {string} errorMessage - Error message
 */
async function storeWatchError(accountKey, errorMessage) {
  try {
    await supabase
      .from('gmail_watch_state')
      .update({
        is_active: false,
        error_count: supabase.raw('COALESCE(error_count, 0) + 1'),
        last_error: errorMessage,
        updated_at: new Date().toISOString()
      })
      .eq('account_key', accountKey);

  } catch (error) {
    console.error(`❌ [${accountKey}] Failed to store watch error:`, error.message);
  }
}

/**
 * Start monitoring for watch renewal
 * Checks every hour if watches need renewal
 */
function startRenewalMonitoring() {
  if (renewalTimer) {
    clearInterval(renewalTimer);
  }

  console.log(`📧 Gmail Watcher: Starting renewal monitoring (checking every ${RENEWAL_CHECK_INTERVAL_MS / 1000 / 60} minutes)`);

  renewalTimer = setInterval(async () => {
    try {
      await checkAndRenewWatches();
    } catch (error) {
      console.error('❌ Gmail Watcher: Error checking renewals:', error.message);
    }
  }, RENEWAL_CHECK_INTERVAL_MS);

  // Do initial check
  checkAndRenewWatches();
}

/**
 * Check if watches need renewal and renew them
 */
async function checkAndRenewWatches() {
  try {
    console.log('📧 Gmail Watcher: Checking if watches need renewal...');

    // Get all active watches
    const { data: watches, error } = await supabase
      .from('gmail_watch_state')
      .select('*')
      .eq('is_active', true);

    if (error) throw error;

    if (!watches || watches.length === 0) {
      console.log('📧 Gmail Watcher: No active watches found');
      return;
    }

    const now = new Date();

    for (const watch of watches) {
      const expiration = new Date(watch.watch_expiration);
      const hoursUntilExpiration = (expiration - now) / (1000 * 60 * 60);

      console.log(`📧 [${watch.account_key}] Watch expires in ${hoursUntilExpiration.toFixed(1)} hours`);

      // Renew if less than 24 hours until expiration
      if (hoursUntilExpiration < RENEWAL_THRESHOLD_HOURS) {
        console.log(`⚠️ [${watch.account_key}] Watch expiring soon - renewing...`);
        await renewWatch(watch.account_key);
      }
    }

  } catch (error) {
    console.error('❌ Gmail Watcher: Error checking renewals:', error.message);
  }
}

/**
 * Renew watch for a specific account
 * @param {string} accountKey - 'primary' or 'secondary'
 */
async function renewWatch(accountKey) {
  try {
    console.log(`🔄 [${accountKey}] Renewing watch...`);

    // Simply create a new watch (this automatically renews)
    await watchAccount(accountKey);

    console.log(`✅ [${accountKey}] Watch renewed successfully`);

  } catch (error) {
    console.error(`❌ [${accountKey}] Failed to renew watch:`, error.message);

    // Increment error count
    await storeWatchError(accountKey, `Renewal failed: ${error.message}`);

    throw error;
  }
}

/**
 * Stop watching (graceful shutdown)
 * Stops Gmail API watches using stop() method
 */
async function stopWatching() {
  console.log('📧 Gmail Watcher: Stopping...');

  isWatching = false;

  // Stop renewal monitoring
  if (renewalTimer) {
    clearInterval(renewalTimer);
    renewalTimer = null;
  }

  try {
    // Stop watches for both accounts
    await stopWatch('primary');
    await stopWatch('secondary');

    console.log('✅ Gmail Watcher: Stopped successfully');

  } catch (error) {
    console.error('❌ Gmail Watcher: Error during shutdown:', error.message);
  }
}

/**
 * Stop watch for a specific account
 * @param {string} accountKey - 'primary' or 'secondary'
 */
async function stopWatch(accountKey) {
  try {
    console.log(`📧 [${accountKey}] Stopping watch...`);

    const gmail = await gmailService.getGmailClient(accountKey);

    // Call Gmail API stop() to terminate watch
    await gmail.users.stop({
      userId: 'me'
    });

    // Update database
    await supabase
      .from('gmail_watch_state')
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('account_key', accountKey);

    console.log(`✅ [${accountKey}] Watch stopped`);

  } catch (error) {
    // It's okay if stop fails (e.g., watch already expired)
    console.warn(`⚠️ [${accountKey}] Stop watch error (may be expected):`, error.message);
  }
}

/**
 * Get watch status for all accounts
 * @returns {Promise<object>} - Watch status
 */
async function getWatchStatus() {
  try {
    const { data: watches, error } = await supabase
      .from('gmail_watch_state')
      .select('*')
      .order('account_key');

    if (error) throw error;

    return {
      isWatching,
      accounts: watches || []
    };

  } catch (error) {
    console.error('❌ Gmail Watcher: Error getting status:', error.message);
    return {
      isWatching,
      accounts: [],
      error: error.message
    };
  }
}

module.exports = {
  startWatching,
  stopWatching,
  watchAccount,
  renewWatch,
  checkAndRenewWatches,
  getWatchStatus
};
