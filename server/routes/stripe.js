/**
 * Stripe Routes
 *
 * Handles Stripe payment integration for booking deposits and card holds
 * Uses SetupIntent for saving cards without immediate charge
 */

const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const { auth } = require('../middleware/auth');

/**
 * @route   POST /api/stripe/create-setup-intent
 * @desc    Create a SetupIntent for saving card details (no charge)
 * @access  Public (for booking page)
 */
router.post('/create-setup-intent', async (req, res) => {
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const { leadId, email, name } = req.body;

    if (!leadId) {
      return res.status(400).json({
        success: false,
        message: 'Lead ID is required'
      });
    }

    // Create or retrieve customer
    let customer;

    if (email) {
      // Check if customer already exists
      const existingCustomers = await stripe.customers.list({
        email: email,
        limit: 1
      });

      if (existingCustomers.data.length > 0) {
        customer = existingCustomers.data[0];
        // Update name if provided
        if (name && customer.name !== name) {
          customer = await stripe.customers.update(customer.id, { name });
        }
      } else {
        // Create new customer
        customer = await stripe.customers.create({
          email: email,
          name: name || undefined,
          metadata: {
            crm_lead_id: leadId,
            source: 'public_booking'
          }
        });
      }
    } else {
      // Create anonymous customer with just the lead ID
      customer = await stripe.customers.create({
        metadata: {
          crm_lead_id: leadId,
          source: 'public_booking'
        }
      });
    }

    // Create SetupIntent (for saving card without charging)
    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      payment_method_types: ['card'],
      metadata: {
        crm_lead_id: leadId,
        purpose: 'booking_hold',
        no_show_fee: '5000' // £50.00 in pence
      }
    });

    console.log(`💳 SetupIntent created for lead ${leadId}: ${setupIntent.id}`);

    res.json({
      success: true,
      clientSecret: setupIntent.client_secret,
      customerId: customer.id
    });
  } catch (error) {
    console.error('Error creating SetupIntent:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize payment',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/stripe/confirm-setup
 * @desc    Confirm card was saved successfully and store payment method
 * @access  Public
 */
router.post('/confirm-setup', async (req, res) => {
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const { setupIntentId, leadId } = req.body;

    if (!setupIntentId || !leadId) {
      return res.status(400).json({
        success: false,
        message: 'SetupIntent ID and Lead ID are required'
      });
    }

    // Retrieve the SetupIntent to get the payment method
    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);

    if (setupIntent.status !== 'succeeded') {
      return res.status(400).json({
        success: false,
        message: 'Card setup has not been completed'
      });
    }

    // Get payment method details
    const paymentMethod = await stripe.paymentMethods.retrieve(
      setupIntent.payment_method
    );

    console.log(`✅ Card saved for lead ${leadId}: ${paymentMethod.card.brand} ****${paymentMethod.card.last4}`);

    res.json({
      success: true,
      paymentMethodId: setupIntent.payment_method,
      customerId: setupIntent.customer,
      card: {
        brand: paymentMethod.card.brand,
        last4: paymentMethod.card.last4,
        expMonth: paymentMethod.card.exp_month,
        expYear: paymentMethod.card.exp_year
      }
    });
  } catch (error) {
    console.error('Error confirming setup:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm card setup',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/stripe/charge-no-show
 * @desc    Charge the £50 no-show fee using saved payment method
 * @access  Private (admin only - for internal use)
 */
router.post('/charge-no-show', auth, async (req, res) => {
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const { customerId, paymentMethodId, leadId, leadName } = req.body;

    if (!customerId || !paymentMethodId) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID and Payment Method ID are required'
      });
    }

    // Create a PaymentIntent to charge the no-show fee
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 5000, // £50.00 in pence
      currency: 'gbp',
      customer: customerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      description: `No-show fee for booking - ${leadName || leadId}`,
      metadata: {
        crm_lead_id: leadId,
        type: 'no_show_fee'
      }
    });

    console.log(`💰 No-show fee charged for lead ${leadId}: £50.00`);

    res.json({
      success: true,
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount / 100
    });
  } catch (error) {
    console.error('Error charging no-show fee:', error);

    // Handle specific Stripe errors
    if (error.code === 'card_declined') {
      return res.status(400).json({
        success: false,
        message: 'Card was declined',
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to charge no-show fee',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/stripe/config
 * @desc    Get Stripe publishable key for frontend
 * @access  Public
 */
router.get('/config', (req, res) => {
  res.json({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
  });
});

module.exports = router;
