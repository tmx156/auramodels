/**
 * Single source of truth for Gmail account credentials.
 *
 * Resolution order for every account:
 *   1. email_accounts table (written by the one-click re-auth flow)
 *   2. GMAIL_* environment variables (legacy / bootstrap)
 *
 * The DB wins because it is the only store the running app can write to.
 * Environment variables stay as a fallback so nothing breaks before an
 * account has been re-authorised through the UI.
 */

const emailAccountService = require('./emailAccountService');

// Legacy env-var account keys, in display order.
const ENV_ACCOUNT_KEYS = [
  'primary', 'secondary', 'tertiary', 'quaternary', 'quinary', 'senary', 'septenary'
];

// Suffix used by each key's env vars: primary has none, secondary is _2, etc.
const ENV_SUFFIX = {
  primary: '', secondary: '_2', tertiary: '_3', quaternary: '_4',
  quinary: '_5', senary: '_6', septenary: '_7'
};

const DISPLAY_NAME = {
  primary: 'Primary Account', secondary: 'Secondary Account', tertiary: '3rd Account',
  quaternary: '4th Account', quinary: '5th Account', senary: '6th Account', septenary: '7th Account'
};

// gmailPoller and gmailService fall back to these when GMAIL_EMAIL_n is unset.
// Mirror them exactly, or the health panel would omit an account the pollers
// are still actively using.
// The redirect URI each account's original OAuth flow used. These are the
// URIs registered on the Google clients, so re-authorisation reuses them.
const DEFAULT_REDIRECT = {
  primary: 'http://localhost:5000/api/gmail/oauth2callback',
  secondary: 'https://your-crm-domain.example.com/api/gmail/oauth2callback2',
  tertiary: 'https://your-crm-domain.example.com/api/gmail/oauth2callback3',
  quaternary: 'https://your-crm-domain.example.com/api/gmail/oauth2callback4',
  quinary: 'https://your-crm-domain.example.com/api/gmail/oauth2callback5',
  senary: 'https://your-crm-domain.example.com/api/gmail/oauth2callback6',
  septenary: 'https://your-crm-domain.example.com/api/gmail/oauth2callback7'
};

const DEFAULT_EMAIL = {
  primary: 'hello@example.com',
  tertiary: 'bookings@example.com',
  quaternary: 'appt@example.com',
  quinary: 'book@example.com',
  senary: 'photo@example.com',
  septenary: 'studio@example.com'
};

/** Default OAuth redirect URI for this deployment. */
function defaultRedirectUri() {
  const base = process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL;
  if (base) return `${base.replace(/\/+$/, '')}/api/email-accounts/oauth-callback`;
  return 'http://localhost:5000/api/email-accounts/oauth-callback';
}

/** Read one legacy env-var account, or null when it isn't configured at all. */
function readEnvAccount(accountKey) {
  const s = ENV_SUFFIX[accountKey];
  const clientId = process.env[`GMAIL_CLIENT_ID${s}`];
  const clientSecret = process.env[`GMAIL_CLIENT_SECRET${s}`];
  const refreshToken = process.env[`GMAIL_REFRESH_TOKEN${s}`];

  // Only apply the hardcoded default once the slot is actually in use,
  // otherwise every unused slot would appear as a real account.
  const email = process.env[`GMAIL_EMAIL${s}`] ||
    ((clientId || refreshToken) ? DEFAULT_EMAIL[accountKey] : null);

  if (!email && !clientId && !refreshToken) return null;

  return {
    source: 'env',
    accountKey,
    id: null,
    email: email || null,
    displayName: DISPLAY_NAME[accountKey],
    clientId: clientId || null,
    clientSecret: clientSecret || null,
    refreshToken: refreshToken || null,
    redirectUri: process.env[`GMAIL_REDIRECT_URI${s}`] || defaultRedirectUri(),
    envRedirectUri: process.env[`GMAIL_REDIRECT_URI${s}`] || DEFAULT_REDIRECT[accountKey] || null,
    envVarName: `GMAIL_REFRESH_TOKEN${s}`
  };
}

/** Read every active account from the database, credentials decrypted. */
async function readDbAccounts() {
  const summaries = await emailAccountService.getAllAccounts();
  const out = [];

  for (const summary of summaries || []) {
    if (summary.is_active === false) continue;

    const full = await emailAccountService.getAccountById(summary.id);
    if (!full) continue;

    out.push({
      source: 'database',
      accountKey: null,
      id: full.id,
      email: full.email,
      displayName: full.display_name || full.name || full.email,
      clientId: full.client_id || null,
      clientSecret: full.client_secret || null,
      refreshToken: full.refresh_token || null,
      redirectUri: full.redirect_uri || defaultRedirectUri(),
      envRedirectUri: null,
      isDefault: !!full.is_default,
      envVarName: null
    });
  }

  return out;
}

// Pollers call this on every cycle, so cache briefly. The TTL is short
// enough that a re-authorisation lands within one poll even if the explicit
// invalidation below is somehow missed.
const CACHE_TTL_MS = 60 * 1000;
let cache = { accounts: null, expires: 0 };

/** Drop the cache so the next resolve re-reads the database. */
function invalidateCache() {
  cache = { accounts: null, expires: 0 };
}

/**
 * Every account the app knows about, merged and de-duplicated by email.
 *
 * A DB account and an env account for the same mailbox are one account: the
 * DB credentials win, but we keep the env var name so the UI can still tell
 * you which Railway variable is now redundant.
 */
async function resolveAllAccounts(options) {
  const force = !!(options && options.force);

  if (!force && cache.accounts && Date.now() < cache.expires) {
    return cache.accounts;
  }

  const merged = new Map(); // lowercased email -> account

  let dbAccounts = [];
  try {
    dbAccounts = await readDbAccounts();
  } catch (err) {
    console.error('⚠️ Could not read email accounts from database:', err.message);
  }

  for (const account of dbAccounts) {
    if (!account.email) continue;
    merged.set(account.email.toLowerCase(), account);
  }

  for (const key of ENV_ACCOUNT_KEYS) {
    const envAccount = readEnvAccount(key);
    if (!envAccount || !envAccount.email) continue;

    const emailKey = envAccount.email.toLowerCase();
    const existing = merged.get(emailKey);

    if (!existing) {
      merged.set(emailKey, envAccount);
      continue;
    }

    // DB row exists for this mailbox. Keep DB credentials, but remember the
    // env linkage, and fall back field-by-field for anything the DB lacks.
    existing.accountKey = envAccount.accountKey;
    existing.envVarName = envAccount.envVarName;
    existing.envRedirectUri = existing.envRedirectUri || envAccount.envRedirectUri;
    existing.clientId = existing.clientId || envAccount.clientId;
    existing.clientSecret = existing.clientSecret || envAccount.clientSecret;

    if (!existing.refreshToken && envAccount.refreshToken) {
      existing.refreshToken = envAccount.refreshToken;
      existing.source = 'env';
    }
  }

  const accounts = Array.from(merged.values());
  cache = { accounts: accounts, expires: Date.now() + CACHE_TTL_MS };
  return accounts;
}

/** Resolve a single account by DB id, email, or legacy env key. */
async function resolveAccount(identifier, options) {
  if (!identifier) return null;
  const all = await resolveAllAccounts(options);
  const needle = String(identifier).toLowerCase();

  return all.find(a =>
    (a.id && a.id.toLowerCase() === needle) ||
    (a.email && a.email.toLowerCase() === needle) ||
    (a.accountKey && a.accountKey.toLowerCase() === needle)
  ) || null;
}

/** True when the account has everything needed to mint an access token. */
function isConfigured(account) {
  return !!(account && account.clientId && account.clientSecret && account.refreshToken);
}

module.exports = {
  resolveAllAccounts,
  invalidateCache,
  resolveAccount,
  isConfigured,
  defaultRedirectUri,
  ENV_ACCOUNT_KEYS,
  ENV_SUFFIX
};
