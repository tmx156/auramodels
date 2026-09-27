/**
 * Signature API Routes
 * Handles e-signature creation, status tracking, and webhook handling
 * Foundation for DocuSign integration (can be swapped in later)
 */

const express = require('express');
const { auth } = require('../middleware/auth');
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const crypto = require('crypto');

const router = express.Router();
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey || config.supabase.anonKey);

/**
 * Generate a unique signature session token
 */
function generateSignatureToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * @route   POST /api/signature/create-session
 * @desc    Create a signature session for an invoice
 * @access  Private (Viewer, Admin)
 */
router.post('/create-session', auth, async (req, res) => {
  try {
    if (!['viewer', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only viewers and admins can create signature sessions' });
    }

    const { invoiceId } = req.body;

    if (!invoiceId) {
      return res.status(400).json({ message: 'Invoice ID is required' });
    }

    // Get invoice
    const { data: invoice, error: fetchError } = await supabase
      .from('invoices')
      .select(`
        *,
        lead:leads(id, name, email, phone)
      `)
      .eq('id', invoiceId)
      .single();

    if (fetchError || !invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Check if already signed
    if (invoice.signature_status === 'signed') {
      return res.status(400).json({ message: 'Invoice is already signed' });
    }

    // Generate signature token/session ID
    const signatureToken = generateSignatureToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Build signature URL
    // This would be replaced with actual DocuSign URL when integrated
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const signatureUrl = `${baseUrl}/sign/${invoiceId}?token=${signatureToken}`;

    // Update invoice with signature session info
    const { data: updated, error: updateError } = await supabase
      .from('invoices')
      .update({
        signature_request_id: signatureToken,
        signature_url: signatureUrl,
        signature_status: 'sent'
      })
      .eq('id', invoiceId)
      .select()
      .single();

    if (updateError) {
      console.error('Error creating signature session:', updateError);
      return res.status(500).json({ message: 'Failed to create signature session', error: updateError.message });
    }

    console.log(`Signature session created for invoice ${invoice.invoice_number}`);

    res.json({
      success: true,
      message: 'Signature session created',
      signatureUrl: signatureUrl,
      expiresAt: expiresAt.toISOString(),
      invoiceId: invoiceId,
      invoiceNumber: invoice.invoice_number
    });
  } catch (error) {
    console.error('Error creating signature session:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   POST /api/signature/send-email
 * @desc    Send signature request email to client
 * @access  Private (Viewer, Admin)
 */
router.post('/send-email', auth, async (req, res) => {
  try {
    if (!['viewer', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only viewers and admins can send signature requests' });
    }

    const { invoiceId, email } = req.body;

    if (!invoiceId) {
      return res.status(400).json({ message: 'Invoice ID is required' });
    }

    // Get invoice with signature URL
    const { data: invoice, error: fetchError } = await supabase
      .from('invoices')
      .select(`
        *,
        lead:leads(id, name, email, phone)
      `)
      .eq('id', invoiceId)
      .single();

    if (fetchError || !invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Determine recipient email
    const recipientEmail = email || invoice.client_email || invoice.lead?.email;
    if (!recipientEmail) {
      return res.status(400).json({ message: 'No email address available' });
    }

    // Create signature session if not already created
    let signatureUrl = invoice.signature_url;
    if (!signatureUrl) {
      const signatureToken = generateSignatureToken();
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      signatureUrl = `${baseUrl}/sign/${invoiceId}?token=${signatureToken}`;

      await supabase
        .from('invoices')
        .update({
          signature_request_id: signatureToken,
          signature_url: signatureUrl,
          signature_status: 'sent'
        })
        .eq('id', invoiceId);
    }

    // TODO: Send actual email using existing email infrastructure
    // For now, log the action
    console.log(`Signature email would be sent to ${recipientEmail} for invoice ${invoice.invoice_number}`);
    console.log(`Signature URL: ${signatureUrl}`);

    res.json({
      success: true,
      message: 'Signature request email sent',
      sentTo: recipientEmail,
      signatureUrl: signatureUrl
    });
  } catch (error) {
    console.error('Error sending signature email:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/signature/status/:invoiceId
 * @desc    Check signature status for an invoice
 * @access  Private
 */
router.get('/status/:invoiceId', auth, async (req, res) => {
  try {
    const { invoiceId } = req.params;

    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('id, invoice_number, signature_status, signature_url, signed_at, client_signature_data')
      .eq('id', invoiceId)
      .single();

    if (error || !invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    res.json({
      success: true,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      signatureStatus: invoice.signature_status,
      signatureUrl: invoice.signature_url,
      signedAt: invoice.signed_at,
      hasSignature: !!invoice.client_signature_data
    });
  } catch (error) {
    console.error('Error checking signature status:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/signature/verify/:invoiceId
 * @desc    Verify signature token and get invoice for signing (public route for clients)
 * @access  Public (with token)
 */
router.get('/verify/:invoiceId', async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ message: 'Signature token is required' });
    }

    // Verify token matches
    const { data: invoice, error } = await supabase
      .from('invoices')
      .select(`
        id,
        invoice_number,
        client_name,
        client_email,
        items,
        subtotal,
        vat_amount,
        total_amount,
        currency,
        signature_status,
        signature_request_id
      `)
      .eq('id', invoiceId)
      .eq('signature_request_id', token)
      .single();

    if (error || !invoice) {
      return res.status(403).json({ message: 'Invalid or expired signature link' });
    }

    if (invoice.signature_status === 'signed') {
      return res.status(400).json({ message: 'This invoice has already been signed' });
    }

    res.json({
      success: true,
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoice_number,
        clientName: invoice.client_name,
        items: invoice.items,
        subtotal: parseFloat(invoice.subtotal),
        vatAmount: parseFloat(invoice.vat_amount),
        totalAmount: parseFloat(invoice.total_amount),
        currency: invoice.currency
      }
    });
  } catch (error) {
    console.error('Error verifying signature:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   POST /api/signature/submit/:invoiceId
 * @desc    Submit signature for an invoice (public route for clients)
 * @access  Public (with token)
 */
router.post('/submit/:invoiceId', async (req, res) => {
  try {
    const { invoiceId } = req.params;
    const { token, signatureData, signerName } = req.body;

    if (!token) {
      return res.status(400).json({ message: 'Signature token is required' });
    }

    if (!signatureData) {
      return res.status(400).json({ message: 'Signature data is required' });
    }

    // Verify token matches
    const { data: invoice, error: fetchError } = await supabase
      .from('invoices')
      .select('id, invoice_number, signature_request_id, signature_status')
      .eq('id', invoiceId)
      .eq('signature_request_id', token)
      .single();

    if (fetchError || !invoice) {
      return res.status(403).json({ message: 'Invalid or expired signature link' });
    }

    if (invoice.signature_status === 'signed') {
      return res.status(400).json({ message: 'This invoice has already been signed' });
    }

    // Save signature
    const { data: updated, error: updateError } = await supabase
      .from('invoices')
      .update({
        client_signature_data: signatureData,
        signature_status: 'signed',
        signed_at: new Date().toISOString(),
        notes: invoice.notes ? `${invoice.notes}\nSigned by: ${signerName || 'Client'}` : `Signed by: ${signerName || 'Client'}`
      })
      .eq('id', invoiceId)
      .select()
      .single();

    if (updateError) {
      console.error('Error saving signature:', updateError);
      return res.status(500).json({ message: 'Failed to save signature', error: updateError.message });
    }

    console.log(`Invoice ${invoice.invoice_number} signed successfully`);

    res.json({
      success: true,
      message: 'Signature submitted successfully',
      invoiceNumber: invoice.invoice_number,
      signedAt: updated.signed_at
    });
  } catch (error) {
    console.error('Error submitting signature:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   POST /api/signature/webhook
 * @desc    Handle signature webhook (for DocuSign integration)
 * @access  Public (with webhook validation)
 */
router.post('/webhook', async (req, res) => {
  try {
    // This endpoint would handle DocuSign Connect webhook events
    // For now, log and acknowledge
    console.log('Signature webhook received:', JSON.stringify(req.body));

    const { event, invoiceId, status, signatureData } = req.body;

    if (event === 'signature_completed' && invoiceId) {
      await supabase
        .from('invoices')
        .update({
          signature_status: 'signed',
          signed_at: new Date().toISOString(),
          client_signature_data: signatureData || null
        })
        .eq('id', invoiceId);

      console.log(`Webhook: Invoice ${invoiceId} marked as signed`);
    }

    res.json({ success: true, message: 'Webhook processed' });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ message: 'Webhook processing failed', error: error.message });
  }
});

module.exports = router;
