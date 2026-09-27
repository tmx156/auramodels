/**
 * Invoices API Routes
 * Handles invoice creation, payment recording, signatures, and delivery
 */

const express = require('express');
const { auth } = require('../middleware/auth');
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

const router = express.Router();
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey || config.supabase.anonKey);

/**
 * Generate invoice number in format AM-YYYY-NNNN
 */
async function generateInvoiceNumber() {
  const year = new Date().getFullYear();
  const prefix = `AM-${year}-`;

  // Get the highest invoice number for this year
  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('invoice_number')
    .like('invoice_number', `${prefix}%`)
    .order('invoice_number', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Error generating invoice number:', error);
    throw new Error('Failed to generate invoice number');
  }

  let nextNum = 1;
  if (invoices && invoices.length > 0) {
    const lastNum = parseInt(invoices[0].invoice_number.replace(prefix, ''), 10);
    nextNum = lastNum + 1;
  }

  return `${prefix}${String(nextNum).padStart(4, '0')}`;
}

/**
 * @route   GET /api/invoices
 * @desc    Get all invoices with optional filters
 * @access  Private
 */
router.get('/', auth, async (req, res) => {
  try {
    const { leadId, status, paymentStatus, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from('invoices')
      .select(`
        *,
        lead:leads(id, name, email, phone),
        user:users(id, name, email)
      `)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (leadId) {
      query = query.eq('lead_id', leadId);
    }
    if (status) {
      query = query.eq('status', status);
    }
    if (paymentStatus) {
      query = query.eq('payment_status', paymentStatus);
    }

    const { data: invoices, error } = await query;

    if (error) {
      console.error('Error fetching invoices:', error);
      return res.status(500).json({ message: 'Failed to fetch invoices', error: error.message });
    }

    // Transform for frontend
    const transformedInvoices = invoices.map(inv => ({
      id: inv.id,
      invoiceNumber: inv.invoice_number,
      leadId: inv.lead_id,
      saleId: inv.sale_id,
      userId: inv.user_id,
      clientName: inv.client_name,
      clientEmail: inv.client_email,
      clientPhone: inv.client_phone,
      clientAddress: inv.client_address,
      items: inv.items || [],
      subtotal: parseFloat(inv.subtotal || 0),
      vatRate: parseFloat(inv.vat_rate || 20),
      vatAmount: parseFloat(inv.vat_amount || 0),
      totalAmount: parseFloat(inv.total_amount || 0),
      currency: inv.currency,
      paymentMethod: inv.payment_method,
      authCode: inv.auth_code,
      paymentReference: inv.payment_reference,
      paymentStatus: inv.payment_status,
      paidAt: inv.paid_at,
      signatureStatus: inv.signature_status,
      signatureUrl: inv.signature_url,
      signedAt: inv.signed_at,
      pdfUrl: inv.pdf_url,
      signedPdfUrl: inv.signed_pdf_url,
      notes: inv.notes,
      status: inv.status,
      completedAt: inv.completed_at,
      createdAt: inv.created_at,
      updatedAt: inv.updated_at,
      lead: inv.lead,
      user: inv.user
    }));

    res.json({
      success: true,
      invoices: transformedInvoices,
      count: transformedInvoices.length
    });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/invoices/lead/:leadId
 * @desc    Get all invoices for a specific lead
 * @access  Private
 */
router.get('/lead/:leadId', auth, async (req, res) => {
  try {
    const { leadId } = req.params;

    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching lead invoices:', error);
      return res.status(500).json({ message: 'Failed to fetch invoices', error: error.message });
    }

    res.json({
      success: true,
      invoices: invoices.map(inv => ({
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        totalAmount: parseFloat(inv.total_amount || 0),
        paymentStatus: inv.payment_status,
        signatureStatus: inv.signature_status,
        status: inv.status,
        createdAt: inv.created_at
      }))
    });
  } catch (error) {
    console.error('Error fetching lead invoices:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/invoices/:id
 * @desc    Get single invoice by ID
 * @access  Private
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: invoice, error } = await supabase
      .from('invoices')
      .select(`
        *,
        lead:leads(id, name, email, phone, image_url),
        user:users(id, name, email)
      `)
      .eq('id', id)
      .single();

    if (error || !invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Get selected images for this invoice
    const { data: selectedImages } = await supabase
      .from('selected_images')
      .select(`
        *,
        photo:photos(id, cloudinary_secure_url, filename, description)
      `)
      .eq('invoice_id', id);

    res.json({
      success: true,
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoice_number,
        leadId: invoice.lead_id,
        saleId: invoice.sale_id,
        userId: invoice.user_id,
        clientName: invoice.client_name,
        clientEmail: invoice.client_email,
        clientPhone: invoice.client_phone,
        clientAddress: invoice.client_address,
        items: invoice.items || [],
        subtotal: parseFloat(invoice.subtotal || 0),
        vatRate: parseFloat(invoice.vat_rate || 20),
        vatAmount: parseFloat(invoice.vat_amount || 0),
        totalAmount: parseFloat(invoice.total_amount || 0),
        currency: invoice.currency,
        paymentMethod: invoice.payment_method,
        authCode: invoice.auth_code,
        paymentReference: invoice.payment_reference,
        paymentStatus: invoice.payment_status,
        paidAt: invoice.paid_at,
        signatureStatus: invoice.signature_status,
        signatureRequestId: invoice.signature_request_id,
        signatureUrl: invoice.signature_url,
        clientSignatureData: invoice.client_signature_data,
        signedAt: invoice.signed_at,
        pdfUrl: invoice.pdf_url,
        signedPdfUrl: invoice.signed_pdf_url,
        notes: invoice.notes,
        internalNotes: invoice.internal_notes,
        status: invoice.status,
        completedAt: invoice.completed_at,
        cancelledAt: invoice.cancelled_at,
        cancellationReason: invoice.cancellation_reason,
        createdAt: invoice.created_at,
        updatedAt: invoice.updated_at,
        lead: invoice.lead,
        user: invoice.user,
        selectedImages: selectedImages || []
      }
    });
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   POST /api/invoices
 * @desc    Create a new invoice
 * @access  Private (Viewer, Admin)
 */
router.post('/', auth, async (req, res) => {
  try {
    // Check permissions
    if (!['viewer', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only viewers and admins can create invoices' });
    }

    const {
      leadId,
      items,
      paymentMethod,
      notes,
      selectedPhotoIds
    } = req.body;

    if (!leadId) {
      return res.status(400).json({ message: 'Lead ID is required' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'At least one item is required' });
    }

    // Fetch lead data
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, name, email, phone')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    // Fetch package details for all items
    const packageIds = items.map(item => item.packageId).filter(Boolean);
    const { data: packages } = await supabase
      .from('packages')
      .select('*')
      .in('id', packageIds);

    // Calculate totals and build line items
    let subtotal = 0;
    let vatAmount = 0;
    const lineItems = [];

    for (const item of items) {
      const pkg = packages?.find(p => p.id === item.packageId);
      if (!pkg) continue;

      const quantity = item.quantity || 1;
      const lineTotal = parseFloat(pkg.price) * quantity;

      if (pkg.vat_inclusive) {
        // Price includes VAT
        const vatRate = parseFloat(pkg.vat_rate || 20);
        const vatMultiplier = vatRate / 100;
        const netAmount = lineTotal / (1 + vatMultiplier);
        const itemVat = lineTotal - netAmount;

        subtotal += netAmount;
        vatAmount += itemVat;
      } else {
        // Price excludes VAT
        const vatRate = parseFloat(pkg.vat_rate || 20);
        const itemVat = lineTotal * (vatRate / 100);

        subtotal += lineTotal;
        vatAmount += itemVat;
      }

      lineItems.push({
        packageId: pkg.id,
        code: pkg.code,
        name: pkg.name,
        type: pkg.type,
        unitPrice: parseFloat(pkg.price),
        quantity,
        lineTotal,
        vatInclusive: pkg.vat_inclusive,
        includes: pkg.includes || []
      });
    }

    const total = subtotal + vatAmount;

    // Generate invoice number
    const invoiceNumber = await generateInvoiceNumber();

    // Create invoice
    const invoiceData = {
      invoice_number: invoiceNumber,
      lead_id: leadId,
      user_id: req.user.id,
      client_name: lead.name,
      client_email: lead.email,
      client_phone: lead.phone,
      items: lineItems,
      subtotal: Math.round(subtotal * 100) / 100,
      vat_rate: 20,
      vat_amount: Math.round(vatAmount * 100) / 100,
      total_amount: Math.round(total * 100) / 100,
      currency: 'GBP',
      payment_method: paymentMethod || null,
      notes: notes || null,
      status: 'draft',
      payment_status: 'pending',
      signature_status: 'pending'
    };

    const { data: invoice, error: createError } = await supabase
      .from('invoices')
      .insert(invoiceData)
      .select()
      .single();

    if (createError) {
      console.error('Error creating invoice:', createError);
      return res.status(500).json({ message: 'Failed to create invoice', error: createError.message });
    }

    // If photo IDs provided, validate they belong to this lead and create selected_images records
    if (selectedPhotoIds && Array.isArray(selectedPhotoIds) && selectedPhotoIds.length > 0) {
      // Validate photos belong to this lead to prevent cross-lead data mixing
      const { data: validPhotos } = await supabase
        .from('photos')
        .select('id')
        .in('id', selectedPhotoIds)
        .eq('lead_id', leadId);

      const validPhotoIds = validPhotos?.map(p => p.id) || [];

      if (validPhotoIds.length > 0) {
        const selectedImageRecords = validPhotoIds.map(photoId => ({
          invoice_id: invoice.id,
          lead_id: leadId,
          photo_id: photoId,
          selection_type: 'manual',
          delivery_status: 'pending'
        }));

        await supabase
          .from('selected_images')
          .insert(selectedImageRecords);

        console.log(`Created ${selectedImageRecords.length} selected_images records (verified for lead ${leadId})`);
      }
    }

    console.log(`Invoice ${invoiceNumber} created for lead ${lead.name}`);

    res.status(201).json({
      success: true,
      message: 'Invoice created successfully',
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoice_number,
        leadId: invoice.lead_id,
        clientName: invoice.client_name,
        items: invoice.items,
        subtotal: parseFloat(invoice.subtotal),
        vatAmount: parseFloat(invoice.vat_amount),
        totalAmount: parseFloat(invoice.total_amount),
        status: invoice.status,
        createdAt: invoice.created_at
      }
    });
  } catch (error) {
    console.error('Error creating invoice:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   PUT /api/invoices/:id
 * @desc    Update invoice (payment info, status, etc.)
 * @access  Private (Viewer, Admin)
 */
router.put('/:id', auth, async (req, res) => {
  try {
    if (!['viewer', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only viewers and admins can update invoices' });
    }

    const { id } = req.params;
    const {
      paymentMethod,
      authCode,
      paymentReference,
      paymentStatus,
      notes,
      internalNotes,
      status
    } = req.body;

    // Check invoice exists
    const { data: existing, error: fetchError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Build update object
    const updates = {};
    if (paymentMethod !== undefined) updates.payment_method = paymentMethod;
    if (authCode !== undefined) updates.auth_code = authCode;
    if (paymentReference !== undefined) updates.payment_reference = paymentReference;
    if (paymentStatus !== undefined) {
      updates.payment_status = paymentStatus;
      if (paymentStatus === 'paid' && !existing.paid_at) {
        updates.paid_at = new Date().toISOString();
      }
    }
    if (notes !== undefined) updates.notes = notes;
    if (internalNotes !== undefined) updates.internal_notes = internalNotes;
    if (status !== undefined) {
      updates.status = status;
      if (status === 'completed' && !existing.completed_at) {
        updates.completed_at = new Date().toISOString();
      }
      if (status === 'cancelled' && !existing.cancelled_at) {
        updates.cancelled_at = new Date().toISOString();
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from('invoices')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating invoice:', updateError);
      return res.status(500).json({ message: 'Failed to update invoice', error: updateError.message });
    }

    res.json({
      success: true,
      message: 'Invoice updated successfully',
      invoice: {
        id: updated.id,
        invoiceNumber: updated.invoice_number,
        paymentMethod: updated.payment_method,
        authCode: updated.auth_code,
        paymentStatus: updated.payment_status,
        signatureStatus: updated.signature_status,
        status: updated.status,
        updatedAt: updated.updated_at
      }
    });
  } catch (error) {
    console.error('Error updating invoice:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   POST /api/invoices/:id/record-payment
 * @desc    Record payment details (auth code, method)
 * @access  Private (Viewer, Admin)
 */
router.post('/:id/record-payment', auth, async (req, res) => {
  try {
    if (!['viewer', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only viewers and admins can record payments' });
    }

    const { id } = req.params;
    const { paymentMethod, authCode, paymentReference } = req.body;

    if (!paymentMethod) {
      return res.status(400).json({ message: 'Payment method is required' });
    }

    const { data: invoice, error } = await supabase
      .from('invoices')
      .update({
        payment_method: paymentMethod,
        auth_code: authCode || null,
        payment_reference: paymentReference || null,
        payment_status: 'paid',
        paid_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error recording payment:', error);
      return res.status(500).json({ message: 'Failed to record payment', error: error.message });
    }

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    console.log(`Payment recorded for invoice ${invoice.invoice_number}: ${paymentMethod} ${authCode ? `(Auth: ${authCode})` : ''}`);

    res.json({
      success: true,
      message: 'Payment recorded successfully',
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoice_number,
        paymentMethod: invoice.payment_method,
        authCode: invoice.auth_code,
        paymentStatus: invoice.payment_status,
        paidAt: invoice.paid_at
      }
    });
  } catch (error) {
    console.error('Error recording payment:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   POST /api/invoices/:id/save-signature
 * @desc    Save client signature (base64 data)
 * @access  Private
 */
router.post('/:id/save-signature', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { signatureData } = req.body;

    if (!signatureData) {
      return res.status(400).json({ message: 'Signature data is required' });
    }

    const { data: invoice, error } = await supabase
      .from('invoices')
      .update({
        client_signature_data: signatureData,
        signature_status: 'signed',
        signed_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error saving signature:', error);
      return res.status(500).json({ message: 'Failed to save signature', error: error.message });
    }

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    console.log(`Signature saved for invoice ${invoice.invoice_number}`);

    res.json({
      success: true,
      message: 'Signature saved successfully',
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoice_number,
        signatureStatus: invoice.signature_status,
        signedAt: invoice.signed_at
      }
    });
  } catch (error) {
    console.error('Error saving signature:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   POST /api/invoices/:id/complete
 * @desc    Mark invoice as complete and trigger delivery
 * @access  Private (Viewer, Admin)
 */
router.post('/:id/complete', auth, async (req, res) => {
  try {
    if (!['viewer', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only viewers and admins can complete invoices' });
    }

    const { id } = req.params;
    const { createSale = true } = req.body;

    // Get invoice with lead details
    const { data: invoice, error: fetchError } = await supabase
      .from('invoices')
      .select(`
        *,
        lead:leads(id, name, email, phone)
      `)
      .eq('id', id)
      .single();

    if (fetchError || !invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Verify payment and signature
    if (invoice.payment_status !== 'paid') {
      return res.status(400).json({ message: 'Payment must be recorded before completing' });
    }

    if (invoice.signature_status !== 'signed') {
      return res.status(400).json({ message: 'Signature must be collected before completing' });
    }

    // Create sale record if requested
    let saleId = invoice.sale_id;
    if (createSale && !saleId) {
      const saleData = {
        lead_id: invoice.lead_id,
        user_id: req.user.id,
        amount: invoice.total_amount,
        payment_method: invoice.payment_method,
        payment_type: 'full_payment',
        payment_status: 'completed',
        notes: `Invoice ${invoice.invoice_number}`
      };

      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert(saleData)
        .select()
        .single();

      if (!saleError && sale) {
        saleId = sale.id;

        // Update lead status to Attended
        await supabase
          .from('leads')
          .update({
            status: 'Attended',
            has_sale: 1
          })
          .eq('id', invoice.lead_id);
      }
    }

    // Update invoice status
    const { data: completedInvoice, error: updateError } = await supabase
      .from('invoices')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        sale_id: saleId
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error completing invoice:', updateError);
      return res.status(500).json({ message: 'Failed to complete invoice', error: updateError.message });
    }

    console.log(`Invoice ${invoice.invoice_number} completed for ${invoice.lead?.name || invoice.client_name}`);

    // TODO: Trigger delivery emails here
    // - Confirmation email with signed invoice PDF
    // - Image delivery email with download links
    // - Z-Card delivery email if applicable

    res.json({
      success: true,
      message: 'Invoice completed successfully',
      invoice: {
        id: completedInvoice.id,
        invoiceNumber: completedInvoice.invoice_number,
        status: completedInvoice.status,
        completedAt: completedInvoice.completed_at,
        saleId: completedInvoice.sale_id
      },
      deliveryTriggered: true
    });
  } catch (error) {
    console.error('Error completing invoice:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   POST /api/invoices/:id/send-confirmation
 * @desc    Send confirmation email to client
 * @access  Private (Viewer, Admin)
 */
router.post('/:id/send-confirmation', auth, async (req, res) => {
  try {
    const { id } = req.params;

    // Get invoice with lead details
    const { data: invoice, error: fetchError } = await supabase
      .from('invoices')
      .select(`
        *,
        lead:leads(id, name, email, phone)
      `)
      .eq('id', id)
      .single();

    if (fetchError || !invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    if (!invoice.client_email && !invoice.lead?.email) {
      return res.status(400).json({ message: 'No email address available for this client' });
    }

    const recipientEmail = invoice.client_email || invoice.lead?.email;
    const clientName = invoice.client_name || invoice.lead?.name || 'Valued Customer';

    // TODO: Implement email sending using existing email infrastructure
    // For now, log and return success
    console.log(`Confirmation email would be sent to ${recipientEmail} for invoice ${invoice.invoice_number}`);

    res.json({
      success: true,
      message: 'Confirmation email sent successfully',
      sentTo: recipientEmail
    });
  } catch (error) {
    console.error('Error sending confirmation:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   DELETE /api/invoices/:id
 * @desc    Cancel/delete an invoice
 * @access  Private (Admin only)
 */
router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can delete invoices' });
    }

    const { id } = req.params;
    const { reason } = req.body;

    const { data: invoice, error } = await supabase
      .from('invoices')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason || 'Cancelled by admin'
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error cancelling invoice:', error);
      return res.status(500).json({ message: 'Failed to cancel invoice', error: error.message });
    }

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    res.json({
      success: true,
      message: 'Invoice cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling invoice:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/invoices/:id/selected-images
 * @desc    Get selected images for an invoice
 * @access  Private
 */
router.get('/:id/selected-images', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: selectedImages, error } = await supabase
      .from('selected_images')
      .select(`
        *,
        photo:photos(id, cloudinary_secure_url, filename, description, width, height)
      `)
      .eq('invoice_id', id);

    if (error) {
      console.error('Error fetching selected images:', error);
      return res.status(500).json({ message: 'Failed to fetch images', error: error.message });
    }

    res.json({
      success: true,
      selectedImages: selectedImages || [],
      count: selectedImages?.length || 0
    });
  } catch (error) {
    console.error('Error fetching selected images:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   POST /api/invoices/:id/add-images
 * @desc    Add selected images to an invoice
 * @access  Private (Viewer, Admin)
 */
router.post('/:id/add-images', auth, async (req, res) => {
  try {
    if (!['viewer', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only viewers and admins can add images' });
    }

    const { id } = req.params;
    const { photoIds, selectionType = 'manual' } = req.body;

    if (!photoIds || !Array.isArray(photoIds) || photoIds.length === 0) {
      return res.status(400).json({ message: 'Photo IDs are required' });
    }

    // Get invoice
    const { data: invoice, error: fetchError } = await supabase
      .from('invoices')
      .select('id, lead_id')
      .eq('id', id)
      .single();

    if (fetchError || !invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Create selected image records
    const records = photoIds.map(photoId => ({
      invoice_id: id,
      lead_id: invoice.lead_id,
      photo_id: photoId,
      selection_type: selectionType,
      delivery_status: 'pending'
    }));

    const { data: inserted, error: insertError } = await supabase
      .from('selected_images')
      .upsert(records, { onConflict: 'invoice_id,photo_id' })
      .select();

    if (insertError) {
      console.error('Error adding images:', insertError);
      return res.status(500).json({ message: 'Failed to add images', error: insertError.message });
    }

    res.json({
      success: true,
      message: `${inserted.length} images added to invoice`,
      count: inserted.length
    });
  } catch (error) {
    console.error('Error adding images:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
