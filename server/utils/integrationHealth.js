/**
 * Live health checks for the outbound integrations: Gmail accounts and SMS.
 *
 * Every check hits the real provider. Presence of an environment variable is
 * never treated as health - that is exactly how a dead credential stayed
 * invisible behind a green "configured" log line.
 */

const axios = require('axios');
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');

const credentials = require('./emailCredentialResolver');

const SMS_API_BASE = 'https://api.thesmsworks.co.uk/v1';
const PROVIDER_TIMEOUT_MS = 12000;

/* ------------------------------------------------------------------ Gmail */

/**
 * Force a value to a printable string. Google sometimes returns `error` and
 * `error_description` as objects; handing one of those to React as a child
 * throws and blanks the whole page, so never let one through.
 */
function asText(value, fallback) {
  if (typeof value === 'string' && value.trim()) return value;
  if (value && typeof value === 'object') {
    if (typeof value.message === 'string' && value.message) return value.message;
    try {
      return JSON.stringify(value);
    } catch (err) {
      return fallback;
    }
  }
  return fallback;
}

/** Classify a Google API failure into something the UI can act on. */
function classifyGoogleError(err) {
  const payload = (err && err.response && err.response.data) || {};
  const rawCode = payload.error;
  // `error` is a string for OAuth failures and an object for Gmail API ones.
  const code = typeof rawCode === 'string' ? rawCode : '';
  const description = asText(
    payload.error_description,
    asText(rawCode, (err && err.message) || 'Unknown error')
  );

  if (code === 'invalid_grant') {
    return {
      status: 'needs_reauth',
      error: 'Refresh token expired or revoked',
      detail: 'Google rejected the stored refresh token. Re-authorise this account to issue a new one.',
      actionable: true
    };
  }

  if (code === 'invalid_client') {
    return {
      status: 'bad_client',
      error: 'OAuth client ID or secret is invalid',
      detail: 'Re-authorising will not help. Check the credentials in Google Cloud Console.',
      actionable: false
    };
  }

  if (err && (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED')) {
    return { status: 'error', error: 'Timed out contacting Google', detail: description, actionable: false };
  }

  return { status: 'error', error: description, detail: description, actionable: false };
}

/**
 * Check one Gmail account by actually refreshing its token and reading the
 * mailbox profile. Returns a plain object; never throws.
 */
async function checkGmailAccount(account) {
  const base = {
    id: account.id,
    accountKey: account.accountKey,
    email: account.email,
    displayName: account.displayName,
    source: account.source,
    envVarName: account.envVarName,
    canReauth: !!(account.clientId && account.clientSecret)
  };

  const missing = [];
  if (!account.clientId) missing.push('client ID');
  if (!account.clientSecret) missing.push('client secret');
  if (!account.refreshToken) missing.push('refresh token');

  if (missing.length) {
    return Object.assign({}, base, {
      status: 'not_configured',
      error: 'Missing ' + missing.join(', '),
      detail: account.clientId && account.clientSecret
        ? 'Authorise this account to issue a refresh token.'
        : 'Add the OAuth client ID and secret before authorising.',
      actionable: !!(account.clientId && account.clientSecret)
    });
  }

  const startedAt = Date.now();

  try {
    const oauth2Client = new google.auth.OAuth2(account.clientId, account.clientSecret, account.redirectUri);
    oauth2Client.setCredentials({ refresh_token: account.refreshToken });

    // Forces a real token exchange - this is what actually fails when revoked.
    const tokenResponse = await oauth2Client.getAccessToken();
    if (!tokenResponse || !tokenResponse.token) {
      throw new Error('Google returned no access token');
    }

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });

    const mailbox = profile.data.emailAddress;

    return Object.assign({}, base, {
      status: 'healthy',
      error: null,
      detail: null,
      actionable: false,
      latencyMs: Date.now() - startedAt,
      mailbox: mailbox,
      messagesTotal: profile.data.messagesTotal,
      // A mailbox that authenticates as a different address than we expect is
      // a real misconfiguration: mail would send from the wrong account.
      mailboxMismatch: !!(mailbox && account.email &&
        mailbox.toLowerCase() !== account.email.toLowerCase())
    });
  } catch (err) {
    return Object.assign({}, base, classifyGoogleError(err), { latencyMs: Date.now() - startedAt });
  }
}

/** Check every known Gmail account in parallel. */
async function checkAllGmailAccounts() {
  // Always re-read: a health check that trusted a cache could report a
  // stale success right after a token was revoked.
  const accounts = await credentials.resolveAllAccounts({ force: true });
  const results = await Promise.all(accounts.map(checkGmailAccount));

  results.sort((a, b) => (a.email || '').localeCompare(b.email || ''));

  const summary = {
    total: results.length,
    healthy: results.filter(r => r.status === 'healthy').length,
    needsReauth: results.filter(r => r.status === 'needs_reauth').length,
    notConfigured: results.filter(r => r.status === 'not_configured').length,
    errored: results.filter(r => r.status === 'error' || r.status === 'bad_client').length
  };

  return { summary, accounts: results };
}

/* -------------------------------------------------------------------- SMS */

/** Build the Authorization header value the SMS Works expects. */
function buildSmsAuthHeader() {
  const preGenerated = (process.env.SMS_WORKS_JWT_TOKEN || '').trim();
  if (preGenerated) {
    const token = preGenerated.startsWith('JWT ') ? preGenerated.slice(4) : preGenerated;
    return { header: 'JWT ' + token, token: token, origin: 'SMS_WORKS_JWT_TOKEN' };
  }

  const apiKey = process.env.SMS_WORKS_API_KEY;
  const apiSecret = process.env.SMS_WORKS_API_SECRET;
  if (!apiKey || !apiSecret) return null;

  const now = Math.floor(Date.now() / 1000);
  const token = jwt.sign({ iss: apiKey, iat: now, exp: now + 3600 }, apiSecret, { algorithm: 'HS256' });
  return { header: 'JWT ' + token, token: token, origin: 'SMS_WORKS_API_KEY + SECRET' };
}

/** Decode a JWT payload without verifying - we only want its claims. */
function decodeJwtPayload(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
  } catch (err) {
    return null;
  }
}

/**
 * Collect configuration problems that are true regardless of what the API
 * says - things a live check alone would not explain.
 */
function collectSmsConfigIssues(auth) {
  const issues = [];
  const apiKey = process.env.SMS_WORKS_API_KEY;
  const apiSecret = process.env.SMS_WORKS_API_SECRET;
  const preGenerated = (process.env.SMS_WORKS_JWT_TOKEN || '').trim();

  if (preGenerated && apiKey) {
    const payload = decodeJwtPayload(preGenerated.replace(/^JWT /, ''));

    if (payload && payload.key && payload.key !== apiKey) {
      issues.push({
        severity: 'warning',
        title: 'Credentials belong to two different SMS Works accounts',
        detail: 'SMS_WORKS_JWT_TOKEN was issued for key ' + payload.key + ', but SMS_WORKS_API_KEY is ' +
                apiKey + '. The JWT wins, so the API key and secret are unused. Replace all four ' +
                'variables from a single account.'
      });
    }

    if (payload && payload.secret && apiSecret && payload.secret !== apiSecret) {
      issues.push({
        severity: 'info',
        title: 'SMS_WORKS_API_SECRET does not match the JWT',
        detail: 'Harmless while the JWT works, but the key/secret fallback would fail if the JWT is removed.'
      });
    }

    if (payload && payload.exp) {
      const expiresAt = new Date(payload.exp * 1000);
      if (expiresAt < new Date()) {
        issues.push({
          severity: 'critical',
          title: 'Pre-generated JWT has expired',
          detail: 'SMS_WORKS_JWT_TOKEN expired on ' + expiresAt.toISOString() + '. Generate a new one.'
        });
      }
    }
  }

  if (!auth) {
    issues.push({
      severity: 'critical',
      title: 'No SMS credentials configured',
      detail: 'Set SMS_WORKS_JWT_TOKEN, or both SMS_WORKS_API_KEY and SMS_WORKS_API_SECRET.'
    });
  }

  if (!process.env.SMS_WORKS_SENDER_ID) {
    issues.push({
      severity: 'info',
      title: 'No sender ID set',
      detail: 'SMS_WORKS_SENDER_ID is unset, so sends fall back to the placeholder Auralndn.'
    });
  }

  return issues;
}

/**
 * Recent outbound SMS delivery record, straight from the messages table.
 * Purely informational - never let this fail the health check.
 */
async function recentSmsDelivery(windowHours) {
  const hours = windowHours || 24;
  const ROW_LIMIT = 500;

  try {
    const { getSupabaseClient } = require('../config/supabase-client');
    const supabase = getSupabaseClient();
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const { data, error, count } = await supabase
      .from('messages')
      .select('status, delivery_status, error_message, sent_at, recipient_phone', { count: 'exact' })
      .eq('type', 'sms')
      .gte('sent_at', since)
      .order('sent_at', { ascending: false })
      .limit(ROW_LIMIT);

    if (error) throw error;

    // `status` is the reliable field: 'sent' means the provider accepted it,
    // 'failed' means it did not, 'received' is inbound. `delivery_status` is
    // written as 'sent' by most paths and says nothing about the outcome, so
    // treating anything other than 'delivered' as a failure raises false
    // alarms on messages that went out perfectly well.
    const rows = (data || []).filter(r => r.status !== 'received');
    const failed = rows.filter(r => r.status === 'failed');

    // Group identical errors so one broken credential reads as one problem.
    const byError = new Map();
    for (const row of failed) {
      const key = row.error_message || 'Unknown error';
      byError.set(key, (byError.get(key) || 0) + 1);
    }

    const topErrors = Array.from(byError.entries())
      .map(([message, count]) => ({ message: message, count: count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // `count` is the true total for the window; rows are capped. Say so
    // rather than reporting the cap as if it were the real figure.
    const total = typeof count === 'number' ? count : rows.length;

    return {
      windowHours: hours,
      sent: total,
      failed: failed.length,
      sampled: total > rows.length ? rows.length : null,
      lastSentAt: rows.length ? rows[0].sent_at : null,
      topErrors: topErrors
    };
  } catch (err) {
    return { windowHours: hours, unavailable: true, error: err.message };
  }
}

/**
 * Live SMS health: validates auth against the provider and reads the credit
 * balance. Never throws.
 */
async function checkSmsHealth() {
  const auth = buildSmsAuthHeader();
  const issues = collectSmsConfigIssues(auth);
  const senderId = process.env.SMS_WORKS_SENDER_ID || 'Auralndn';
  const delivery = await recentSmsDelivery(24);

  if (!delivery.unavailable && delivery.failed > 0) {
    // When the window was sampled, `failed` counts against the sample size,
    // not the true total - comparing it to `sent` would overstate the rate.
    const examined = delivery.sampled || delivery.sent;

    issues.push({
      severity: delivery.failed === examined ? 'critical' : 'warning',
      title: delivery.failed + ' of ' + examined + ' SMS failed in the last 24h' +
             (delivery.sampled ? ' (most recent ' + delivery.sampled + ' of ' + delivery.sent + ')' : ''),
      detail: delivery.topErrors.length
        ? 'Most common: "' + delivery.topErrors[0].message + '" (' + delivery.topErrors[0].count + ' times).'
        : 'No error detail was recorded against the failures.'
    });
  }

  if (!auth) {
    return {
      status: 'not_configured',
      provider: 'thesmsworks',
      senderId: senderId,
      credentialSource: null,
      balance: null,
      error: 'No SMS Works credentials configured',
      issues: issues,
      delivery: delivery
    };
  }

  const startedAt = Date.now();

  try {
    const response = await axios.get(SMS_API_BASE + '/credits/balance', {
      headers: { Authorization: auth.header },
      timeout: PROVIDER_TIMEOUT_MS
    });

    const raw = response.data || {};
    const credits = raw.credits !== undefined ? raw.credits
      : (raw.balance !== undefined ? raw.balance : null);

    if (credits !== null && Number(credits) <= 0) {
      issues.push({
        severity: 'critical',
        title: 'SMS account has no credit',
        detail: 'Authentication works, but the balance is zero so sends will fail. Top up at thesmsworks.co.uk.'
      });
    } else if (credits !== null && Number(credits) < 50) {
      issues.push({
        severity: 'warning',
        title: 'Low SMS credit (' + credits + ' remaining)',
        detail: 'Top up soon to avoid interrupted sends.'
      });
    }

    return {
      status: issues.some(i => i.severity === 'critical') ? 'degraded' : 'healthy',
      provider: 'thesmsworks',
      senderId: senderId,
      credentialSource: auth.origin,
      balance: credits,
      latencyMs: Date.now() - startedAt,
      error: null,
      issues: issues,
      delivery: delivery
    };
  } catch (err) {
    const httpStatus = err && err.response ? err.response.status : null;
    const isAuthFailure = httpStatus === 401 || httpStatus === 403;

    issues.push(isAuthFailure
      ? {
          severity: 'critical',
          title: 'SMS Works rejected the credentials',
          detail: 'The provider returned ' + httpStatus + ' Unauthorized. The token is revoked, or the ' +
                  'account is suspended or closed. Regenerate the API key and secret in the SMS Works dashboard.'
        }
      : {
          severity: 'critical',
          title: 'Could not reach SMS Works',
          detail: (err && err.message) || 'Unknown network error.'
        });

    return {
      status: isAuthFailure ? 'auth_failed' : 'unreachable',
      provider: 'thesmsworks',
      senderId: senderId,
      credentialSource: auth.origin,
      balance: null,
      latencyMs: Date.now() - startedAt,
      httpStatus: httpStatus,
      error: isAuthFailure ? 'Provider returned ' + httpStatus + ' Unauthorized' : ((err && err.message) || 'Request failed'),
      issues: issues,
      delivery: delivery
    };
  }
}

module.exports = {
  checkGmailAccount,
  checkAllGmailAccounts,
  checkSmsHealth
};
