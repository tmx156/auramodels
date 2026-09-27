const express = require('express');
const router = express.Router();
const gmailPushService = require('../services/gmailPushService');

/**
 * Gmail Push Notification Webhook Routes
 * Receives notifications from Google Cloud Pub/Sub when Gmail changes occur
 *
 * Security: Token-based verification via URL query parameter
 * Performance: Immediately responds 200 OK, then processes asynchronously
 */

/**
 * @route   POST /api/gmail/webhook/primary
 * @desc    Webhook endpoint for primary Gmail account (hello@example.com)
 * @access  Public (secured by token)
 */
router.post('/primary', async (req, res) => {
  try {
    // CRITICAL: Immediately acknowledge to prevent Pub/Sub retry
    // Google requires response within 60 seconds
    res.status(200).send('OK');

    // Verify webhook secret token
    const token = req.query.token;
    if (!gmailPushService.validateWebhookToken(token)) {
      console.error('❌ [primary] Invalid webhook token - rejecting notification');
      return;
    }

    console.log('🔔 [primary] Webhook received - processing asynchronously...');

    // Process notification asynchronously (don't block response)
    setImmediate(async () => {
      try {
        const result = await gmailPushService.processGmailNotification('primary', req.body);

        if (result.success) {
          console.log(`✅ [primary] Webhook processed: ${result.messagesProcessed} messages`);
        } else {
          console.error(`❌ [primary] Webhook processing failed:`, result.error);
        }

      } catch (error) {
        console.error('❌ [primary] Async processing error:', error.message);
      }
    });

  } catch (error) {
    // Log but don't fail - we already sent 200 OK
    console.error('❌ [primary] Webhook error:', error.message);
  }
});

/**
 * @route   POST /api/gmail/webhook/secondary
 * @desc    Webhook endpoint for secondary Gmail account (diary@example.com)
 * @access  Public (secured by token)
 */
router.post('/secondary', async (req, res) => {
  try {
    // CRITICAL: Immediately acknowledge to prevent Pub/Sub retry
    res.status(200).send('OK');

    // Verify webhook secret token
    const token = req.query.token;
    if (!gmailPushService.validateWebhookToken(token)) {
      console.error('❌ [secondary] Invalid webhook token - rejecting notification');
      return;
    }

    console.log('🔔 [secondary] Webhook received - processing asynchronously...');

    // Process notification asynchronously (don't block response)
    setImmediate(async () => {
      try {
        const result = await gmailPushService.processGmailNotification('secondary', req.body);

        if (result.success) {
          console.log(`✅ [secondary] Webhook processed: ${result.messagesProcessed} messages`);
        } else {
          console.error(`❌ [secondary] Webhook processing failed:`, result.error);
        }

      } catch (error) {
        console.error('❌ [secondary] Async processing error:', error.message);
      }
    });

  } catch (error) {
    // Log but don't fail - we already sent 200 OK
    console.error('❌ [secondary] Webhook error:', error.message);
  }
});

/**
 * @route   GET /api/gmail/webhook/test
 * @desc    Test webhook endpoint (for development/debugging)
 * @access  Public (secured by token)
 */
router.get('/test', async (req, res) => {
  try {
    const token = req.query.token;

    if (!gmailPushService.validateWebhookToken(token)) {
      return res.status(403).json({
        success: false,
        message: 'Invalid webhook token'
      });
    }

    res.json({
      success: true,
      message: 'Gmail webhook is configured correctly',
      timestamp: new Date().toISOString(),
      endpoints: {
        primary: '/api/gmail/webhook/primary?token=YOUR_SECRET',
        secondary: '/api/gmail/webhook/secondary?token=YOUR_SECRET'
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Webhook test failed',
      error: error.message
    });
  }
});

module.exports = router;
