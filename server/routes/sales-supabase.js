const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const dbManager = require('../database-connection-manager');
const MessagingService = require('../utils/messagingService');
const emailAccountService = require('../utils/emailAccountService');
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

// ---------------------------------------------------------------------------
// Resolve a named Period (or a custom start/end) into concrete start/end Date
// boundaries. Shared by the sales list and stats endpoints so the same Period
// selection always produces an identical window. Uses UK calendar days
// (Europe/London) and Monday-start weeks.
// ---------------------------------------------------------------------------
function resolveDateRange(dateRange, query = {}) {
  let startDate, endDate;
  if (!dateRange) return { startDate, endDate };

  // Current UK (Europe/London) calendar-date components, read via Intl so we
  // never round-trip through an unparseable locale string (en-GB is DD/MM/YYYY).
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const y = get('year');
  const m = get('month') - 1; // 0-indexed month
  const d = get('day');
  const startOfDay = (yy, mm, dd) => new Date(yy, mm, dd, 0, 0, 0, 0);
  const endOfDay = (yy, mm, dd) => new Date(yy, mm, dd, 23, 59, 59, 999);

  // Day-of-week for that UK date, converted to a Monday-start index (Mon=0 … Sun=6)
  const dow = new Date(Date.UTC(y, m, d)).getUTCDay(); // 0=Sun … 6=Sat
  const mondayIndex = (dow + 6) % 7;

  switch (dateRange) {
    case 'today':
      startDate = startOfDay(y, m, d);
      endDate = endOfDay(y, m, d);
      break;
    case 'this_week':
      startDate = startOfDay(y, m, d - mondayIndex);
      endDate = endOfDay(y, m, d - mondayIndex + 6);
      break;
    case 'last_week':
      startDate = startOfDay(y, m, d - mondayIndex - 7);
      endDate = endOfDay(y, m, d - mondayIndex - 1);
      break;
    case 'this_month':
      startDate = startOfDay(y, m, 1);
      endDate = endOfDay(y, m + 1, 0);
      break;
    case 'last_month':
      startDate = startOfDay(y, m - 1, 1);
      endDate = endOfDay(y, m, 0);
      break;
    case 'this_quarter': {
      const qs = Math.floor(m / 3) * 3;
      startDate = startOfDay(y, qs, 1);
      endDate = endOfDay(y, qs + 3, 0);
      break;
    }
    case 'this_year':
      startDate = startOfDay(y, 0, 1);
      endDate = endOfDay(y, 11, 31);
      break;
    case 'custom': {
      // Custom dates arrive either as a plain YYYY-MM-DD (Sales page picker —
      // treated as a whole UK calendar day) or as a full ISO timestamp
      // (Reports page, already has explicit start/end of day) — use as-is.
      const toStart = (s) => {
        if (s.includes('T')) return new Date(s);
        const [yy, mm, dd] = s.split('-').map(Number);
        return startOfDay(yy, mm - 1, dd);
      };
      const toEnd = (s) => {
        if (s.includes('T')) return new Date(s);
        const [yy, mm, dd] = s.split('-').map(Number);
        return endOfDay(yy, mm - 1, dd);
      };
      if (query.startDate) startDate = toStart(query.startDate);
      if (query.endDate) endDate = toEnd(query.endDate);
      break;
    }
    default:
      break;
  }
  return { startDate, endDate };
}

// Function to send sale receipt via email and SMS
const sendSaleReceipt = async (sale, lead, customEmail, customPhone, sendEmail = true, sendSMS = true) => {
  try {
    // Get receipt template
    const templates = await dbManager.query('templates', {
      select: '*',
      eq: { type: 'sale_receipt', is_active: true }
    });

    if (!templates || templates.length === 0) {
      console.warn('No receipt template found, skipping receipt');
      return;
    }

    const template = templates[0];

    // Generate receipt ID
    const receiptId = sale.id.toString().slice(-6).toUpperCase();

    // Create processed template with sale variables
    const processedTemplate = {
      subject: 'Your Auralndn Receipt',
      content: `Dear {leadName},\n\nThank you for your purchase with Auralndn!\n\nRECEIPT DETAILS\n===============\nReceipt ID: {receiptId}\nDate: {saleDate}\n\nPURCHASE INFORMATION\n===================\nAmount: {saleAmountFormatted}\nPayment Method: {paymentMethod}\nPayment Type: {paymentType}\nStatus: Completed\n\nCUSTOMER INFORMATION\n===================\nName: {leadName}\nEmail: {leadEmail}\n\n{saleNotes}\n\nThank you for choosing Auralndn. We appreciate your business!\n\nIf you have any questions about this purchase, please don't hesitate to contact us.\n\nBest regards,\nThe Auralndn Team\n\n---\nThis is an automated receipt. Please keep this for your records.`
        .replace(/{leadName}/g, lead.name || 'Customer')
        .replace(/{leadEmail}/g, lead.email || '')
        .replace(/{receiptId}/g, receiptId)
        .replace(/{saleDate}/g, new Date(sale.created_at).toLocaleDateString())
        .replace(/{saleAmountFormatted}/g, `£${sale.amount.toFixed(2)}`)
        .replace(/{paymentMethod}/g, sale.payment_method || 'Unknown')
        .replace(/{paymentType}/g, sale.payment_type || 'full_payment')
        .replace(/{saleNotes}/g, sale.notes ? `\n\nNotes: ${sale.notes}` : ''),
    };

    // Send email receipt if enabled
    if (sendEmail && (customEmail || lead.email)) {
      const emailMessageData = {
        id: `email-receipt-${sale.id}-${Date.now()}`,
        lead_id: lead.id,
        template_id: template.id,
        type: 'email',
        subject: processedTemplate.subject,
        content: processedTemplate.content,
        email_body: processedTemplate.content,
        recipient_email: customEmail || lead.email,
        recipient_phone: customPhone || lead.phone,
        sent_by: 'system',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const emailResult = await dbManager.insert('messages', emailMessageData);
      if (emailResult && emailResult.length > 0) {
        // Resolve email account: template > default (no user for system sends)
        let resolvedEmailAccount = 'primary';
        try {
          const resolution = await emailAccountService.resolveEmailAccount({
            templateId: template.id
          });
          if (resolution.type === 'database' && resolution.account) {
            resolvedEmailAccount = resolution.account;
            console.log(`📧 Receipt using: ${resolution.account.email} (database)`);
          } else {
            resolvedEmailAccount = resolution.accountKey || template.email_account || 'primary';
          }
        } catch (resolveErr) {
          console.error('📧 Error resolving email account:', resolveErr.message);
        }

        await MessagingService.sendEmail(emailResult[0], resolvedEmailAccount);
        console.log(`📧 Receipt email sent for sale ${sale.id} to ${emailMessageData.recipient_email}`);
      }
    }

    // Send SMS receipt if enabled
    if (sendSMS && (customPhone || lead.phone)) {
      // Create shorter SMS version of the receipt
      const smsContent = `Receipt ${receiptId}: Thank you for your purchase of £${sale.amount.toFixed(2)} on ${new Date(sale.created_at).toLocaleDateString()}. Payment: ${sale.payment_method}. - Focus Models`;

      const smsMessageData = {
        id: `sms-receipt-${sale.id}-${Date.now()}`,
        lead_id: lead.id,
        template_id: template.id,
        type: 'sms',
        subject: `Receipt ${receiptId}`,
        content: smsContent,
        sms_body: smsContent,
        recipient_email: customEmail || lead.email,
        recipient_phone: customPhone || lead.phone,
        sent_by: 'system',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const smsResult = await dbManager.insert('messages', smsMessageData);
      if (smsResult && smsResult.length > 0) {
        await MessagingService.sendSMS(smsResult[0]);
        console.log(`📨 Receipt SMS sent for sale ${sale.id} to ${smsMessageData.recipient_phone}`);
      }
    }

  } catch (error) {
    console.error('Error sending receipt:', error);
    throw error;
  }
};

// Create a new sale
router.post('/', auth, async (req, res) => {
  try {
    const {
      leadId,
      saleAmount,
      paymentMethod,
      paymentType,
      notes,
      sendReceipt,
      customEmail,
      customPhone,
      // Finance-specific fields
      financeTotal,
      depositAmount,
      monthlyPayment,
      termMonths,
      interestRate,
      startDate
    } = req.body;

    // Check if user is a viewer or admin
    if (req.user.role !== 'viewer' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only viewers and admins can create sales' });
    }

    // Verify lead exists
    const leadResult = await dbManager.query('leads', {
      select: 'id, name, email, phone, date_booked',
      eq: { id: leadId }
    });

    if (!leadResult || leadResult.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const lead = leadResult[0];

    // Create the sale with finance fields if applicable
    const saleData = {
      lead_id: leadId,
      user_id: req.user.id, // CRITICAL: Track who created the sale
      amount: parseFloat(saleAmount),
      payment_method: paymentMethod,
      payment_type: paymentType || 'full_payment',
      status: paymentType === 'finance' ? 'Pending' : 'Completed',
      payment_status: paymentType === 'finance' ? 'Pending' : 'Paid',
      notes: notes || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    console.log(`💰 SALE CREATION: User ${req.user.name} (${req.user.role}) creating sale for lead ${leadId}`);

    // Add finance-specific fields if this is a finance agreement
    if (paymentType === 'finance') {
      saleData.finance_total_amount = parseFloat(financeTotal || saleAmount);
      saleData.finance_deposit_amount = parseFloat(depositAmount || 0);
      saleData.finance_monthly_amount = parseFloat(monthlyPayment || 0);
      saleData.finance_term_months = parseInt(termMonths || 12);
      saleData.finance_interest_rate = parseFloat(interestRate || 0);
      saleData.finance_start_date = startDate || new Date().toISOString().split('T')[0];
    } else if (paymentType === 'deposit') {
      saleData.deposit_amount = parseFloat(depositAmount || 0);
      saleData.deposit_paid = true;
      saleData.remaining_balance = parseFloat(saleAmount) - parseFloat(depositAmount || 0);
      saleData.status = 'Pending'; // Pending until full payment
      saleData.payment_status = 'Partial';
    }

    // Insert sale into database using dbManager
    const saleResult = await dbManager.insert('sales', saleData);

    if (!saleResult || saleResult.length === 0) {
      return res.status(500).json({ error: 'Failed to create sale' });
    }

    const createdSale = saleResult[0];

    console.log(`✅ Sale created: ${createdSale.id} for lead ${leadId} by ${req.user.name}`);

    // Update lead status to 'Attended' with has_sale flag
    await dbManager.update('leads',
      {
        status: 'Attended',
        has_sale: 1,
        updated_at: new Date().toISOString()
      },
      { id: leadId }
    );

    console.log(`✅ Lead ${leadId} status updated to Attended with sale flag`);

    // Create finance agreement if this is a finance sale
    if (paymentType === 'finance') {
      try {
        const financeData = {
          lead_id: leadId,
          sale_id: createdSale.id,
          total_amount: parseFloat(financeTotal || saleAmount),
          deposit_amount: parseFloat(depositAmount || 0),
          monthly_payment: parseFloat(monthlyPayment),
          term_months: parseInt(termMonths),
          interest_rate: parseFloat(interestRate || 0),
          start_date: startDate || new Date().toISOString().split('T')[0],
          status: 'active',
          remaining_balance: parseFloat(financeTotal || saleAmount) - parseFloat(depositAmount || 0)
        };

        const financeResult = await dbManager.insert('finance', financeData);

        if (financeResult && financeResult.length > 0) {
          console.log(`✅ Finance agreement created: ${financeResult[0].id}`);

          // Update sale with finance agreement ID
          await dbManager.update('sales',
            { finance_agreement_id: financeResult[0].id.toString() },
            { id: createdSale.id }
          );
        }
      } catch (financeError) {
        console.error('Error creating finance agreement:', financeError);
        // Don't fail the sale creation if finance agreement fails
      }
    }

    // Note: Receipt sending is now handled by individual endpoints
    // This allows for more granular control over email vs SMS receipts
    console.log(`💡 Sale created successfully. Receipt sending will be handled by individual endpoints if requested.`);

    // Emit sale created event
    if (req.app.locals.io) {
      req.app.locals.io.emit('sale_created', {
        saleId: createdSale.id,
        leadId: leadId,
        amount: saleAmount,
        paymentMethod: paymentMethod,
        createdBy: req.user.name,
        timestamp: new Date().toISOString()
      });
    }

    // Return the created sale
    res.status(201).json({
      ...createdSale,
      success: true
    });

  } catch (error) {
    console.error('Error creating sale:', error);
    res.status(500).json({ error: 'Failed to create sale' });
  }
});

// Get all sales with filtering
router.get('/', auth, async (req, res) => {
  try {
    const { dateRange, paymentType } = req.query;

    // Build filters for dbManager
    const filters = {};

    // ROLE-BASED ACCESS CONTROL
    // Only admins can see all sales, viewers can only see sales they personally created
    if (req.user.role !== 'admin') {
      filters.eq = { user_id: req.user.id };
      console.log(`🔒 Sales filtering: User ${req.user.name} (${req.user.role}) can only see sales they personally created`);
    } else {
      console.log(`👑 Admin sales access: User ${req.user.name} can see all sales`);
    }

    // Date range filter on the sale's creation date (shared resolver — the same
    // window the stats cards use, just applied to the sale's own date here)
    if (dateRange) {
      const { startDate, endDate } = resolveDateRange(dateRange, req.query);
      if (startDate && endDate) {
        filters.gte = { created_at: startDate.toISOString() };
        filters.lte = { created_at: endDate.toISOString() };
      }
    }

    // Get sales
    const sales = await dbManager.query('sales', {
      select: `
        id, lead_id, user_id, amount, payment_method, payment_type,
        payment_status, notes, status, created_at, updated_at
      `,
      ...filters,
      order: { created_at: 'desc' }
    });

    // Get lead and user details for each sale
    const salesWithDetails = await Promise.all(
      (sales || []).map(async (sale) => {
        // Get lead details
        const leadResult = await dbManager.query('leads', {
          select: 'name, email, phone, status, booking_history',
          eq: { id: sale.lead_id }
        });

        // Get user details (who created the sale)
        let userResult = null;
        if (sale.user_id) {
          userResult = await dbManager.query('users', {
            select: 'name, email',
            eq: { id: sale.user_id }
          });
        }

        return {
          ...sale,
          lead_name: leadResult?.[0]?.name || 'Unknown',
          lead_email: leadResult?.[0]?.email || '',
          lead_phone: leadResult?.[0]?.phone || '',
          lead_status: leadResult?.[0]?.status || 'Unknown',
          lead: {
            booking_history: Array.isArray(leadResult?.[0]?.booking_history)
              ? leadResult[0].booking_history
              : []
          },
          user_name: userResult?.[0]?.name || (sale.user_id ? `User ${sale.user_id.slice(-4)}` : 'System'),
          user_email: userResult?.[0]?.email || ''
        };
      })
    );

    res.json(salesWithDetails);

  } catch (error) {
    console.error('Error fetching sales:', error);
    res.status(500).json({ error: 'Failed to fetch sales' });
  }
});

// Get sales statistics
// RELATIONAL APPROACH: Sales joined to leads at database level.
// Sales are filtered by the LEAD's appointment date (date_booked) and attended status.
// This guarantees sales <= attended count.
router.get('/stats', auth, async (req, res) => {
  try {
    const { dateRange, paymentType } = req.query;
    const bookerId = req.query.booker;

    // --- Resolve date range (shared resolver — identical window to the sales list) ---
    const { startDate, endDate } = resolveDateRange(dateRange, req.query);

    console.log(`📊 Sales stats request:`, {
      dateRange,
      startDate: startDate?.toISOString(),
      endDate: endDate?.toISOString(),
      bookerId: bookerId || 'ALL',
      role: req.user.role
    });

    // Build relational query: sales → leads via !inner join
    let query = supabase
      .from('sales')
      .select(`
        id,
        amount,
        payment_method,
        payment_type,
        created_at,
        lead_id,
        leads!inner (
          id,
          date_booked,
          status,
          booking_status,
          booker_id,
          has_sale
        )
      `);

    // Date range filter on the LEAD's appointment date
    if (startDate && endDate) {
      query = query
        .gte('leads.date_booked', startDate.toISOString())
        .lte('leads.date_booked', endDate.toISOString());
    }

    // Attended filter: status Attended or Booked (post-filter booking_status below)
    query = query.in('leads.status', ['Attended', 'Booked']);

    // Booker filter (admin only)
    if (bookerId && req.user.role === 'admin') {
      query = query.eq('leads.booker_id', bookerId);
    }

    // Role-based: non-admin only sees sales they created
    if (req.user.role !== 'admin') {
      query = query.eq('user_id', req.user.id);
    }

    // Payment type filter
    if (paymentType && paymentType !== 'all') {
      query = query.eq('payment_type', paymentType);
    }

    const { data: rawSales, error } = await query;

    if (error) {
      console.error('Sales stats relational query error:', error);
      return res.status(500).json({ error: 'Failed to fetch sales stats' });
    }

    // Post-filter: for Booked leads, only keep those with attended booking_status
    const attendedBookingStatuses = new Set(['Arrived', 'Left', 'No Sale', 'Complete', 'Review']);
    const attendedSales = (rawSales || []).filter(sale => {
      const lead = sale.leads;
      if (!lead) return false;
      if (lead.status === 'Attended') return true;
      if (lead.status === 'Booked' && attendedBookingStatuses.has(lead.booking_status)) return true;
      return false;
    });

    // Deduplicate: one sale per lead
    const seenLeads = new Set();
    const filteredSales = attendedSales.filter(sale => {
      if (seenLeads.has(sale.lead_id)) return false;
      seenLeads.add(sale.lead_id);
      return true;
    });

    // Calculate statistics
    const totalSales = filteredSales.length;
    const totalRevenue = filteredSales.reduce((sum, sale) => sum + (parseFloat(sale.amount) || 0), 0);
    const averageSaleValue = totalSales > 0 ? totalRevenue / totalSales : 0;
    const financeAgreements = filteredSales.filter(sale => sale.payment_type === 'finance').length;

    console.log(`📅 Date Range: ${startDate?.toISOString()} → ${endDate?.toISOString()}`);
    console.log(`👤 Booker: ${bookerId || 'ALL'}`);
    console.log(`💰 Filtered Sales: ${totalSales} | Revenue: £${totalRevenue.toFixed(2)}`);

    res.json({
      totalSales,
      totalRevenue,
      averageSaleValue,
      financeAgreements
    });

  } catch (error) {
    console.error('Error fetching sales stats:', error);
    res.status(500).json({ error: 'Failed to fetch sales statistics' });
  }
});

// Get sales summary for reports
router.get('/summary', auth, async (req, res) => {
  try {
    const { startDate, endDate, userId } = req.query;

    // Build filters
    const filters = {};

    // ROLE-BASED ACCESS CONTROL
    // Only admins can see all sales summary, viewers can only see their own sales
    if (req.user.role !== 'admin') {
      filters.eq = { user_id: req.user.id };
      console.log(`🔒 Sales summary filtering: User ${req.user.name} (${req.user.role}) can only see their own sales`);
    } else {
      console.log(`👑 Admin sales summary access: User ${req.user.name} can see all sales`);
      // For admins, still allow filtering by specific user if requested
      if (userId && userId !== 'all') {
        filters.eq = { user_id: userId };
      }
    }

    if (startDate && endDate) {
      filters.gte = { created_at: startDate };
      filters.lte = { created_at: endDate };
    }

    // Get sales with filters - now including user_id for proper attribution
    const sales = await dbManager.query('sales', {
      select: 'user_id, amount, payment_method, created_at',
      ...filters
    });

    // Group by user and payment method
    const byUser = {};
    const byPaymentMethod = {};

    // Get unique user IDs to batch lookup users
    const userIds = [...new Set(sales.map(s => s.user_id).filter(id => id))];

    // Batch lookup all users
    let userMap = {};
    if (userIds.length > 0) {
      const users = await dbManager.query('users', {
        select: 'id, name',
        in: { id: userIds }
      });

      userMap = (users || []).reduce((acc, user) => {
        acc[user.id] = user.name;
        return acc;
      }, {});
    }

    console.log(`📊 Processing ${sales?.length || 0} sales for summary...`);

    for (const sale of sales || []) {
      // Group by user (using direct user_id from sale)
      if (sale.user_id) {
        const userName = userMap[sale.user_id] || (sale.user_id ? `User ${sale.user_id.slice(-4)}` : 'System');

        if (!byUser[userName]) {
          byUser[userName] = { count: 0, amount: 0 };
        }
        byUser[userName].count++;
        byUser[userName].amount += parseFloat(sale.amount) || 0;

        console.log(`   Sale: user_id="${sale.user_id}", user_name="${userName}", amount=£${sale.amount}`);
      }

      // Group by payment method
      const method = sale.payment_method || 'Unknown';
      if (!byPaymentMethod[method]) {
        byPaymentMethod[method] = { count: 0, amount: 0 };
      }
      byPaymentMethod[method].count++;
      byPaymentMethod[method].amount += parseFloat(sale.amount) || 0;
    }

    res.json({
      byUser,
      byPaymentMethod
    });

  } catch (error) {
    console.error('Error fetching sales summary:', error);
    res.status(500).json({ error: 'Failed to fetch sales summary' });
  }
});

// Get sale by leadId
router.get('/by-lead/:leadId', auth, async (req, res) => {
  try {
    const sales = await dbManager.query('sales', {
      select: '*',
      eq: { lead_id: req.params.leadId }
    });

    res.json(sales || []);

  } catch (error) {
    console.error('Error fetching sales by lead:', error);
    res.status(500).json({ error: 'Failed to fetch sales' });
  }
});

// Get full sale details including contract and photos
router.get('/:saleId/details', auth, async (req, res) => {
  try {
    const { saleId } = req.params;

    // Get sale
    const sales = await dbManager.query('sales', {
      select: '*',
      eq: { id: saleId }
    });

    if (!sales || sales.length === 0) {
      return res.status(404).json({ message: 'Sale not found' });
    }

    const sale = sales[0];

    // Get lead info
    const leads = await dbManager.query('leads', {
      select: '*',
      eq: { id: sale.lead_id }
    });
    const lead = leads && leads.length > 0 ? leads[0] : null;

    // Get user info
    const users = await dbManager.query('users', {
      select: 'id, name, email',
      eq: { id: sale.user_id }
    });
    const user = users && users.length > 0 ? users[0] : null;

    // Parse notes to get contract info
    let saleNotes = {};
    let contractId = null;
    let selectedPhotoIds = [];
    let signedPdfUrl = null;

    if (sale.notes) {
      try {
        saleNotes = JSON.parse(sale.notes);
        contractId = saleNotes.contract_id;
        selectedPhotoIds = saleNotes.selected_photo_ids || [];
        signedPdfUrl = saleNotes.signed_pdf_url;
      } catch (e) {
        // Notes is not JSON, keep as string
        saleNotes = { message: sale.notes };
      }
    }

    // Get contract if we have contract_id
    let contract = null;
    if (contractId) {
      console.log(`Looking for contract by ID: ${contractId}`);
      const contracts = await dbManager.query('contracts', {
        select: '*',
        eq: { id: contractId }
      });
      contract = contracts && contracts.length > 0 ? contracts[0] : null;
    }

    // If no contract found by ID, try to find by lead_id
    if (!contract && sale.lead_id) {
      console.log(`Looking for contract by lead_id: ${sale.lead_id}`);
      const contracts = await dbManager.query('contracts', {
        select: '*',
        eq: { lead_id: sale.lead_id },
        order: { created_at: 'desc' }
      });

      if (contracts && contracts.length > 0) {
        contract = contracts[0];
        console.log(`Found contract by lead_id: ${contract.id}, status: ${contract.status}`);
      } else {
        console.log(`No contracts found for lead_id: ${sale.lead_id}`);
      }
    }

    // Extract photo IDs from contract if not already in sale notes
    if (contract && selectedPhotoIds.length === 0) {
      if (contract.contract_data?.selectedPhotoIds) {
        selectedPhotoIds = contract.contract_data.selectedPhotoIds;
        console.log(`Found ${selectedPhotoIds.length} photos in contract_data`);
      }
      if (!signedPdfUrl && contract.signed_pdf_url) {
        signedPdfUrl = contract.signed_pdf_url;
      }
    }

    // Get selected photos if we have IDs - validate they belong to this lead
    let selectedPhotos = [];
    if (selectedPhotoIds.length > 0 && sale.lead_id) {
      const photos = await dbManager.query('photos', {
        select: 'id, filename, cloudinary_url, cloudinary_secure_url, description',
        in: { id: selectedPhotoIds },
        eq: { lead_id: sale.lead_id }
      });
      selectedPhotos = photos || [];
      console.log(`Retrieved ${selectedPhotos.length} photos (verified for lead ${sale.lead_id})`);
    }

    res.json({
      success: true,
      sale: {
        ...sale,
        parsed_notes: saleNotes,
        lead: lead,
        user: user,
        contract: contract ? {
          id: contract.id,
          status: contract.status,
          signed_at: contract.signed_at,
          signed_pdf_url: contract.signed_pdf_url || signedPdfUrl,
          signing_url: contract.signing_url,
          expires_at: contract.expires_at,
          contract_data: contract.contract_data
        } : null,
        selected_photos: selectedPhotos
      }
    });
  } catch (error) {
    console.error('Error fetching sale details:', error);
    res.status(500).json({ message: 'Error fetching sale details', error: error.message });
  }
});

// Update existing sale
router.put('/:saleId', auth, async (req, res) => {
  try {
    const { saleAmount, paymentMethod, paymentType, notes } = req.body;

    // Check if user is a viewer or admin
    if (req.user.role !== 'viewer' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only viewers and admins can update sales' });
    }

    // Update the sale
    const updateData = {
      amount: parseFloat(saleAmount),
      payment_method: paymentMethod,
      payment_type: paymentType || 'full_payment',
      notes: notes || '',
      updated_at: new Date().toISOString()
    };

    const updatedSale = await dbManager.update('sales',
      updateData,
      { id: req.params.saleId }
    );

    if (!updatedSale || updatedSale.length === 0) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    console.log(`✅ Sale updated: ${req.params.saleId} by ${req.user.name}`);

    // Emit sale updated event
    if (req.app.locals.io) {
      req.app.locals.io.emit('sale_updated', {
        saleId: req.params.saleId,
        updatedBy: req.user.name,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      ...updatedSale[0],
      success: true
    });

  } catch (error) {
    console.error('Error updating sale:', error);
    res.status(500).json({ error: 'Failed to update sale' });
  }
});

// Get finance agreements
router.get('/finance', auth, async (req, res) => {
  try {
    const { status, leadId } = req.query;

    // Build filters
    const filters = {};

    if (status && status !== 'all') {
      filters.eq = { status };
    }

    if (leadId) {
      filters.eq = { ...filters.eq, lead_id: leadId };
    }

    // Get finance agreements
    const finance = await dbManager.query('finance', {
      select: `
        id, lead_id, sale_id, total_amount, deposit_amount, monthly_payment,
        term_months, interest_rate, start_date, status, remaining_balance,
        agreement_number, total_paid, created_at
      `,
      ...filters,
      order: { created_at: 'desc' }
    });

    // Get lead and sale details for each finance agreement
    const financeWithDetails = await Promise.all(
      (finance || []).map(async (agreement) => {
        const [leadResult, saleResult] = await Promise.all([
          dbManager.query('leads', {
            select: 'name, email, phone',
            eq: { id: agreement.lead_id }
          }),
          dbManager.query('sales', {
            select: 'amount, payment_method, created_at',
            eq: { id: agreement.sale_id }
          })
        ]);

        return {
          ...agreement,
          lead: leadResult?.[0] || null,
          sale: saleResult?.[0] || null
        };
      })
    );

    res.json(financeWithDetails);

  } catch (error) {
    console.error('Error fetching finance agreements:', error);
    res.status(500).json({ error: 'Failed to fetch finance agreements' });
  }
});

// Get finance payments for an agreement
router.get('/finance/:financeId/payments', auth, async (req, res) => {
  try {
    const payments = await dbManager.query('finance_payments', {
      select: '*',
      eq: { finance_id: req.params.financeId },
      order: { payment_number: 'asc' }
    });

    res.json(payments || []);

  } catch (error) {
    console.error('Error fetching finance payments:', error);
    res.status(500).json({ error: 'Failed to fetch finance payments' });
  }
});

// Record a finance payment
router.post('/finance/:financeId/payments/:paymentId/pay', auth, async (req, res) => {
  try {
    const { amount, paymentMethod, paymentDate } = req.body;

    // Update the payment record
    const updatedPayment = await dbManager.update('finance_payments',
      {
        amount_paid: parseFloat(amount),
        payment_method: paymentMethod,
        payment_date: paymentDate || new Date().toISOString().split('T')[0],
        status: 'paid',
        updated_at: new Date().toISOString()
      },
      { id: req.params.paymentId }
    );

    if (updatedPayment && updatedPayment.length > 0) {
      // Update finance agreement totals
      const payments = await dbManager.query('finance_payments', {
        select: 'amount_paid',
        eq: { finance_id: req.params.financeId, status: 'paid' }
      });

      const totalPaid = payments.reduce((sum, p) => sum + (parseFloat(p.amount_paid) || 0), 0);

      // Get finance agreement to calculate remaining balance
      const financeResult = await dbManager.query('finance', {
        select: 'total_amount',
        eq: { id: req.params.financeId }
      });

      if (financeResult && financeResult.length > 0) {
        const remainingBalance = financeResult[0].total_amount - totalPaid;

        await dbManager.update('finance',
          {
            total_paid: totalPaid,
            remaining_balance: remainingBalance,
            status: remainingBalance <= 0 ? 'completed' : 'active',
            updated_at: new Date().toISOString()
          },
          { id: req.params.financeId }
        );
      }

      res.json({ success: true, payment: updatedPayment[0] });
    } else {
      res.status(404).json({ error: 'Payment not found' });
    }

  } catch (error) {
    console.error('Error recording finance payment:', error);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

// Send email receipt for a specific sale
router.post('/:saleId/send-receipt/email', auth, async (req, res) => {
  try {
    const { saleId } = req.params;
    const { email } = req.body;

    // Get sale data
    const saleResult = await dbManager.query('sales', {
      select: '*',
      eq: { id: saleId }
    });

    if (!saleResult || saleResult.length === 0) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    const sale = saleResult[0];

    // Get lead data
    const leadResult = await dbManager.query('leads', {
      select: 'id, name, email, phone',
      eq: { id: sale.lead_id }
    });

    if (!leadResult || leadResult.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const lead = leadResult[0];

    // Send email receipt only
    await sendSaleReceipt(sale, lead, email, null, true, false);

    res.json({ success: true, message: 'Email receipt sent successfully' });

  } catch (error) {
    console.error('Error sending email receipt:', error);
    res.status(500).json({ error: 'Failed to send email receipt' });
  }
});

// Send SMS receipt for a specific sale
router.post('/:saleId/send-receipt/sms', auth, async (req, res) => {
  try {
    const { saleId } = req.params;
    const { phone } = req.body;

    // Get sale data
    const saleResult = await dbManager.query('sales', {
      select: '*',
      eq: { id: saleId }
    });

    if (!saleResult || saleResult.length === 0) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    const sale = saleResult[0];

    // Get lead data
    const leadResult = await dbManager.query('leads', {
      select: 'id, name, email, phone',
      eq: { id: sale.lead_id }
    });

    if (!leadResult || leadResult.length === 0) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const lead = leadResult[0];

    // Send SMS receipt only
    await sendSaleReceipt(sale, lead, null, phone, false, true);

    res.json({ success: true, message: 'SMS receipt sent successfully' });

  } catch (error) {
    console.error('Error sending SMS receipt:', error);
    res.status(500).json({ error: 'Failed to send SMS receipt' });
  }
});

// Bulk delete sales (MUST come before /:saleId route)
router.delete('/bulk-delete', auth, async (req, res) => {
  try {
    const { saleIds } = req.body;

    // Check if user has permission to delete sales
    if (req.user.role !== 'admin' && req.user.role !== 'viewer') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    if (!saleIds || !Array.isArray(saleIds) || saleIds.length === 0) {
      return res.status(400).json({ error: 'Invalid sale IDs provided' });
    }

    console.log(`🗑️ Bulk deleting ${saleIds.length} sales by ${req.user.name}`);

    // Get all sales to find their lead IDs
    const salesResult = await dbManager.query('sales', {
      select: 'id, lead_id',
      in: { id: saleIds }
    });

    const leadIds = [...new Set(salesResult.map(sale => sale.lead_id))];

    // Delete the sales
    const deleteResult = await dbManager.delete('sales', { in: { id: saleIds } });

    if (deleteResult) {
      // Update has_sale flag for affected leads
      for (const leadId of leadIds) {
        const remainingSales = await dbManager.query('sales', {
          select: 'id',
          eq: { lead_id: leadId }
        });

        if (!remainingSales || remainingSales.length === 0) {
          await dbManager.update('leads',
            { has_sale: 0, updated_at: new Date().toISOString() },
            { id: leadId }
          );
        }
      }

      // Emit socket event for real-time updates
      if (req.app.locals.io) {
        req.app.locals.io.emit('sales_deleted', {
          saleIds: saleIds,
          deletedBy: req.user.name
        });
      }

      console.log(`✅ Successfully deleted ${saleIds.length} sales by ${req.user.name}`);
      res.json({
        success: true,
        message: `Successfully deleted ${saleIds.length} sales`,
        deletedCount: saleIds.length
      });
    } else {
      res.status(500).json({ error: 'Failed to delete sales' });
    }

  } catch (error) {
    console.error('Error bulk deleting sales:', error);
    res.status(500).json({ error: 'Failed to delete sales' });
  }
});

// Delete a single sale
router.delete('/:saleId', auth, async (req, res) => {
  try {
    const { saleId } = req.params;

    // Check if user has permission to delete sales
    if (req.user.role !== 'admin' && req.user.role !== 'viewer') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Check if sale exists
    const saleResult = await dbManager.query('sales', {
      select: 'id, lead_id',
      eq: { id: saleId }
    });

    if (!saleResult || saleResult.length === 0) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    const sale = saleResult[0];

    // Delete the sale
    const deleteResult = await dbManager.delete('sales', { eq: { id: saleId } });

    if (deleteResult) {
      // Update lead has_sale flag if no other sales exist for this lead
      const remainingSales = await dbManager.query('sales', {
        select: 'id',
        eq: { lead_id: sale.lead_id }
      });

      if (!remainingSales || remainingSales.length === 0) {
        await dbManager.update('leads',
          { has_sale: 0, updated_at: new Date().toISOString() },
          { id: sale.lead_id }
        );
      }

      // Emit socket event for real-time updates
      if (req.app.locals.io) {
        req.app.locals.io.emit('sales_deleted', {
          saleIds: [saleId],
          deletedBy: req.user.name
        });
      }

      console.log(`✅ Sale ${saleId} deleted by ${req.user.name}`);
      res.json({ success: true, message: 'Sale deleted successfully' });
    } else {
      res.status(500).json({ error: 'Failed to delete sale' });
    }

  } catch (error) {
    console.error('Error deleting sale:', error);
    res.status(500).json({ error: 'Failed to delete sale' });
  }
});

// Bulk communication to selected sales
router.post('/bulk-communication', auth, async (req, res) => {
  try {
    const { templateId, sales, communicationType, customSubject, customEmailBody, customSmsBody } = req.body;
    
    if (!templateId || !sales || sales.length === 0) {
      return res.status(400).json({ message: 'Template ID and sales data are required' });
    }

    console.log(`📤 Starting bulk communication for ${sales.length} sales with template ${templateId}`);
    
    // Use direct Supabase like the working calendar system
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
    
    // Get the template using direct Supabase call (like calendar system)
    const { data: templates, error: templateError } = await supabase
      .from('templates')
      .select('*')
      .eq('id', templateId)
      .eq('is_active', true)
      .limit(1);
    
    if (templateError) {
      console.error('❌ Template fetch error:', templateError);
      return res.status(500).json({ message: 'Error fetching template', error: templateError.message });
    }
    
    if (!templates || templates.length === 0) {
      console.log('❌ Template not found or inactive:', templateId);
      return res.status(404).json({ message: 'Template not found or inactive' });
    }
    
    const template = templates[0];
    console.log(`✅ Using template: ${template.name} (${template.type})`);

    let sentCount = 0;
    const results = [];

    for (const saleData of sales) {
      try {
        console.log(`📊 Processing sale: ${saleData.id}`);
        
        // Get the full sale data using direct Supabase (like calendar system)
        const { data: sale, error: saleError } = await supabase
          .from('sales')
          .select('*')
          .eq('id', saleData.id)
          .single();
        
        if (saleError || !sale) {
          console.log(`⚠️ Sale ${saleData.id} not found:`, saleError);
          results.push({
            saleId: saleData.id,
            error: 'Sale not found'
          });
          continue;
        }
        
        // Check if sale has a valid lead_id
        if (!sale.lead_id) {
          console.log(`⚠️ Sale ${saleData.id} has no lead_id`);
          results.push({
            saleId: saleData.id,
            error: 'Sale has no associated lead - cannot create message',
            customerName: saleData.lead_name || 'Unknown Customer'
          });
          continue;
        }

        // Get the lead data using direct Supabase
        const { data: lead, error: leadError } = await supabase
          .from('leads')
          .select('name, email, phone')
          .eq('id', sale.lead_id)
          .single();

        if (leadError || !lead) {
          console.log(`⚠️ Lead for sale ${saleData.id} not found:`, leadError);
          console.log(`⚠️ Skipping message creation for sale ${saleData.id} due to missing lead`);
          results.push({
            saleId: saleData.id,
            error: 'Lead not found - cannot create message',
            customerName: saleData.lead_name || 'Unknown Customer'
          });
          continue;
        }
        
        console.log(`✅ Found lead: ${lead.name} (${lead.email})`);

        // Prepare variables for template replacement
        const variables = {
          '{leadName}': lead.name || 'Customer',
          '{leadEmail}': lead.email || '',
          '{leadPhone}': lead.phone || '',
          '{saleAmount}': sale.amount || '0.00',
          '{saleAmountFormatted}': new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(sale.amount || 0),
          '{paymentMethod}': sale.payment_method || 'Card',
          '{saleDate}': new Date(saleData.sale_date || sale.created_at).toLocaleDateString('en-GB'),
          '{saleTime}': new Date(saleData.sale_date || sale.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
          '{receiptId}': sale.id || 'N/A',
          '{saleNotes}': sale.notes || '',
          '{companyName}': 'Modelling Studio CRM',
          '{paymentType}': sale.payment_type || 'full_payment'
        };

        // Add finance-specific variables if applicable
        if (sale.payment_type === 'finance') {
          const { data: finance, error: financeError } = await supabase
            .from('finance')
            .select('*')
            .eq('sale_id', sale.id)
            .single();
          
          if (!financeError && finance) {
            variables['{financePaymentAmount}'] = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(finance.payment_amount || 0);
            variables['{financeFrequency}'] = finance.frequency || 'Monthly';
            variables['{financeStartDate}'] = new Date(finance.start_date).toLocaleDateString('en-GB');
            variables['{nextPaymentDate}'] = new Date(finance.next_payment_date).toLocaleDateString('en-GB');
            variables['{remainingBalance}'] = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(finance.remaining_balance || 0);
          }
        }

        // Replace variables in content
        let emailSubject = customSubject || template.subject || '';
        let emailBody = customEmailBody || template.email_body || '';
        let smsBody = customSmsBody || template.sms_body || '';

        Object.entries(variables).forEach(([key, value]) => {
          emailSubject = emailSubject.replace(new RegExp(key, 'g'), value);
          emailBody = emailBody.replace(new RegExp(key, 'g'), value);
          smsBody = smsBody.replace(new RegExp(key, 'g'), value);
        });

        // Use the same approach as calendar system - create a custom template object
        // IMPORTANT: Respect template's send_email/send_sms settings
        // Only send if BOTH template allows it AND communicationType requests it
        const wantsEmail = (communicationType === 'email' || communicationType === 'both');
        const wantsSms = (communicationType === 'sms' || communicationType === 'both');
        const templateAllowsEmail = template.send_email !== false; // Default to true if not set
        const templateAllowsSms = template.send_sms !== false; // Default to true if not set

        const customTemplate = {
          ...template,
          subject: emailSubject,
          email_body: emailBody,
          sms_body: smsBody,
          send_email: wantsEmail && templateAllowsEmail,
          send_sms: wantsSms && templateAllowsSms,
          email_account: template.email_account || 'primary' // Preserve email account selection
        };

        console.log(`📧 Template settings: send_email=${customTemplate.send_email}, send_sms=${customTemplate.send_sms}, email_account=${customTemplate.email_account}`);

        // Use MessagingService.processTemplate like calendar system does
        const processedTemplate = MessagingService.processTemplate(customTemplate, lead, req.user, null, null);
        
        console.log(`📧 Processed template for ${lead.name}:`, {
          hasEmail: !!processedTemplate.email_body,
          hasSms: !!processedTemplate.sms_body,
          emailLength: processedTemplate.email_body?.length || 0,
          smsLength: processedTemplate.sms_body?.length || 0
        });

        // Create message record using Supabase (like calendar system)
        const messageId = require('uuid').v4();
        const { data: messageResult, error: messageError } = await supabase
          .from('messages')
          .insert({
            id: messageId,
            lead_id: sale.lead_id,
            template_id: templateId,
            type: (customTemplate.send_email && customTemplate.send_sms) ? 'both' : (customTemplate.send_email ? 'email' : 'sms'),
            content: customTemplate.send_email ? processedTemplate.email_body : processedTemplate.sms_body,
            subject: customTemplate.send_email ? processedTemplate.subject : null,
            email_body: customTemplate.send_email ? processedTemplate.email_body : null,
            sms_body: customTemplate.send_sms ? processedTemplate.sms_body : null,
            recipient_email: customTemplate.send_email ? lead.email : null,
            recipient_phone: customTemplate.send_sms ? lead.phone : null,
            sent_by: req.user.id,
            sent_by_name: req.user.name,
            status: 'pending',
            sent_at: new Date().toISOString(), // Set sent_at when message is created
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (messageError) {
          console.error('❌ Message creation error:', messageError);
          results.push({
            saleId: sale.id,
            customerName: lead.name,
            error: 'Failed to create message record'
          });
          continue;
        }

        console.log(`✅ Message record created: ${messageResult.id}`);

        // Send communications using the same approach as calendar
        let emailSent = false;
        let smsSent = false;
        let emailError = null;
        let smsError = null;

        // Send email if requested
        if (customTemplate.send_email && lead.email) {
          try {
            const message = {
              id: messageId,
              recipient_email: lead.email,
              recipient_name: lead.name,
              subject: processedTemplate.subject,
              email_body: processedTemplate.email_body,
              lead_id: sale.lead_id,
              template_id: templateId,
              type: 'email',
              sent_by: req.user.id,
              sent_by_name: req.user.name,
              status: 'pending',
              created_at: new Date().toISOString(),
              channel: 'email',
            };
            
            // Resolve email account: template > user assignment > default
            let resolvedEmailAccount = customTemplate.email_account;
            try {
              const resolution = await emailAccountService.resolveEmailAccount({
                templateId: template?.id,
                userId: req.user?.id
              });
              if (resolution.type === 'database' && resolution.account) {
                resolvedEmailAccount = resolution.account;
                console.log(`📧 Using resolved email account: ${resolution.account.email}`);
              }
            } catch (resolveErr) {
              console.error('📧 Email account resolution error, using default:', resolveErr.message);
            }

            console.log(`📧 Sending email to ${lead.email}...`);
            const emailResult = await MessagingService.sendEmail(message, resolvedEmailAccount);
            emailSent = emailResult;
            
            if (emailResult) {
              console.log(`✅ Email sent successfully to ${lead.email}`);
            } else {
              console.log(`❌ Email failed to ${lead.email}`);
            }
          } catch (error) {
            console.error('❌ Email sending error:', error);
            emailError = error.message;
          }
        }

        // Send SMS if requested
        if (customTemplate.send_sms && lead.phone) {
          try {
            const message = {
              id: messageId,
              recipient_phone: lead.phone,
              recipient_name: lead.name,
              sms_body: processedTemplate.sms_body,
              lead_id: sale.lead_id,
              template_id: templateId,
              type: 'sms',
              sent_by: req.user.id,
              sent_by_name: req.user.name,
              status: 'pending',
              created_at: new Date().toISOString(),
              channel: 'sms',
            };
            
            console.log(`📱 Sending SMS to ${lead.phone}...`);
            const smsResult = await MessagingService.sendSMS(message);
            smsSent = smsResult;
            
            if (smsResult) {
              console.log(`✅ SMS sent successfully to ${lead.phone}`);
            } else {
              console.log(`❌ SMS failed to ${lead.phone}`);
            }
          } catch (error) {
            console.error('❌ SMS sending error:', error);
            smsError = error.message;
          }
        }

        // Update message status
        const finalStatus = (emailSent || smsSent) ? 'sent' : 'failed';
        const { error: updateError } = await supabase
          .from('messages')
          .update({
            status: finalStatus,
            email_status: customTemplate.send_email ? (emailSent ? 'sent' : 'failed') : null,
            sms_status: customTemplate.send_sms ? (smsSent ? 'sent' : 'failed') : null,
            sent_at: new Date().toISOString()
          })
          .eq('id', messageId);

        if (updateError) {
          console.error('❌ Message status update error:', updateError);
        } else {
          console.log(`✅ Message ${messageId} status updated to ${finalStatus}`);
        }

        results.push({
          saleId: sale.id,
          customerName: lead.name,
          email: lead.email,
          phone: lead.phone,
          emailSent,
          smsSent,
          emailError,
          smsError
        });

        sentCount++;
      } catch (saleError) {
        console.error('Error processing sale:', saleError);
        results.push({
          saleId: saleData.id,
          error: saleError.message
        });
      }
    }

    // Calculate success/error counts
    const errorCount = results.filter(r => r.error).length;
    const successCount = results.filter(r => !r.error).length;

    // Log the communication attempt
    console.log(`📤 Bulk communication completed: ${successCount} successful, ${errorCount} errors`);

    let message = `Bulk communication completed: ${successCount} messages sent successfully`;
    if (errorCount > 0) {
      message += `, ${errorCount} failed`;
    }

    res.json({
      message,
      sentCount: successCount,
      errorCount,
      totalSales: sales.length,
      results,
      note: successCount > 0 ? 'Messages will appear in the message history shortly' : 'No messages were sent due to errors'
    });

  } catch (error) {
    console.error('Bulk communication error:', error);
    res.status(500).json({ message: 'Error sending bulk communications', error: error.message });
  }
});

module.exports = router;