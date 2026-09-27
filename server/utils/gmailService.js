require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');

/**
 * Gmail API Service - Multi-Account Support
 * Supports multiple Gmail accounts via Gmail API
 * Now supports both environment variables (legacy) and database-stored accounts
 */

console.log('📧 Gmail Service: Initializing Multi-Account Support...');
console.log('📧 Primary Account (GMAIL_EMAIL):', process.env.GMAIL_EMAIL || 'Not set');
console.log('📧 Secondary Account (GMAIL_EMAIL_2):', process.env.GMAIL_EMAIL_2 || 'Not set');
console.log('📧 Tertiary Account (GMAIL_EMAIL_3):', process.env.GMAIL_EMAIL_3 || 'Not set');
console.log('📧 4th Account (GMAIL_EMAIL_4):', process.env.GMAIL_EMAIL_4 || 'Not set');
console.log('📧 5th Account (GMAIL_EMAIL_5):', process.env.GMAIL_EMAIL_5 || 'Not set');
console.log('📧 6th Account (GMAIL_EMAIL_6):', process.env.GMAIL_EMAIL_6 || 'Not set');
console.log('📧 7th Account (GMAIL_EMAIL_7):', process.env.GMAIL_EMAIL_7 || 'Not set');

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Account configurations
const ACCOUNTS = {
  primary: {
    email: process.env.GMAIL_EMAIL || 'hello@example.com',
    clientId: process.env.GMAIL_CLIENT_ID,
    clientSecret: process.env.GMAIL_CLIENT_SECRET,
    refreshToken: process.env.GMAIL_REFRESH_TOKEN,
    redirectUri: process.env.GMAIL_REDIRECT_URI || 'http://localhost:5000/api/gmail/oauth2callback',
    displayName: 'Auralndn'
  },
  secondary: {
    email: process.env.GMAIL_EMAIL_2 || 'diary@example.com',
    clientId: process.env.GMAIL_CLIENT_ID_2,
    clientSecret: process.env.GMAIL_CLIENT_SECRET_2,
    refreshToken: process.env.GMAIL_REFRESH_TOKEN_2,
    redirectUri: process.env.GMAIL_REDIRECT_URI_2 || 'https://your-crm-domain.example.com/api/gmail/oauth2callback2',
    displayName: 'Auralndn'
  },
  tertiary: {
    email: process.env.GMAIL_EMAIL_3,
    clientId: process.env.GMAIL_CLIENT_ID_3,
    clientSecret: process.env.GMAIL_CLIENT_SECRET_3,
    refreshToken: process.env.GMAIL_REFRESH_TOKEN_3,
    redirectUri: process.env.GMAIL_REDIRECT_URI_3 || 'https://your-crm-domain.example.com/api/gmail/oauth2callback3',
    displayName: 'Auralndn'
  },
  quaternary: {
    email: process.env.GMAIL_EMAIL_4 || 'appt@example.com',
    clientId: process.env.GMAIL_CLIENT_ID_4,
    clientSecret: process.env.GMAIL_CLIENT_SECRET_4,
    refreshToken: process.env.GMAIL_REFRESH_TOKEN_4,
    redirectUri: process.env.GMAIL_REDIRECT_URI_4 || 'https://your-crm-domain.example.com/api/gmail/oauth2callback4',
    displayName: 'Auralndn'
  },
  quinary: {
    email: process.env.GMAIL_EMAIL_5 || 'book@example.com',
    clientId: process.env.GMAIL_CLIENT_ID_5,
    clientSecret: process.env.GMAIL_CLIENT_SECRET_5,
    refreshToken: process.env.GMAIL_REFRESH_TOKEN_5,
    redirectUri: process.env.GMAIL_REDIRECT_URI_5 || 'https://your-crm-domain.example.com/api/gmail/oauth2callback5',
    displayName: 'Auralndn'
  },
  senary: {
    email: process.env.GMAIL_EMAIL_6 || 'photo@example.com',
    clientId: process.env.GMAIL_CLIENT_ID_6,
    clientSecret: process.env.GMAIL_CLIENT_SECRET_6,
    refreshToken: process.env.GMAIL_REFRESH_TOKEN_6,
    redirectUri: process.env.GMAIL_REDIRECT_URI_6 || 'https://your-crm-domain.example.com/api/gmail/oauth2callback6',
    displayName: 'Auralndn'
  },
  septenary: {
    email: process.env.GMAIL_EMAIL_7 || 'studio@example.com',
    clientId: process.env.GMAIL_CLIENT_ID_7,
    clientSecret: process.env.GMAIL_CLIENT_SECRET_7,
    refreshToken: process.env.GMAIL_REFRESH_TOKEN_7,
    redirectUri: process.env.GMAIL_REDIRECT_URI_7 || 'https://your-crm-domain.example.com/api/gmail/oauth2callback7',
    displayName: 'Auralndn'
  }
};

// Validate account configurations on startup
Object.keys(ACCOUNTS).forEach(key => {
  const account = ACCOUNTS[key];
  const hasAllCredentials = account.clientId && account.clientSecret && account.refreshToken;
  console.log(`📧 ${key.toUpperCase()} Account:`, hasAllCredentials ? '✅ Configured' : '⚠️ Missing credentials');
});

/**
 * Resolve a named account ('primary', 'secondary', ...) to live credentials.
 *
 * The database is checked first, because that is where the re-authorise
 * button writes new refresh tokens; environment variables remain the
 * fallback for accounts that have not been re-authorised yet. Returns the
 * same shape as the ACCOUNTS entries so callers need no changes.
 *
 * @param {string} accountKey - Legacy env account key
 * @returns {Promise<Object|null>} Account credentials, or null if unknown
 */
async function resolveAccountByKey(accountKey) {
  const envAccount = ACCOUNTS[accountKey];

  try {
    const credentials = require('./emailCredentialResolver');
    const resolved = await credentials.resolveAccount(
      (envAccount && envAccount.email) || accountKey
    );

    if (resolved && resolved.clientId && resolved.clientSecret && resolved.refreshToken) {
      return {
        email: resolved.email || (envAccount && envAccount.email),
        displayName: (envAccount && envAccount.displayName) || resolved.displayName,
        clientId: resolved.clientId,
        clientSecret: resolved.clientSecret,
        refreshToken: resolved.refreshToken,
        redirectUri: resolved.redirectUri || (envAccount && envAccount.redirectUri)
      };
    }
  } catch (err) {
    console.error(`📧 Could not resolve stored credentials for ${accountKey}, using env:`, err.message);
  }

  return envAccount || null;
}

/**
 * Get authenticated Gmail client from a database account object
 * @param {Object} dbAccount - Database email account with decrypted credentials
 * @returns {Promise<Object>} Gmail API client
 */
async function getGmailClientFromDbAccount(dbAccount) {
  try {
    const { client_id, client_secret, refresh_token, redirect_uri, email, display_name } = dbAccount;

    if (!client_id || !client_secret || !refresh_token) {
      throw new Error(`Gmail API credentials not configured for database account ${email}`);
    }

    const oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uri);
    oauth2Client.setCredentials({ refresh_token: refresh_token });

    // Test the token by making a simple API call to verify it's valid
    const testGmail = google.gmail({ version: 'v1', auth: oauth2Client });

    try {
      await testGmail.users.getProfile({ userId: 'me' });
      return testGmail;
    } catch (testError) {
      // Check if it's an invalid_grant error (token expired/revoked)
      if (testError.code === 400 && (
        testError.message?.includes('invalid_grant') ||
        testError.response?.data?.error === 'invalid_grant' ||
        testError.message?.includes('Token has been expired or revoked')
      )) {
        const errorMsg = `OAuth token expired or revoked for ${email}. ` +
          `Please update the refresh token in Email Accounts settings.`;

        console.error(`❌ [${display_name || 'DB Account'}] ${errorMsg}`);
        throw new Error(errorMsg);
      }
      // Re-throw other errors
      throw testError;
    }
  } catch (error) {
    if (error.message?.includes('OAuth token expired or revoked')) {
      throw error;
    }
    throw new Error(`Failed to authenticate Gmail API (database account): ${error.message}`);
  }
}

/**
 * Get authenticated Gmail client for a specific account
 * @param {string|Object} accountKeyOrConfig - 'primary', 'secondary', UUID string, or database account object
 * @returns {Promise<Object>} Gmail API client
 * @throws {Error} If authentication fails with invalid_grant, includes re-auth instructions
 */
async function getGmailClient(accountKeyOrConfig = 'primary') {
  try {
    // If it's a database account object (has client_id and refresh_token properties)
    if (typeof accountKeyOrConfig === 'object' && accountKeyOrConfig.client_id) {
      console.log(`📧 Using database email account: ${accountKeyOrConfig.email}`);
      return getGmailClientFromDbAccount(accountKeyOrConfig);
    }

    // If it's a UUID, look up the account from the database
    if (typeof accountKeyOrConfig === 'string' && UUID_REGEX.test(accountKeyOrConfig)) {
      console.log(`📧 Looking up email account by UUID: ${accountKeyOrConfig}`);
      const emailAccountService = require('./emailAccountService');
      const dbAccount = await emailAccountService.getAccountById(accountKeyOrConfig);

      if (!dbAccount) {
        throw new Error(`Email account not found with ID: ${accountKeyOrConfig}`);
      }

      return getGmailClientFromDbAccount(dbAccount);
    }

    // Legacy: use environment variable account key.
    // Credentials still resolve database-first, so an account re-authorised
    // through the UI sends with its new token instead of the dead env one.
    const accountKey = accountKeyOrConfig;
    const account = await resolveAccountByKey(accountKey);

    if (!account) {
      throw new Error(`Invalid account key: ${accountKey}`);
    }

    const { clientId, clientSecret, refreshToken, redirectUri } = account;

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error(`Gmail API credentials not configured for ${accountKey} account`);
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    // Test the token by making a simple API call to verify it's valid
    const testGmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    try {
      await testGmail.users.getProfile({ userId: 'me' });
      return testGmail;
    } catch (testError) {
      // Check if it's an invalid_grant error (token expired/revoked)
      if (testError.code === 400 && (
        testError.message?.includes('invalid_grant') || 
        testError.response?.data?.error === 'invalid_grant' ||
        testError.message?.includes('Token has been expired or revoked')
      )) {
        const errorMsg = `OAuth token expired or revoked for ${account.email}. Fix it on the Email Accounts page: press "Fix now" on this account. The new token saves automatically.`;

        console.error(`❌ [${account.displayName}] ${errorMsg}`);
        throw new Error(errorMsg);
      }
      // Re-throw other errors
      throw testError;
    }

  } catch (error) {
    // If it's already our formatted error, re-throw it
    if (error.message?.includes('OAuth token expired or revoked')) {
      throw error;
    }
    throw new Error(`Failed to authenticate Gmail API (${accountKey}): ${error.message}`);
  }
}

/**
 * Create email message in RFC 2822 format
 */
function createEmailMessage(to, subject, text, from, fromName) {
  const emailLines = [
    `From: ${fromName} <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    text
  ];

  const email = emailLines.join('\r\n');
  return Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Create email message with HTML content
 */
function createHtmlEmailMessage(to, subject, html, from, fromName) {
  const boundary = '----=_Part_0_' + Date.now() + '.' + Math.random();

  const emailLines = [
    `From: ${fromName} <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    'This is an HTML email. Please use an email client that supports HTML.',
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    html,
    '',
    `--${boundary}--`
  ];

  const email = emailLines.join('\r\n');
  return Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Create email message with attachments
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} text - Email body (plain text or HTML)
 * @param {string} from - Sender email address
 * @param {string} fromName - Sender display name
 * @param {Array} attachments - Array of attachment objects with {path, filename} or {buffer, filename, contentType}
 * @param {boolean} isHtml - Whether the text is HTML
 * @returns {Promise<string>} Base64-encoded email message
 */
async function createEmailMessageWithAttachments(to, subject, text, from, fromName, attachments = [], isHtml = false) {
  const boundary = '----=_Part_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
  const rootBoundary = '----=_Root_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);

  const emailLines = [
    `From: ${fromName} <${from}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${rootBoundary}"`,
    ''
  ];

  // Add message body part
  emailLines.push(`--${rootBoundary}`);
  if (isHtml) {
    emailLines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    emailLines.push('');
    emailLines.push(`--${boundary}`);
    emailLines.push('Content-Type: text/plain; charset=utf-8');
    emailLines.push('');
    emailLines.push('This is an HTML email. Please use an email client that supports HTML.');
    emailLines.push('');
    emailLines.push(`--${boundary}`);
    emailLines.push('Content-Type: text/html; charset=utf-8');
    emailLines.push('');
    emailLines.push(text);
    emailLines.push('');
    emailLines.push(`--${boundary}--`);
  } else {
    emailLines.push('Content-Type: text/plain; charset=utf-8');
    emailLines.push('');
    emailLines.push(text);
  }

  // Add attachments
  for (const attachment of attachments) {
    try {
      let fileBuffer;
      let filename;
      let contentType = 'application/octet-stream';

      if (attachment.buffer) {
        // Attachment provided as buffer
        fileBuffer = attachment.buffer;
        filename = attachment.filename || 'attachment';
        contentType = attachment.contentType || contentType;
      } else if (attachment.path) {
        // Attachment provided as file path
        filename = attachment.filename || path.basename(attachment.path);
        fileBuffer = await fs.readFile(attachment.path);
        
        // Detect content type from filename
        const ext = path.extname(filename).toLowerCase();
        const mimeTypes = {
          '.pdf': 'application/pdf',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif',
          '.doc': 'application/msword',
          '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          '.xls': 'application/vnd.ms-excel',
          '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          '.zip': 'application/zip',
          '.txt': 'text/plain'
        };
        if (mimeTypes[ext]) {
          contentType = mimeTypes[ext];
        }
      } else {
        console.warn(`⚠️ Skipping invalid attachment: ${JSON.stringify(attachment)}`);
        continue;
      }

      // Encode attachment in base64
      const encodedAttachment = fileBuffer.toString('base64');

      // Add attachment part
      emailLines.push(`--${rootBoundary}`);
      emailLines.push(`Content-Type: ${contentType}; name="${filename}"`);
      emailLines.push('Content-Disposition: attachment; filename="' + filename + '"');
      emailLines.push('Content-Transfer-Encoding: base64');
      emailLines.push('');
      // Split base64 into 76-character lines (RFC 2045)
      emailLines.push(encodedAttachment.match(/.{1,76}/g).join('\r\n'));
    } catch (error) {
      console.error(`❌ Error processing attachment ${attachment.filename || attachment.path}:`, error.message);
      // Continue with other attachments
    }
  }

  // Close root boundary
  emailLines.push(`--${rootBoundary}--`);

  const email = emailLines.join('\r\n');
  return Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Send an email using Gmail API
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} text - Email plain text body (or HTML if isHtml is true)
 * @param {Object} options - Additional options
 * @param {boolean} options.isHtml - Whether the text is HTML
 * @param {string} options.fromName - Sender display name (default: account's display name)
 * @param {string|Object} options.accountKey - Which account to use: 'primary', 'secondary', UUID, or database account object (default: 'primary')
 * @param {Array} options.attachments - Array of attachment objects with {path, filename} or {buffer, filename, contentType}
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendEmail(to, subject, text, options = {}) {
  const emailId = Math.random().toString(36).substring(2, 8);
  const { isHtml = false, accountKey = 'primary', fromName, attachments = [] } = options;

  // Determine account configuration (database or env vars)
  let account;
  let isDbAccount = false;

  // Check if accountKey is a database account object
  if (typeof accountKey === 'object' && accountKey.client_id) {
    account = {
      email: accountKey.email,
      displayName: accountKey.display_name || 'Auralndn',
      clientId: accountKey.client_id,
      clientSecret: accountKey.client_secret,
      refreshToken: accountKey.refresh_token,
      redirectUri: accountKey.redirect_uri
    };
    isDbAccount = true;
  }
  // Check if accountKey is a UUID (database lookup)
  else if (typeof accountKey === 'string' && UUID_REGEX.test(accountKey)) {
    try {
      const emailAccountService = require('./emailAccountService');
      const dbAccount = await emailAccountService.getAccountById(accountKey);
      if (dbAccount) {
        account = {
          email: dbAccount.email,
          displayName: dbAccount.display_name || 'Auralndn',
          clientId: dbAccount.client_id,
          clientSecret: dbAccount.client_secret,
          refreshToken: dbAccount.refresh_token,
          redirectUri: dbAccount.redirect_uri
        };
        isDbAccount = true;
      }
    } catch (dbError) {
      console.error(`📧 [${emailId}] Error looking up database account:`, dbError.message);
    }
  }

  // Fall back to the named account. Resolves database-first so a re-authorised
  // account sends with its new token rather than the stale env var.
  if (!account) {
    account = await resolveAccountByKey(accountKey);
    if (!account) {
      return { success: false, error: `Invalid account key: ${accountKey}` };
    }
  }

  const senderName = fromName || account.displayName;
  const senderEmail = account.email;

  console.log(`📧 [${emailId}] Sending email via Gmail API (${accountKey}): ${subject} → ${to}`);
  console.log(`📧 [${emailId}] From: ${senderName} <${senderEmail}>`);

  if (attachments && attachments.length > 0) {
    console.log(`📎 [${emailId}] Attachments: ${attachments.length} file(s)`);
    attachments.forEach((att, idx) => {
      console.log(`📎 [${emailId}]   ${idx + 1}. ${att.filename || att.path || 'Unknown'} (${att.path ? 'file path' : 'buffer'})`);
    });
  }

  if (!to || !subject || !text) {
    const errorMsg = `📧 [${emailId}] Missing required fields: ${!to ? 'to, ' : ''}${!subject ? 'subject, ' : ''}${!text ? 'body' : ''}`.replace(/, $/, '');
    console.error(errorMsg);
    return { success: false, error: errorMsg };
  }

  try {
    // Pass the resolved account to getGmailClient to avoid duplicate database lookups
    const gmailAccountArg = isDbAccount ? {
      client_id: account.clientId,
      client_secret: account.clientSecret,
      refresh_token: account.refreshToken,
      redirect_uri: account.redirectUri,
      email: account.email,
      display_name: account.displayName
    } : accountKey;

    const gmail = await getGmailClient(gmailAccountArg);

    // Create the email message
    let encodedMessage;
    if (attachments && attachments.length > 0) {
      // Use multipart/mixed for emails with attachments
      encodedMessage = await createEmailMessageWithAttachments(to, subject, text, senderEmail, senderName, attachments, isHtml);
      console.log(`📧 [${emailId}] Created multipart/mixed message with ${attachments.length} attachment(s)`);
    } else {
      // Use simple message format for emails without attachments
      encodedMessage = isHtml
        ? createHtmlEmailMessage(to, subject, text, senderEmail, senderName)
        : createEmailMessage(to, subject, text, senderEmail, senderName);
    }

    console.log(`📧 [${emailId}] Sending email via Gmail API (${accountKey})...`);

    // Send the email
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    });

    console.log(`✅ [${emailId}] Email sent successfully via Gmail API (${accountKey}) - ID: ${response.data.id}`);
    if (attachments && attachments.length > 0) {
      console.log(`📎 [${emailId}] ✅ ${attachments.length} attachment(s) included`);
    }

    return {
      success: true,
      messageId: response.data.id,
      threadId: response.data.threadId,
      provider: 'gmail-api',
      accountKey: accountKey,
      fromEmail: senderEmail
    };

  } catch (error) {
    console.error(`❌ [${emailId}] Gmail API send failed (${accountKey}):`, error.message);
    
    // Check if it's an invalid_grant error
    const isInvalidGrant = error.code === 400 && (
      error.message?.includes('invalid_grant') || 
      error.response?.data?.error === 'invalid_grant' ||
      error.message?.includes('Token has been expired or revoked')
    );

    if (isInvalidGrant) {
      const account = ACCOUNTS[accountKey];
      console.error(`❌ [${emailId}] OAuth token expired for ${account?.email || accountKey}`);
      console.error(`❌ [${emailId}] Fix it on the Email Accounts page: press "Fix now" on this account. The new token saves automatically.`);

      // Note: Automatic fallback to primary account is handled in emailService.js
      // to avoid recursive calls and maintain proper error handling
      if (accountKey === 'secondary' || accountKey === 'tertiary' || accountKey === 'quaternary' || accountKey === 'quinary' || accountKey === 'senary' || accountKey === 'septenary') {
        console.log(`💡 [${emailId}] Fallback to primary account will be attempted by emailService`);
      }
    }

    if (error.errors) {
      console.error(`❌ [${emailId}] Error details:`, JSON.stringify(error.errors, null, 2));
    }

    return {
      success: false,
      error: error.message,
      code: error.code,
      details: error.errors,
      accountKey: accountKey,
      isInvalidGrant: isInvalidGrant || false
    };
  }
}

/**
 * Send an HTML email using Gmail API
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} html - Email HTML body
 * @param {Object} options - Additional options (including accountKey)
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendHtmlEmail(to, subject, html, options = {}) {
  return sendEmail(to, subject, html, { ...options, isHtml: true });
}

/**
 * Get email message by ID
 * @param {string} messageId - Gmail message ID
 * @param {string} accountKey - Which account to use: 'primary' or 'secondary' (default: 'primary')
 */
async function getEmail(messageId, accountKey = 'primary') {
  try {
    const gmail = await getGmailClient(accountKey);

    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full'
    });

    return {
      success: true,
      message: response.data
    };

  } catch (error) {
    console.error(`❌ Failed to get email (${accountKey}):`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * List emails with optional query
 * @param {string} query - Gmail search query
 * @param {number} maxResults - Maximum results to return
 * @param {string} accountKey - Which account to use: 'primary' or 'secondary' (default: 'primary')
 */
async function listEmails(query = '', maxResults = 10, accountKey = 'primary') {
  try {
    const gmail = await getGmailClient(accountKey);

    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults
    });

    return {
      success: true,
      messages: response.data.messages || [],
      resultSizeEstimate: response.data.resultSizeEstimate
    };

  } catch (error) {
    console.error(`❌ Failed to list emails (${accountKey}):`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Test Gmail API connection
 * @param {string} accountKey - Which account to test: 'primary' or 'secondary' (default: 'primary')
 */
async function testConnection(accountKey = 'primary') {
  try {
    const account = ACCOUNTS[accountKey];
    const gmail = await getGmailClient(accountKey);

    const response = await gmail.users.getProfile({
      userId: 'me'
    });

    console.log(`✅ Gmail API connection successful (${accountKey})`);
    console.log(`📧 Email: ${response.data.emailAddress}`);
    console.log(`📊 Total messages: ${response.data.messagesTotal}`);

    return {
      success: true,
      profile: response.data,
      accountKey: accountKey,
      configuredEmail: account.email
    };

  } catch (error) {
    console.error(`❌ Gmail API connection failed (${accountKey}):`, error.message);
    return {
      success: false,
      error: error.message,
      accountKey: accountKey
    };
  }
}

/**
 * Get account information
 * @param {string} accountKey - 'primary' or 'secondary'
 */
function getAccountInfo(accountKey = 'primary') {
  const account = ACCOUNTS[accountKey];
  if (!account) {
    return null;
  }

  return {
    email: account.email,
    displayName: account.displayName,
    hasCredentials: !!(account.clientId && account.clientSecret && account.refreshToken)
  };
}

module.exports = {
  sendEmail,
  sendHtmlEmail,
  getEmail,
  listEmails,
  testConnection,
  getAccountInfo,
  getGmailClient,
  getGmailClientFromDbAccount,
  ACCOUNTS
};
