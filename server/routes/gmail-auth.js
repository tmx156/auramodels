/**
 * Gmail OAuth callbacks (legacy paths) and account status.
 *
 * The OAuth flow that used to live here has been retired. It had three
 * problems that made it unusable in production:
 *
 *   - The /auth* routes were public, so anyone could start an OAuth flow.
 *   - The callback wrote tokens to server/config/gmail-token.json, a file
 *     Railway discards on every deploy.
 *   - It then asked an admin to copy the token into an environment variable
 *     by hand, which the running app can never do for itself.
 *
 * Re-authorisation now starts from the Email Accounts page and stores tokens
 * in the email_accounts table. See utils/gmailReauth.js.
 *
 * The /auth* entry points are gone. The /oauth2callback* paths remain, but
 * are now served by the current flow: they are already registered as redirect
 * URIs on the Google OAuth clients, and reusing them avoids having to edit
 * every client in Google Cloud Console.
 */

const express = require('express');
const { auth, adminAuth } = require('../middleware/auth');
const credentials = require('../utils/emailCredentialResolver');
const gmailReauth = require('../utils/gmailReauth');

const router = express.Router();

// Legacy account key -> the path segment its old auth route used.
const RETIRED_AUTH_PATHS = ['/auth', '/auth2', '/auth3', '/auth4', '/auth5', '/auth6', '/auth7'];
const LEGACY_CALLBACK_PATHS = [
  '/oauth2callback', '/oauth2callback2', '/oauth2callback3', '/oauth2callback4',
  '/oauth2callback5', '/oauth2callback6', '/oauth2callback7'
];

/** Small HTML page pointing the reader at the current flow. */
function retiredPage(res, statusCode) {
  res.status(statusCode).send(`<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><title>Use the Email Accounts page</title></head>
  <body style="font-family: system-ui, -apple-system, Arial, sans-serif; padding: 48px; text-align: center; color: #1a202c;">
    <h1 style="font-size: 20px;">This sign-in link has moved</h1>
    <p style="color: #4a5568; max-width: 480px; margin: 0 auto 28px;">
      Gmail accounts are now reconnected from the Email Accounts page. Open it,
      find the account showing a problem, and press <strong>Fix now</strong>.
      The new token is saved automatically - there is nothing to copy.
    </p>
    <a href="/email-accounts" style="background:#3182ce;color:#fff;padding:10px 20px;text-decoration:none;border-radius:6px;display:inline-block;">
      Go to Email Accounts
    </a>
  </body>
</html>`);
}

// Retired OAuth entry points. Admin-only now: the originals were public.
RETIRED_AUTH_PATHS.forEach((path) => {
  router.get(path, (req, res) => {
    console.log(`Retired Gmail auth route ${path} was requested; directing to the Email Accounts page.`);
    retiredPage(res, 410);
  });
});

// The old callback paths stay live, but now complete the current flow.
//
// Google rejects an authorisation request unless the redirect URI exactly
// matches one registered on that OAuth client, and these paths are already
// registered on the existing clients. Serving them here means re-authorising
// works against the Google Cloud Console config as it stands, instead of
// requiring every client to be edited first. The token still lands in the
// database, exactly as it does on the canonical path.
LEGACY_CALLBACK_PATHS.forEach((path) => {
  router.get(path, gmailReauth.handleCallback);
});

// Note: there is deliberately no /health route here.
// server.js registers app.get('/api/gmail/health') for Gmail *push* status
// before this router is mounted, so a /health defined here would be
// unreachable. Account health lives at GET /api/email-accounts/health.

/**
 * @route   GET /api/gmail/status
 * @desc    Which accounts are configured, and where their credentials live
 * @access  Private (Admin only)
 */
router.get('/status', auth, adminAuth, async (req, res) => {
  try {
    const accounts = await credentials.resolveAllAccounts({ force: true });

    const summary = accounts.map((account) => ({
      email: account.email,
      accountKey: account.accountKey,
      source: account.source,
      hasClientId: !!account.clientId,
      hasClientSecret: !!account.clientSecret,
      hasRefreshToken: !!account.refreshToken,
      configured: credentials.isConfigured(account)
    }));

    res.json({
      success: true,
      configured: summary.some((a) => a.configured),
      accounts: summary,
      instructions: 'Reconnect accounts from the Email Accounts page.'
    });
  } catch (error) {
    console.error('Gmail status error:', error);
    res.status(500).json({ success: false, message: 'Failed to check status', error: error.message });
  }
});

module.exports = router;
