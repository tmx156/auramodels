/**
 * One-click Gmail re-authorisation.
 *
 * Two things make this actually work where the previous flow did not:
 *
 *  1. The OAuth `state` is a short-lived signed JWT rather than an entry in an
 *     in-memory Map. The old Map was lost on every Railway restart and was not
 *     shared between instances, which is what produced "Session Expired" part
 *     way through a perfectly good authorisation.
 *
 *  2. The new refresh token is written to the email_accounts table, which is
 *     the only credential store the running app can write to. Writing it to a
 *     file (the old behaviour) did not survive a deploy, and environment
 *     variables cannot be changed from inside the process at all.
 */

const jwt = require('jsonwebtoken');
const { google } = require('googleapis');

const emailAccountService = require('./emailAccountService');
const credentials = require('./emailCredentialResolver');

const STATE_TTL_SECONDS = 15 * 60;

/**
 * Callback paths this server completes the OAuth flow on.
 *
 * Only the first is ever sent to Google. The /api/gmail/oauth2callbackN
 * entries are historical paths kept live as a safety net, so a client that
 * still has one of them registered can complete the flow rather than
 * dead-ending. Listed here as the record of what this server accepts.
 */
const ACCEPTED_CALLBACK_PATHS = [
  '/api/email-accounts/oauth-callback',
  '/api/gmail/oauth2callback',
  '/api/gmail/oauth2callback2',
  '/api/gmail/oauth2callback3',
  '/api/gmail/oauth2callback4',
  '/api/gmail/oauth2callback5',
  '/api/gmail/oauth2callback6',
  '/api/gmail/oauth2callback7'
];

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email'
];

function stateSecret() {
  return process.env.JWT_SECRET || 'your-fallback-secret-key';
}

/** The scheme+host the admin is actually browsing, e.g. https://crm.example. */
function requestOrigin(req) {
  const host = req && req.get && req.get('host');
  if (!host) return null;

  // Railway terminates TLS at the proxy, so req.protocol reports http.
  const forwarded = req.get('x-forwarded-proto');
  const protocol = forwarded
    ? forwarded.split(',')[0].trim()
    : (process.env.NODE_ENV === 'production' ? 'https' : req.protocol);

  return protocol + '://' + host;
}

/** Canonical callback path for this deployment. */
function defaultCallbackUri(req) {
  // Explicit override, for when a redirect URI is already registered on the
  // Google OAuth clients and editing the console is not worth it. Whatever
  // is set here is sent verbatim for every account, so it must match a
  // registered URI exactly and must be a path this server serves a callback
  // on (see ACCEPTED_CALLBACK_PATHS). The redirect target does not have to
  // be the host the admin is browsing - Google simply sends the browser
  // there afterwards, and the signed state carries the rest.
  const override = (process.env.GMAIL_OAUTH_REDIRECT_URI || '').trim();
  if (override) return override.replace(/\/+$/, '');

  const origin = requestOrigin(req);
  if (origin) return origin + '/api/email-accounts/oauth-callback';

  const configured = process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL;
  if (configured) {
    return configured.replace(/\/+$/, '') + '/api/email-accounts/oauth-callback';
  }

  return 'http://localhost:5000/api/email-accounts/oauth-callback';
}

/**
 * The redirect URI sent to Google for one account.
 *
 * Order:
 *   1. GMAIL_OAUTH_REDIRECT_URI  - explicit override for all accounts
 *   2. the account's GMAIL_REDIRECT_URI* value
 *   3. one derived from the host being browsed
 *
 * Step 2 matters: those environment variables are what the original OAuth
 * flow sent, so they are the URIs actually registered on the Google clients.
 * Reusing them means re-authorisation works against the Google Cloud Console
 * as it already stands, with nothing new to register.
 *
 * The redirect target need not be the host being browsed - Google sends the
 * browser there after consent, and the signed state carries the account - so
 * a production URI still completes the flow started from another domain.
 */
function callbackUri(req, account) {
  const override = (process.env.GMAIL_OAUTH_REDIRECT_URI || '').trim();
  if (override) return override.replace(/\/+$/, '');

  const registered = account && account.envRedirectUri;
  if (registered) {
    let parsed;
    try {
      parsed = new URL(registered);
    } catch (err) {
      parsed = null;
    }

    // Only honour paths this server actually serves a callback on.
    if (parsed && ACCEPTED_CALLBACK_PATHS.includes(parsed.pathname)) {
      return registered.replace(/\/+$/, '');
    }
  }

  return defaultCallbackUri(req);
}

/** Sign the state that ties a callback back to the account being authorised. */
function signState(payload) {
  return jwt.sign(payload, stateSecret(), { expiresIn: STATE_TTL_SECONDS });
}

/** Verify and decode state. Returns null when missing, tampered, or expired. */
function verifyState(state) {
  try {
    return jwt.verify(state, stateSecret());
  } catch (err) {
    return null;
  }
}

/**
 * Build the Google consent URL for one account.
 * Throws with a user-facing message when the account cannot be authorised.
 */
async function buildAuthUrl(identifier, req) {
  const account = await credentials.resolveAccount(identifier, { force: true });

  if (!account) {
    const err = new Error('Email account not found');
    err.statusCode = 404;
    throw err;
  }

  if (!account.clientId || !account.clientSecret) {
    const err = new Error(
      'This account has no OAuth client ID or secret, so it cannot be authorised. ' +
      'Add them to the account first.'
    );
    err.statusCode = 400;
    throw err;
  }

  const redirectUri = callbackUri(req, account);

  const oauth2Client = new google.auth.OAuth2(account.clientId, account.clientSecret, redirectUri);

  const state = signState({
    accountId: account.id || null,
    email: account.email,
    accountKey: account.accountKey || null,
    redirectUri: redirectUri
  });

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',        // always re-issue a refresh token, even if already granted
    include_granted_scopes: true,
    login_hint: account.email, // preselect the right mailbox
    scope: SCOPES,
    state: state
  });

  return { authUrl: authUrl, account: account, redirectUri: redirectUri };
}

/**
 * Persist a freshly issued refresh token for an account, creating the
 * database row when the account only existed as environment variables.
 */
async function persistRefreshToken(statePayload, tokens, verifiedEmail) {
  const email = verifiedEmail || statePayload.email;

  if (statePayload.accountId) {
    await emailAccountService.updateAccount(statePayload.accountId, {
      refresh_token: tokens.refresh_token,
      redirect_uri: statePayload.redirectUri
    });
    return { accountId: statePayload.accountId, created: false, email: email };
  }

  // Env-only account: give it a database row so the token survives a deploy.
  const account = await credentials.resolveAccount(statePayload.accountKey || email);

  const created = await emailAccountService.createAccount({
    name: (account && account.displayName) || email,
    email: email,
    client_id: account && account.clientId,
    client_secret: account && account.clientSecret,
    refresh_token: tokens.refresh_token,
    redirect_uri: statePayload.redirectUri,
    display_name: (account && account.displayName) || email
  });

  return { accountId: created && created.id, created: true, email: email };
}

/**
 * Exchange an authorisation code for tokens and store the refresh token.
 * Returns a result object describing what happened; throws only on a
 * genuinely unexpected failure.
 */
async function completeAuthorization(code, state) {
  const statePayload = verifyState(state);

  if (!statePayload) {
    return {
      ok: false,
      reason: 'invalid_state',
      message: 'This authorisation link has expired or is not valid. Start the re-authorisation again.'
    };
  }

  const account = await credentials.resolveAccount(
    statePayload.accountId || statePayload.email
  );

  if (!account || !account.clientId || !account.clientSecret) {
    return {
      ok: false,
      reason: 'account_missing',
      message: 'The account being authorised no longer has OAuth credentials configured.'
    };
  }

  const oauth2Client = new google.auth.OAuth2(
    account.clientId,
    account.clientSecret,
    statePayload.redirectUri
  );

  const tokenResponse = await oauth2Client.getToken(code);
  const tokens = tokenResponse.tokens;

  if (!tokens || !tokens.refresh_token) {
    return {
      ok: false,
      reason: 'no_refresh_token',
      message:
        'Google did not return a refresh token. Remove this app at ' +
        'myaccount.google.com/permissions and try once more.'
    };
  }

  // Confirm which mailbox was actually authorised. Picking the wrong Google
  // account in the consent screen is easy, and silently storing that token
  // would send mail from the wrong address.
  let verifiedEmail = null;
  try {
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const info = await oauth2.userinfo.get();
    verifiedEmail = info.data.email || null;
  } catch (err) {
    console.warn('Could not read authorised mailbox identity:', err.message);
  }

  if (verifiedEmail && account.email &&
      verifiedEmail.toLowerCase() !== account.email.toLowerCase()) {
    return {
      ok: false,
      reason: 'wrong_account',
      message:
        'You signed in as ' + verifiedEmail + ', but this CRM account is ' + account.email +
        '. Nothing was saved. Start again and choose ' + account.email + '.'
    };
  }

  const saved = await persistRefreshToken(statePayload, tokens, verifiedEmail);

  // Make the new token visible to the pollers immediately.
  credentials.invalidateCache();

  return {
    ok: true,
    email: saved.email || account.email,
    accountId: saved.accountId,
    createdAccount: saved.created
  };
}

/* ------------------------------------------------------- Express handler */

// Titles and messages carry values from Google, the database, and error
// strings, so escape them before they reach the page.
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render the outcome of an authorisation attempt.
 *
 * The page runs inside a popup opened by the Email Accounts page, so it
 * reports back to the opener and closes itself. It also reads sensibly on
 * its own if the popup was blocked and the flow ran in the main window.
 */
function renderOutcome(res, ok, title, message) {
  // An unescaped "<" here could close the <script> block early.
  const payload = JSON.stringify({ source: 'gmail-reauth', ok: ok, message: String(message || '') })
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');

  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const colour = ok ? '#38a169' : '#e53e3e';
  const icon = ok ? '&#10004;' : '&#10007;';

  res.status(ok ? 200 : 400).send(`<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><title>${safeTitle}</title></head>
  <body style="font-family: system-ui, -apple-system, Arial, sans-serif; padding: 48px; text-align: center; color: #1a202c;">
    <div style="font-size: 44px; color: ${colour};">${icon}</div>
    <h1 style="font-size: 20px; margin: 12px 0;">${safeTitle}</h1>
    <p style="color: #4a5568; max-width: 460px; margin: 0 auto 28px;">${safeMessage}</p>
    <a href="/email-accounts" style="background:#3182ce;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block;">
      Back to Email Accounts
    </a>
    <script>
      (function () {
        var payload = ${payload};
        if (window.opener && !window.opener.closed) {
          try { window.opener.postMessage(payload, window.location.origin); } catch (e) {}
          setTimeout(function () { window.close(); }, payload.ok ? 900 : 4000);
        }
      })();
    </script>
  </body>
</html>`);
}

/**
 * Express handler for the OAuth callback.
 *
 * Mounted on the canonical path and on every legacy /api/gmail/oauth2callbackN
 * path, so whichever redirect URI is registered on a given Google client will
 * complete the same flow and store the token in the same place.
 */
async function handleCallback(req, res) {
  const { code, state, error: oauthError } = req.query;

  try {
    if (oauthError) {
      return renderOutcome(res, false, 'Authorisation cancelled',
        'Google returned: ' + String(oauthError));
    }

    if (!code || !state) {
      return renderOutcome(res, false, 'Invalid callback',
        'Google did not return an authorisation code.');
    }

    const result = await completeAuthorization(code, state);

    if (result.ok) {
      console.log('Refresh token stored for', result.email,
        result.createdAccount ? '(new account row created)' : '');

      return renderOutcome(res, true, 'Account re-authorised',
        result.email + ' is connected again. Polling picks up the new token automatically.');
    }

    return renderOutcome(res, false, 'Authorisation failed', result.message);
  } catch (error) {
    console.error('Error in OAuth callback:', error);
    return renderOutcome(res, false, 'Authorisation failed',
      String(error.message || 'Unexpected error'));
  }
}

module.exports = {
  buildAuthUrl,
  completeAuthorization,
  handleCallback,
  callbackUri,
  ACCEPTED_CALLBACK_PATHS,
  SCOPES
};
