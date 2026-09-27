const { google } = require('googleapis');
const { randomUUID } = require('crypto');
const fs = require('fs').promises;
const fsSync = require('fs'); // For synchronous operations like existsSync
const path = require('path');
const config = require('../config');
const supabaseStorage = require('./supabaseStorage');
const GmailEmailExtractor = require('./gmailEmailExtractor');
const { getSupabaseClient } = require('../config/supabase-client');
const { readBookingHistory } = require('./bookingHistory');

/**
 * Gmail API Poller - Multi-Account Support
 * Polls both primary and secondary Gmail accounts for ALL unprocessed emails
 * No time limits, no message limits - processes 100% of emails
 */

// --- Configuration ---
// Use singleton Supabase client to prevent connection leaks

const POLL_INTERVAL_MS = parseInt(process.env.GMAIL_POLL_INTERVAL_MS) || 180000; // 3 minutes default (reduced from 2 min to reduce log spam)
const VERBOSE_LOGGING = process.env.VERBOSE_GMAIL_LOGGING === 'true'; // Set to 'true' for debug logs

// Account configurations (matching gmailService.js pattern)
const ACCOUNTS = {
  primary: {
    email: process.env.GMAIL_EMAIL || 'hello@example.com',
    clientId: process.env.GMAIL_CLIENT_ID,
    clientSecret: process.env.GMAIL_CLIENT_SECRET,
    refreshToken: process.env.GMAIL_REFRESH_TOKEN,
    redirectUri: process.env.GMAIL_REDIRECT_URI || 'http://localhost:5000/api/gmail/oauth2callback',
    displayName: 'Primary Account'
  },
  secondary: {
    email: process.env.GMAIL_EMAIL_2,
    clientId: process.env.GMAIL_CLIENT_ID_2,
    clientSecret: process.env.GMAIL_CLIENT_SECRET_2,
    refreshToken: process.env.GMAIL_REFRESH_TOKEN_2,
    redirectUri: process.env.GMAIL_REDIRECT_URI_2 || 'http://localhost:5000/api/gmail/oauth2callback2',
    displayName: 'Secondary Account'
  },
  tertiary: {
    email: process.env.GMAIL_EMAIL_3 || 'bookings@example.com',
    clientId: process.env.GMAIL_CLIENT_ID_3,
    clientSecret: process.env.GMAIL_CLIENT_SECRET_3,
    refreshToken: process.env.GMAIL_REFRESH_TOKEN_3,
    redirectUri: process.env.GMAIL_REDIRECT_URI_3 || 'https://your-crm-domain.example.com/api/gmail/oauth2callback3',
    displayName: '3rd Account'
  },
  quaternary: {
    email: process.env.GMAIL_EMAIL_4 || 'appt@example.com',
    clientId: process.env.GMAIL_CLIENT_ID_4,
    clientSecret: process.env.GMAIL_CLIENT_SECRET_4,
    refreshToken: process.env.GMAIL_REFRESH_TOKEN_4,
    redirectUri: process.env.GMAIL_REDIRECT_URI_4 || 'https://your-crm-domain.example.com/api/gmail/oauth2callback4',
    displayName: '4th Account'
  },
  quinary: {
    email: process.env.GMAIL_EMAIL_5 || 'book@example.com',
    clientId: process.env.GMAIL_CLIENT_ID_5,
    clientSecret: process.env.GMAIL_CLIENT_SECRET_5,
    refreshToken: process.env.GMAIL_REFRESH_TOKEN_5,
    redirectUri: process.env.GMAIL_REDIRECT_URI_5 || 'https://your-crm-domain.example.com/api/gmail/oauth2callback5',
    displayName: '5th Account'
  },
  senary: {
    email: process.env.GMAIL_EMAIL_6 || 'photo@example.com',
    clientId: process.env.GMAIL_CLIENT_ID_6,
    clientSecret: process.env.GMAIL_CLIENT_SECRET_6,
    refreshToken: process.env.GMAIL_REFRESH_TOKEN_6,
    redirectUri: process.env.GMAIL_REDIRECT_URI_6 || 'https://your-crm-domain.example.com/api/gmail/oauth2callback6',
    displayName: '6th Account'
  },
  septenary: {
    email: process.env.GMAIL_EMAIL_7 || 'studio@example.com',
    clientId: process.env.GMAIL_CLIENT_ID_7,
    clientSecret: process.env.GMAIL_CLIENT_SECRET_7,
    refreshToken: process.env.GMAIL_REFRESH_TOKEN_7,
    redirectUri: process.env.GMAIL_REDIRECT_URI_7 || 'https://your-crm-domain.example.com/api/gmail/oauth2callback7',
    displayName: '7th Account'
  }
};

// --- GmailPoller Class (per account) ---
class GmailPoller {
  constructor(ioInstance, accountKey = 'primary') {
    // Create unique instance per account
    const instanceKey = `GmailPoller_${accountKey}`;
    
    if (GmailPoller.instances && GmailPoller.instances[instanceKey]) {
      return GmailPoller.instances[instanceKey];
    }

    if (!GmailPoller.instances) {
      GmailPoller.instances = {};
    }
    GmailPoller.instances[instanceKey] = this;

    this.accountKey = accountKey;
    this.accountConfig = ACCOUNTS[accountKey];
    this.supabase = null;
    this.gmail = null;
    this.isRunning = false;
    this.pollTimer = null;
    this.io = ioInstance;
    this.lastHistoryId = null;
    // Use Map instead of Set to store timestamps for cleanup
    this.processedMessages = new Map(); // messageId -> timestamp
    this.processedMessagesFile = path.join(__dirname, `../data/processed_gmail_messages_${accountKey}.json`);
    this.retryAttempts = 3; // Number of retry attempts for failed operations
    this.retryDelay = 2000; // Delay between retries (ms)
    this.maxProcessedMessages = 10000; // Max messages to track (prevents memory bloat)
    this.messageRetentionDays = 30; // How long to track processed messages

    // Validate account configuration. The refresh token is deliberately not
    // required here: it may live in the database instead of env, and is
    // resolved per poll by resolveCredentials().
    if (!this.accountConfig || !this.accountConfig.clientId || !this.accountConfig.clientSecret) {
      console.log(`📧 [${this.accountConfig?.displayName || accountKey}] Gmail poller disabled: no OAuth client configured`);
      this.disabled = true;
      return;
    }

    this.disabled = false;
    this.pollCount = 0; // Track poll count for sampling
    if (VERBOSE_LOGGING) {
      console.log(`📧 [${this.accountConfig.displayName}] Gmail Poller: Initializing...`);
    }
    this.supabase = this.getSupabase();
    // Load processed messages (async, but we don't wait - will populate in background)
    this.loadProcessedMessages().catch(err => {
      console.error(`📧 [${this.accountConfig.displayName}] Failed to load processed messages:`, err.message);
    });
  }

  // Helper for conditional logging - reduced spam for Railway
  log(message, force = false) {
    // Only log if forced OR verbose logging is enabled
    // Reduce default logging to prevent Railway rate limits
    if (force || VERBOSE_LOGGING) {
      console.log(message);
    }
  }

  // Load processed messages from DATABASE (Railway-safe)
  async loadProcessedMessages() {
    try {
      // First try to load from database (Railway-safe)
      const { data: dbMessages, error: dbError } = await this.supabase
        .from('processed_gmail_messages')
        .select('gmail_message_id, processed_at')
        .eq('account_key', this.accountKey)
        .gte('processed_at', new Date(Date.now() - this.messageRetentionDays * 24 * 60 * 60 * 1000).toISOString());

      if (!dbError && dbMessages && dbMessages.length > 0) {
        dbMessages.forEach(msg => {
          this.processedMessages.set(msg.gmail_message_id, new Date(msg.processed_at).getTime());
        });
        this.log(`📧 [${this.accountConfig.displayName}] Loaded ${this.processedMessages.size} processed IDs from database`);
        return; // Successfully loaded from DB
      }

      // Fallback to file (for migration/legacy)
      if (fsSync.existsSync(this.processedMessagesFile)) {
        const data = JSON.parse(fsSync.readFileSync(this.processedMessagesFile, 'utf8'));
        const cutoffTime = Date.now() - (this.messageRetentionDays * 24 * 60 * 60 * 1000);
        
        if (data.processedIds && Array.isArray(data.processedIds)) {
          data.processedIds.forEach(item => {
            if (Array.isArray(item) && item.length === 2) {
              if (item[1] > cutoffTime) this.processedMessages.set(item[0], item[1]);
            } else if (typeof item === 'string') {
              this.processedMessages.set(item, Date.now());
            }
          });
        }
        this.log(`📧 [${this.accountConfig.displayName}] Migrated ${this.processedMessages.size} IDs from file to database`);
        
        // Save to database for next time
        await this.saveProcessedMessagesToDB();
      } else {
        this.log(`📧 [${this.accountConfig.displayName}] Starting fresh (no processed messages)`);
      }
    } catch (error) {
      console.error(`📧 [${this.accountConfig.displayName}] Error loading processed messages:`, error.message);
    }
  }

  // Save to database (Railway-safe)
  async saveProcessedMessagesToDB() {
    try {
      const records = Array.from(this.processedMessages.entries())
        .slice(-1000) // Only keep last 1000 to prevent bloat
        .map(([gmail_message_id, timestamp]) => ({
          account_key: this.accountKey,
          gmail_message_id,
          processed_at: new Date(timestamp).toISOString()
        }));

      if (records.length === 0) return;

      // Upsert records
      const { error } = await this.supabase
        .from('processed_gmail_messages')
        .upsert(records, { 
          onConflict: 'account_key,gmail_message_id',
          ignoreDuplicates: true 
        });

      if (error) {
        console.error(`📧 [${this.accountConfig.displayName}] Error saving to database:`, error.message);
      }
    } catch (error) {
      console.error(`📧 [${this.accountConfig.displayName}] Error in DB save:`, error.message);
    }
  }

  // Save processed messages to DATABASE (Railway-safe) + file (backup)
  async saveProcessedMessages() {
    try {
      // Save to database (primary, survives Railway restarts)
      await this.saveProcessedMessagesToDB();
      
      // Also save to file (backup, will be lost on Railway but helpful for local dev)
      const processedIds = Array.from(this.processedMessages.entries());
      const data = {
        lastUpdated: new Date().toISOString(),
        processedIds: processedIds.slice(-1000), // Keep only last 1000
        count: processedIds.length,
        accountKey: this.accountKey
      };

      const dataDir = path.dirname(this.processedMessagesFile);
      if (!fsSync.existsSync(dataDir)) {
        fsSync.mkdirSync(dataDir, { recursive: true });
      }

      fsSync.writeFileSync(this.processedMessagesFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`📧 [${this.accountConfig.displayName}] Error saving processed messages:`, error.message);
    }
  }

  // Mark message as processed
  async markMessageProcessed(messageId) {
    this.processedMessages.set(messageId, Date.now());
    
    // Cleanup old messages periodically to prevent memory bloat
    if (this.processedMessages.size >= this.maxProcessedMessages) {
      this.cleanupOldProcessedMessages();
    }
    
    // Save to database periodically (every 10 messages)
    if (this.processedMessages.size % 10 === 0) {
      await this.saveProcessedMessages();
    }
  }

  // Check if message was already processed (in-memory check)
  isMessageProcessed(messageId) {
    return this.processedMessages.has(messageId);
  }

  // Cleanup old processed messages to prevent memory bloat
  cleanupOldProcessedMessages() {
    try {
      const cutoffTime = Date.now() - (this.messageRetentionDays * 24 * 60 * 60 * 1000);
      let cleanedCount = 0;
      
      // Remove messages older than retention period
      for (const [id, timestamp] of this.processedMessages) {
        if (timestamp < cutoffTime) {
          this.processedMessages.delete(id);
          cleanedCount++;
        }
      }
      
      // If still too many, remove oldest (LRU style)
      if (this.processedMessages.size > this.maxProcessedMessages) {
        const sortedEntries = [...this.processedMessages.entries()]
          .sort((a, b) => b[1] - a[1]); // Sort by timestamp desc
        
        // Keep only the most recent maxProcessedMessages
        this.processedMessages = new Map(sortedEntries.slice(0, this.maxProcessedMessages));
        cleanedCount += sortedEntries.length - this.maxProcessedMessages;
      }
      
      if (cleanedCount > 0) {
        this.log(`🧹 [${this.accountConfig.displayName}] Cleaned up ${cleanedCount} old processed message IDs (current: ${this.processedMessages.size})`);
        this.saveProcessedMessages();
      }
    } catch (error) {
      console.error(`❌ [${this.accountConfig.displayName}] Error cleaning up processed messages:`, error.message);
    }
  }

  getSupabase() {
    // Use singleton Supabase client instead of creating new connections
    this.log(`✅ [${this.accountConfig?.displayName || 'GmailPoller'}] Using singleton Supabase client`);
    return getSupabaseClient();
  }

  /**
   * Current credentials for this account, database first.
   *
   * Falls back to the env-var config this poller was constructed with, so an
   * account that has not been re-authorised through the UI keeps working.
   */
  async resolveCredentials() {
    const fallback = this.accountConfig || {};

    try {
      const credentials = require('./emailCredentialResolver');
      const resolved = await credentials.resolveAccount(fallback.email || this.accountKey);

      if (resolved && resolved.clientId && resolved.clientSecret && resolved.refreshToken) {
        return {
          clientId: resolved.clientId,
          clientSecret: resolved.clientSecret,
          refreshToken: resolved.refreshToken,
          redirectUri: resolved.redirectUri || fallback.redirectUri
        };
      }
    } catch (err) {
      this.log(`⚠️ [${fallback.displayName || this.accountKey}] Could not resolve stored credentials, using env: ${err.message}`);
    }

    return {
      clientId: fallback.clientId,
      clientSecret: fallback.clientSecret,
      refreshToken: fallback.refreshToken,
      redirectUri: fallback.redirectUri
    };
  }

  /**
   * Get authenticated Gmail client for this account
   */
  async getGmailClient() {
    try {
      // Resolve credentials fresh on every call so a re-authorisation done in
      // the UI takes effect on the next poll instead of needing a restart.
      // The database wins; the env-var config stays as the fallback.
      const { clientId, clientSecret, refreshToken, redirectUri } = await this.resolveCredentials();

      if (!clientId || !clientSecret || !refreshToken) {
        throw new Error(`Gmail API credentials not configured for ${this.accountKey} account`);
      }

      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
      
      try {
        oauth2Client.setCredentials({ refresh_token: refreshToken });
      } catch (credError) {
        if (credError.message && credError.message.includes('invalid_grant')) {
          console.error(`❌ [${this.accountConfig.displayName}] OAuth token expired or invalid (invalid_grant)`);
          console.error(`   Fix: open the Email Accounts page and press "Fix now" on ${this.accountConfig.email}. The new token saves automatically.`);
          throw new Error('OAuth token expired - re-authentication required');
        }
        throw credError;
      }

      // Test the token by making a simple API call
      try {
        const testGmail = google.gmail({ version: 'v1', auth: oauth2Client });
        await testGmail.users.getProfile({ userId: 'me' });
        return testGmail;
      } catch (testError) {
        if (testError.message && (testError.message.includes('invalid_grant') || testError.code === 401)) {
          console.error(`❌ [${this.accountConfig.displayName}] OAuth token expired or invalid`);
          console.error(`   Fix: open the Email Accounts page and press "Fix now" on ${this.accountConfig.email}. The new token saves automatically.`);
          throw new Error('OAuth token expired - re-authentication required');
        }
        throw testError;
      }
    } catch (error) {
      throw new Error(`Failed to authenticate Gmail API (${this.accountKey}): ${error.message}`);
    }
  }

  /**
   * Start the Gmail poller for this account
   */
  async start() {
    if (this.disabled) {
      this.log(`📧 [${this.accountConfig.displayName}] Poller is disabled`);
      return;
    }

    if (this.isRunning) {
      this.log(`📧 [${this.accountConfig.displayName}] Poller already running`);
      return;
    }

    try {
      this.pollCount++;
      const shouldLog = this.pollCount === 1 || this.pollCount % 20 === 0; // Log first poll and every 20th (reduced frequency)
      if (shouldLog) {
        this.log(`📧 [${this.accountConfig.displayName}] Starting Gmail poller (poll #${this.pollCount})...`, true);
      }

      // Authenticate and get Gmail client
      this.gmail = await this.getGmailClient();

      // Get initial profile to verify connection
      const profile = await this.gmail.users.getProfile({ userId: 'me' });
      this.log(`✅ [${this.accountConfig.displayName}] Connected to ${profile.data.emailAddress}`, true);
      this.log(`📊 [${this.accountConfig.displayName}] Total messages: ${profile.data.messagesTotal}`, true);

      // Get initial historyId
      this.lastHistoryId = profile.data.historyId;

      this.isRunning = true;

      // Do initial scan
      await this.scanNewMessages();

      // Start polling
      this.startPolling();

      console.log(`✅ [${this.accountConfig.displayName}] Poller started successfully (polling every ${POLL_INTERVAL_MS / 1000}s)`);

    } catch (error) {
      if (error.message && error.message.includes('invalid_grant')) {
        console.error(`❌ [${this.accountConfig.displayName}] Failed to start poller: OAuth token expired`);
        console.error(`❌ [${this.accountConfig.displayName}] ACTION REQUIRED: Re-authenticate this account`);
        console.error(`   Visit: http://localhost:5000/api/gmail/oauth2${this.accountKey === 'secondary' ? '2' : ''}`);
        console.error(`   Then update GMAIL_REFRESH_TOKEN${this.accountKey === 'secondary' ? '_2' : ''} in .env`);
      } else {
        console.error(`❌ [${this.accountConfig.displayName}] Failed to start poller:`, error.message);
      }
      this.isRunning = false;
      this.disabled = true; // Disable poller until re-authenticated
    }
  }

  /**
   * Start polling for new messages
   */
  startPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }

    // Main polling timer for scanning messages
    this.pollTimer = setInterval(async () => {
      if (this.isRunning && !this.disabled) {
        try {
          await this.scanNewMessages();
          // Save processed messages periodically
          this.saveProcessedMessages();
        } catch (error) {
          console.error(`❌ [${this.accountConfig.displayName}] Polling error:`, error.message);
        }
      }
    }, POLL_INTERVAL_MS);

    // Cleanup timer - run every hour to prevent memory bloat
    this.cleanupTimer = setInterval(() => {
      if (this.isRunning && !this.disabled) {
        this.cleanupOldProcessedMessages();
      }
    }, 60 * 60 * 1000); // Every hour

    // Only log first poll
    if (this.pollCount <= 1) {
      console.log(`📧 [${this.accountConfig.displayName}] Polling started (${POLL_INTERVAL_MS / 1000}s interval) with hourly cleanup`);
    }
  }

  /**
   * Scan for new messages using Gmail API
   * NO TIME LIMITS - checks ALL unprocessed emails
   * WITH PAGINATION - handles unlimited messages
   */
  async scanNewMessages() {
    if (!this.gmail || !this.isRunning || this.disabled) {
      return;
    }

    try {
      // Query: Get unread emails + recent emails (last 7 days to catch missed replies)
      const sevenDaysAgo = Math.floor(Date.now() / 1000) - (7 * 24 * 60 * 60);
      const query = `in:inbox (is:unread OR after:${sevenDaysAgo})`;

      let allMessages = [];
      let pageToken = null;
      let pageCount = 0;
      const maxResultsPerPage = 500; // Gmail API max is 500

      // Paginate through all results
      do {
        const response = await this.gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: maxResultsPerPage,
          pageToken: pageToken
        });

        const messages = response.data.messages || [];
        allMessages = allMessages.concat(messages);
        pageToken = response.data.nextPageToken;
        pageCount++;

        // Only log if there are messages beyond page 1
        if (pageCount > 1 && VERBOSE_LOGGING) {
          console.log(`📧 [${this.accountConfig.displayName}] Page ${pageCount}: ${allMessages.length} messages so far`);
        }

        // Safety limit: if we have more than 10,000 messages, something might be wrong
        if (allMessages.length > 10000) {
          console.warn(`⚠️ [${this.accountConfig.displayName}] Found more than 10,000 messages. Stopping pagination to prevent overload.`);
          break;
        }
      } while (pageToken);

      if (allMessages.length === 0) {
        return; // Nothing to process, stay quiet
      }

      let processedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;

      // Process each message with retry logic
      for (let i = 0; i < allMessages.length; i++) {
        const message = allMessages[i];
        
        // Quick in-memory check first
        if (this.isMessageProcessed(message.id)) {
          skippedCount++;
          continue;
        }

        // Process with retry logic
        let processed = false;
        let lastError = null;
        
        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
          try {
            // Get full message details
            const fullMessage = await this.gmail.users.messages.get({
              userId: 'me',
              id: message.id,
              format: 'full'
            });

            // Process the message
            const result = await this.processMessage(fullMessage.data);
            
            if (result === 'processed') {
              await this.markMessageProcessed(message.id);
              processedCount++;
              processed = true;
              break; // Success, exit retry loop
            } else if (result === 'skipped') {
              await this.markMessageProcessed(message.id); // Mark as processed even if skipped (to avoid reprocessing)
              skippedCount++;
              processed = true;
              break;
            } else if (result === 'duplicate') {
              await this.markMessageProcessed(message.id);
              skippedCount++;
              processed = true;
              break;
            }
            
          } catch (error) {
            lastError = error;
            if (attempt < this.retryAttempts) {
              console.warn(`⚠️ [${this.accountConfig.displayName}] Attempt ${attempt}/${this.retryAttempts} failed for message ${message.id}, retrying in ${this.retryDelay}ms...`);
              await new Promise(resolve => setTimeout(resolve, this.retryDelay * attempt)); // Exponential backoff
            }
          }
        }
        
        if (!processed && lastError) {
          errorCount++;
          console.error(`❌ [${this.accountConfig.displayName}] Error processing message ${message.id} after ${this.retryAttempts} attempts:`, lastError.message);
          // Don't mark as processed if all retries failed - we'll retry next poll cycle
        }

        // Progress indicator for large batches (every 50)
        if ((i + 1) % 50 === 0) {
          if (VERBOSE_LOGGING) {
          console.log(`📧 [${this.accountConfig.displayName}] Progress: ${i + 1}/${allMessages.length}`);
        }
        }
        
        // Rate limiting: Add small delay between messages to avoid hitting Gmail API limits
        if (i < allMessages.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay between messages
        }
      }

      // Only log if something was actually processed or errored (reduced frequency for Railway)
      if (processedCount > 0 || errorCount > 0) {
        // Only log every 5th successful scan to reduce spam, but always log errors
        const shouldLog = errorCount > 0 || this.pollCount % 5 === 0;
        if (shouldLog) {
          this.log(`📧 [${this.accountConfig.displayName}] Scan #${this.pollCount}: ${processedCount} new, ${skippedCount} skipped, ${errorCount} errors`, true);
        }
      }

    } catch (error) {
      console.error(`❌ [${this.accountConfig.displayName}] Error scanning messages:`, error.message);
    }
  }

  /**
   * Process a single Gmail message
   * Returns: 'processed', 'skipped', 'duplicate', or 'error'
   */
  async processMessage(message) {
    const messageId = message.id;
    const headers = message.payload.headers;

    // Extract email headers
    const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

    const from = getHeader('From');
    const to = getHeader('To');
    const subject = getHeader('Subject') || '(No Subject)';
    const date = getHeader('Date');

    // Extract email address from "Name <email@example.com>" format
    const extractEmail = (str) => {
      if (!str) return '';
      const match = str.match(/<([^>]+)>/);
      return match ? match[1] : str.trim();
    };

    const fromEmail = extractEmail(from);
    const toEmail = extractEmail(to);

    // Check if email is TO our account (inbound email)
    // Use exact matching or domain matching to avoid false positives
    const accountEmail = this.accountConfig.email.toLowerCase();
    const toEmailLower = toEmail.toLowerCase();
    
    // Check if TO matches our account exactly or is in our domain for catch-all
    const isToOurAccount = toEmailLower === accountEmail || 
                           toEmailLower.endsWith(`<${accountEmail}>`) ||
                           toEmailLower.includes(`<${accountEmail}>`);
    
    if (!isToOurAccount) {
      // Check CC and BCC as well
      const cc = getHeader('Cc') || '';
      const bcc = getHeader('Bcc') || '';
      const ccLower = cc.toLowerCase();
      const bccLower = bcc.toLowerCase();
      
      const isCcToUs = ccLower.includes(accountEmail) || ccLower.includes(`<${accountEmail}>`);
      const isBccToUs = bccLower.includes(accountEmail) || bccLower.includes(`<${accountEmail}>`);
      
      if (!isCcToUs && !isBccToUs) {
        // Silently skip - not addressed to us
        return 'skipped'; // Not addressed to this account
      }
    }

    if (VERBOSE_LOGGING) {
      console.log(`📧 [${this.accountConfig.displayName}] New email from ${fromEmail}: "${subject.substring(0, 50)}"`);
    }

    // ✅ FIX: Only process emails from existing CRM leads (don't create new leads automatically)
    let lead = await this.findLead(fromEmail);

    if (!lead) {
      // Skip emails from senders not in CRM
      return 'skipped';
    }

    // Found lead - continue processing

    // Check for duplicates in database (more reliable than in-memory check)
    const { data: existingByGmailId, error: gmailIdCheckError } = await this.supabase
      .from('messages')
      .select('id')
      .eq('gmail_message_id', messageId)
      .limit(1);

    if (gmailIdCheckError) {
      throw new Error(`DB_ERROR_GMAIL_ID_CHECK: ${gmailIdCheckError.message}`);
    }

    if (existingByGmailId && existingByGmailId.length > 0) {
      return 'duplicate';
    }

    // Extract email content using enhanced extractor (HTML + embedded images)
    const extractor = new GmailEmailExtractor(this.gmail, this.accountKey, supabaseStorage);
    const emailContent = await extractor.extractEmailContent(message, messageId);
    
    // Get text and HTML versions
    const bodyText = emailContent.text || extractor.cleanEmailBody(emailContent.text || '', false);
    const htmlBody = emailContent.html || null;
    const embeddedImages = emailContent.embeddedImages || [];

    // Remove body length check - process all emails, even if body is short
    if (!bodyText || bodyText.trim().length === 0) {
      console.warn(`⚠️ [${this.accountConfig.displayName}] Email body is empty, but processing anyway`);
    }

    // Extract and upload regular attachments (non-embedded)
    const attachments = await this.extractAndUploadAttachments(message, messageId);

    // Combine embedded images with regular attachments for storage
    const allAttachments = [...attachments];
    
    // Store embedded images metadata (they're already uploaded)
    const embeddedImagesMetadata = embeddedImages.map(img => ({
      ...img,
      is_embedded: true
    }));
    
    // Combine all attachments (embedded images + regular attachments)
    const combinedAttachments = [...allAttachments, ...embeddedImagesMetadata];

    // Insert to messages table
    const recordId = randomUUID();
    const emailReceivedDate = date ? new Date(date).toISOString() : new Date().toISOString();
    const processingDate = new Date().toISOString();

    const { data: insertedMessage, error: insertError } = await this.supabase
      .from('messages')
      .insert({
        id: recordId,
        lead_id: lead.id,
        type: 'email',
        subject: subject,
        content: bodyText || '(No content)', // Plain text version
        email_body: htmlBody || null, // HTML version for Gmail-style rendering
        recipient_email: fromEmail,
        status: 'delivered', // Using 'delivered' for received emails (allowed by constraint)
        gmail_message_id: messageId,
        gmail_account_key: this.accountKey, // Track which account received it
        attachments: combinedAttachments.length > 0 ? combinedAttachments : null, // Store as JSONB array
        sent_at: emailReceivedDate,
        created_at: processingDate,
        updated_at: processingDate,
        read_status: false
      })
      .select('id')
      .single();

    if (insertError || !insertedMessage) {
      throw new Error(`DB_ERROR_INSERT: ${insertError?.message}`);
    }

    // 🔔 REPLY ROUTING: Find original sender and notify them
    await this.routeReplyToOriginalSender(lead, subject, fromEmail, recordId);

    // Update booking history
    await this.updateLeadHistory(lead, subject, bodyText || '(No content)', emailReceivedDate);

    // Emit events with HTML content for proper rendering
    this.emitEvents(lead, recordId, subject, bodyText || '(No content)', emailReceivedDate, htmlBody);

    // Reduced logging to prevent Railway rate limits - only log in verbose mode
    this.log(`✅ [${this.accountConfig.displayName}] Email: "${subject.substring(0, 40)}..." from ${fromEmail}`, true);
    return 'processed';
  }

  /**
   * Create a new lead from email address
   */
  async createLead(email, fromHeader) {
    if (!email) return null;

    try {
      // Extract name from "Name <email@example.com>" format
      let name = email;
      const nameMatch = fromHeader.match(/^([^<]+)</);
      if (nameMatch) {
        name = nameMatch[1].trim().replace(/['"]/g, '');
      } else {
        // Use email username as name
        const emailParts = email.split('@');
        name = emailParts[0].replace(/[._]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      }

      const leadId = randomUUID();
      const now = new Date().toISOString();

      const { data: newLead, error: createError } = await this.supabase
        .from('leads')
        .insert({
          id: leadId,
          name: name,
          email: email.toLowerCase().trim(),
          status: 'New',
          created_at: now,
          updated_at: now,
          booking_history: JSON.stringify([])
        })
        .select('*')
        .single();

      if (createError) {
        console.error(`❌ [${this.accountConfig.displayName}] Error creating lead:`, createError.message);
        return null;
      }

      return newLead;
    } catch (error) {
      console.error(`❌ [${this.accountConfig.displayName}] Error creating lead:`, error.message);
      return null;
    }
  }

  /**
   * Extract and upload attachments from Gmail message
   * Returns array of attachment metadata
   */
  async extractAndUploadAttachments(message, messageId) {
    const attachments = [];
    
    try {
      const parts = message.payload?.parts || [];
      
      // Recursive function to find all attachments
      const findAttachments = (parts) => {
        if (!parts) return [];
        
        const found = [];
        for (const part of parts) {
          // Check for nested parts
          if (part.parts) {
            found.push(...findAttachments(part.parts));
          }
          
          // Check if this part is an attachment
          const filename = part.filename;
          const attachmentId = part.body?.attachmentId;
          const mimeType = part.mimeType;
          
          if (filename && attachmentId && mimeType && !mimeType.startsWith('text/') && !mimeType.startsWith('multipart/')) {
            found.push({
              part: part,
              filename: filename,
              attachmentId: attachmentId,
              mimeType: mimeType,
              size: part.body?.size || 0
            });
          }
        }
        return found;
      };
      
      const attachmentParts = findAttachments(parts);
      
      if (attachmentParts.length === 0) {
        return attachments; // No attachments
      }
      
      this.log(`📎 [${this.accountConfig.displayName}] Found ${attachmentParts.length} attachment(s) in message ${messageId}`);
      
      // Download and upload each attachment
      for (let i = 0; i < attachmentParts.length; i++) {
        const att = attachmentParts[i];
        try {
          // Download attachment from Gmail
          const attachmentResponse = await this.gmail.users.messages.attachments.get({
            userId: 'me',
            messageId: messageId,
            id: att.attachmentId
          });
          
          const attachmentData = attachmentResponse.data;
          const fileData = attachmentData.data;
          
          // Decode base64url
          const base64 = fileData.replace(/-/g, '+').replace(/_/g, '/');
          const buffer = Buffer.from(base64, 'base64');
          
          // Generate unique filename to avoid conflicts
          const fileExt = path.extname(att.filename) || '';
          const baseName = path.basename(att.filename, fileExt);
          const uniqueFilename = `email-attachments/${messageId}/${baseName}_${Date.now()}${fileExt}`;
          
          // Save to temporary file
          const tempDir = path.join(__dirname, '../uploads/temp_email_attachments');
          if (!fsSync.existsSync(tempDir)) {
            fsSync.mkdirSync(tempDir, { recursive: true });
          }
          
          const tempFilePath = path.join(tempDir, `${Date.now()}_${att.filename}`);
          fsSync.writeFileSync(tempFilePath, buffer);
          
          // Upload to Supabase Storage
          const uploadResult = await supabaseStorage.uploadFile(
            tempFilePath,
            uniqueFilename,
            att.mimeType
          );
          
          // Clean up temp file
          try {
            fsSync.unlinkSync(tempFilePath);
          } catch (cleanupError) {
            console.warn(`⚠️ [${this.accountConfig.displayName}] Failed to clean up temp file:`, cleanupError.message);
          }
          
          if (uploadResult.success) {
            attachments.push({
              filename: att.filename,
              url: uploadResult.url,
              size: att.size || buffer.length,
              mimetype: att.mimeType,
              gmail_attachment_id: att.attachmentId
            });
            this.log(`✅ [${this.accountConfig.displayName}] Uploaded attachment: ${att.filename} (${(buffer.length / 1024).toFixed(2)} KB)`);
          } else {
            console.error(`❌ [${this.accountConfig.displayName}] Failed to upload attachment ${att.filename}:`, uploadResult.error);
          }
          
        } catch (attError) {
          console.error(`❌ [${this.accountConfig.displayName}] Error processing attachment ${att.filename}:`, attError.message);
          // Continue with other attachments even if one fails
        }
      }
      
    } catch (error) {
      console.error(`❌ [${this.accountConfig.displayName}] Error extracting attachments:`, error.message);
    }
    
    return attachments;
  }

  /**
   * Extract email body from Gmail message payload
   */
  extractEmailBody(payload) {
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
          return this.htmlToText(html);
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
        body = this.htmlToText(body);
      }
    }

    // Clean up the body
    body = this.cleanEmailBody(body);

    return body;
  }

  /**
   * Convert HTML to plain text
   */
  htmlToText(html) {
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
   */
  cleanEmailBody(body) {
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
   */
  async findLead(email) {
    if (!email) return null;

    const emailLower = email.trim().toLowerCase();

    // Try case-insensitive exact match first
    const { data: leadData, error: leadError } = await this.supabase
      .from('leads')
      .select('*')
      .ilike('email', emailLower)
      .limit(1)
      .maybeSingle();

    if (leadError) {
      console.error(`❌ [${this.accountConfig.displayName}] Database error finding lead for ${email}:`, leadError.message);
      return null; // Don't throw, just return null
    }

    if (leadData) {
      return leadData;
    }

    // Fallback: try partial match if exact match fails
    const { data: partialMatch, error: partialError } = await this.supabase
      .from('leads')
      .select('*')
      .ilike('email', `%${emailLower}%`)
      .limit(1)
      .maybeSingle();
    
    if (partialError) {
      console.warn(`⚠️ [${this.accountConfig.displayName}] Partial match error for ${email}:`, partialError.message);
      return null;
    }

    return partialMatch || null;
  }

  /**
   * Update lead booking history
   */
  async updateLeadHistory(lead, subject, body, emailReceivedDate) {
    // Read whichever shape the column holds. If it cannot be read we must NOT
    // overwrite it - doing so would wipe the lead's entire history.
    const { history, readable } = readBookingHistory(lead);
    if (!readable) {
      console.warn(`⚠️ [${this.accountConfig.displayName}] Booking history for lead ${lead.id} (${lead.name}) is unreadable - skipping update so existing history is not lost`);
      return;
    }

    const updatedHistory = [{
      action: 'EMAIL_RECEIVED',
      timestamp: emailReceivedDate,
      details: {
        subject,
        body: body.substring(0, 150) + '...',
        direction: 'received',
        channel: 'email',
        read: false
      }
    }, ...history];

    const { error: updateError } = await this.supabase
      .from('leads')
      .update({
        booking_history: updatedHistory,
        updated_at: new Date().toISOString()
      })
      .eq('id', lead.id);

    if (updateError) {
      // Check if it's a permission/RLS error
      if (updateError.code === 'PGRST301' || updateError.message?.includes('permission') || updateError.message?.includes('403')) {
        console.error(`❌ [${this.accountConfig.displayName}] Permission denied updating lead ${lead.id} (${lead.name})`);
        console.error(`   This might be an RLS policy issue. Ensure SERVICE ROLE KEY is set correctly.`);
      } else {
        console.error(`❌ [${this.accountConfig.displayName}] Error updating lead booking history for ${lead.name}:`, updateError.message);
      }
      // Don't throw - continue processing other messages
    } else {
      this.log(`✅ [${this.accountConfig.displayName}] Updated booking history for ${lead.name}`);
    }
  }

  /**
   * Emit Socket.IO events
   */
  emitEvents(lead, messageId, subject, body, emailReceivedDate, htmlBody = null) {
    if (!this.io) return;

    const rooms = [];
    if (lead.booker_id) rooms.push(`user_${lead.booker_id}`);
    rooms.push('admins');

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
      subject,
      body,
      email_body: htmlBody  // Include HTML content for Gmail-style rendering
    };

    rooms.forEach(room => {
      this.io.to(room).emit('email_received', payload);
      this.io.to(room).emit('message_received', payload);
      this.io.to(room).emit('lead_updated', {
        type: 'LEAD_UPDATED',
        data: { lead }
      });
    });
  }

  /**
   * 🔔 REPLY ROUTING: Find original sender and notify them of reply
   * This ensures email replies go to the user who sent the original message
   */
  async routeReplyToOriginalSender(lead, subject, fromEmail, messageId) {
    try {
      // Normalize subject by removing Re:/Fwd:/FW: prefixes
      const normalizedSubject = subject.replace(/^(re|fwd?|fw):\s*/i, '').trim().toLowerCase();
      
      if (!normalizedSubject) return;

      // Find recent sent emails to this lead with similar subject
      const { data: sentMessages, error } = await this.supabase
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

      // Reduced logging for Railway rate limits
      this.log(`📧 [REPLY ROUTING] Reply from ${fromEmail} matches original message sent by ${originalSenderName}`, true);
      this.log(`📧 [REPLY ROUTING] Notifying user ${originalSenderId} of reply to lead ${lead.name}`, true);

      // Create notification for original sender
      await this.createReplyNotification({
        messageId,
        leadId: lead.id,
        leadName: lead.name,
        replyFrom: fromEmail,
        subject: subject,
        originalSenderId: originalSenderId,
        originalSenderName: originalSenderName
      });

      // Emit specific event to original sender
      if (this.io) {
        this.io.to(`user_${originalSenderId}`).emit('email_reply_received', {
          messageId,
          leadId: lead.id,
          leadName: lead.name,
          replyFrom: fromEmail,
          subject: subject,
          originalMessageId: matchingMessage.id,
          timestamp: new Date().toISOString()
        });
      }

    } catch (error) {
      console.error('❌ [REPLY ROUTING] Error routing reply:', error.message);
      // Don't throw - this shouldn't break email processing
    }
  }

  /**
   * Create notification for reply routing
   */
  async createReplyNotification({ messageId, leadId, leadName, replyFrom, subject, originalSenderId, originalSenderName }) {
    try {
      // Check if notifications table exists
      const { error: tableCheckError } = await this.supabase
        .from('notifications')
        .select('id')
        .limit(1);

      if (tableCheckError && tableCheckError.code === '42P01') {
        // Table doesn't exist, skip
        return;
      }

      // Insert notification
      await this.supabase
        .from('notifications')
        .insert({
          user_id: originalSenderId,
          type: 'email_reply',
          title: `Reply from ${leadName}`,
          message: `Received reply to "${subject}" from ${replyFrom}`,
          data: {
            messageId,
            leadId,
            leadName,
            replyFrom,
            subject
          },
          read: false,
          created_at: new Date().toISOString()
        });

      this.log(`✅ [REPLY ROUTING] Notification created for user ${originalSenderId}`);
    } catch (error) {
      // Notifications table might not exist, log but don't fail
      this.log(`ℹ️ [REPLY ROUTING] Notification not created (table may not exist): ${error.message}`);
    }
  }

  /**
   * Stop the poller
   */
  stop() {
    console.log(`📧 [${this.accountConfig.displayName}] Stopping poller...`);
    this.isRunning = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    // Save processed messages on stop
    this.saveProcessedMessages();
    this.log(`✅ [${this.accountConfig.displayName}] Poller stopped`);
  }
}

/**
 * Start Gmail poller for all configured accounts
 */
function startGmailPoller(socketIoInstance) {
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  
  if (!supabaseKey) {
    console.error('❌ CRITICAL: Cannot start Gmail poller. Missing SUPABASE_SERVICE_ROLE_KEY environment variable.');
    console.error('⚠️  Gmail polling will be disabled until SUPABASE_SERVICE_ROLE_KEY is set in Railway.');
    return [];
  }

  console.log('📧 Gmail: Starting pollers...');
  const pollers = [];

  // An account may hold its refresh token in the database rather than in env
  // (that is where the re-authorise button writes it), so the startup gate
  // only requires an OAuth client here. resolveCredentials() supplies the
  // token per poll, and a genuinely tokenless account simply fails that call.
  for (const accountKey of ['primary', 'secondary', 'tertiary', 'quaternary', 'quinary', 'senary', 'septenary']) {
    const account = ACCOUNTS[accountKey];

    if (!account || !account.clientId || !account.clientSecret) {
      if (VERBOSE_LOGGING) {
        console.log(`📧 Skipping ${accountKey} Gmail poller: no OAuth client configured`);
      }
      continue;
    }

    console.log(`📧 Starting Gmail poller: ${account.displayName} (${account.email})`);
    const poller = new GmailPoller(socketIoInstance, accountKey);
    poller.start();
    pollers.push(poller);
  }

  if (pollers.length === 0) {
    console.error('❌ No Gmail pollers started - no accounts configured');
  } else {
    console.log(`✅ Started ${pollers.length} Gmail poller(s), interval: ${POLL_INTERVAL_MS/1000}s`);
  }

  return pollers;
}

module.exports = { startGmailPoller, GmailPoller, ACCOUNTS };
