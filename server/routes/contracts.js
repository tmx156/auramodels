/**
 * Contracts API Routes
 * Handles contract creation, sending, signing, and PDF generation
 * For Auralndn Invoice & Order Form contracts
 */

const express = require('express');
const { auth } = require('../middleware/auth');
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { generateContractPDF, generateContractHTML, buildContractData, getActiveTemplate } = require('../utils/contractGenerator');
const { generateFinanceContractHTML, generateFinanceContractPDF, getActiveFinanceTemplate, calculateFinanceFields, generateCardPayPDF } = require('../utils/financeContractGenerator');
const { uploadToS3 } = require('../utils/s3Service');
const { sendEmail } = require('../utils/emailService');
const { sendSMS } = require('../utils/smsService');
const emailAccountService = require('../utils/emailAccountService');
const archiver = require('archiver');

const router = express.Router();
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey || config.supabase.anonKey);

/**
 * Generate a unique contract token
 */
function generateContractToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate invoice number in format INV DDMMYY-XX
 * @param {Date} date - The date for the invoice
 * @param {number} sequenceNumber - The sequence number for that day
 * @returns {string} Invoice number like "INV 090126-01"
 */
function formatInvoiceNumber(date, sequenceNumber) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  const seq = String(sequenceNumber).padStart(2, '0');
  return `INV ${day}${month}${year}-${seq}`;
}

/**
 * @route   GET /api/contracts/next-invoice-number
 * @desc    Get the next invoice number for today
 * @access  Private
 */
router.get('/next-invoice-number', auth, async (req, res) => {
  try {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = String(today.getFullYear()).slice(-2);
    const datePrefix = `INV ${day}${month}${year}-`;

    // Get today's start and end for filtering
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    // Count contracts created today that have invoice numbers with today's date prefix
    const { data: contracts, error } = await supabase
      .from('contracts')
      .select('contract_data')
      .gte('created_at', todayStart.toISOString())
      .lte('created_at', todayEnd.toISOString());

    if (error) {
      console.error('Error fetching contracts for invoice number:', error);
      return res.status(500).json({ message: 'Error generating invoice number' });
    }

    // Count how many have invoice numbers matching today's date
    let maxSequence = 0;
    if (contracts && contracts.length > 0) {
      contracts.forEach(contract => {
        const invoiceNumber = contract.contract_data?.invoiceNumber || '';
        if (invoiceNumber.startsWith(datePrefix)) {
          const seqPart = invoiceNumber.split('-')[1];
          const seq = parseInt(seqPart, 10);
          if (!isNaN(seq) && seq > maxSequence) {
            maxSequence = seq;
          }
        }
      });
    }

    const nextSequence = maxSequence + 1;
    const nextInvoiceNumber = formatInvoiceNumber(today, nextSequence);

    console.log(`📋 Next invoice number: ${nextInvoiceNumber} (found ${maxSequence} existing today)`);

    res.json({
      success: true,
      invoiceNumber: nextInvoiceNumber,
      date: today.toISOString(),
      sequence: nextSequence
    });
  } catch (error) {
    console.error('Error generating next invoice number:', error);
    res.status(500).json({ message: 'Error generating invoice number', error: error.message });
  }
});

/**
 * @route   POST /api/contracts/create
 * @desc    Create a new contract for a lead with package details
 * @access  Private (Viewer, Admin)
 */
router.post('/create', auth, async (req, res) => {
  try {
    if (!['viewer', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only viewers and admins can create contracts' });
    }

    const { leadId, packageId, packageData, invoiceData, contractDetails, selectedPhotoIds } = req.body;

    if (!leadId) {
      return res.status(400).json({ message: 'Lead ID is required' });
    }

    // Validate packageId is a valid UUID or null - 'individual-items' is not a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const validPackageId = packageId && uuidRegex.test(packageId) ? packageId : null;

    // Get lead data
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    // Determine contract type: 'finance' for finance payment, 'invoice' for everything else
    const isFinanceContract = contractDetails?.paymentMethod === 'finance' || req.body.contractType === 'finance';
    const contractType = isFinanceContract ? 'finance' : 'invoice';

    // Use contractDetails from the pre-screen form if provided, otherwise build from lead/package
    let contractData;

    if (contractDetails && isFinanceContract) {
      // FINANCE CONTRACT - includes BOTH invoice fields AND finance fields (dual document)
      contractData = {
        date: new Date().toISOString(),
        signedAt: null,

        // Customer info
        customerNumber: lead.id?.toString().slice(-6) || '',
        customerName: contractDetails.customerName || lead.name || '',
        clientNameIfDifferent: contractDetails.clientNameIfDifferent || '',
        address: contractDetails.address || '',
        postcode: contractDetails.postcode || '',
        phone: contractDetails.phone || '',
        email: contractDetails.email || '',
        isVip: contractDetails.isVip || false,
        dateOfBirth: contractDetails.dateOfBirth || '',
        yearsAtAddress: contractDetails.yearsAtAddress || '',

        // Studio info (for invoice document)
        studioNumber: contractDetails.studioNumber || '',
        photographer: contractDetails.photographer || '',
        invoiceNumber: contractDetails.invoiceNumber || `INV-${Date.now().toString().slice(-8)}`,

        // Order details (for invoice document)
        digitalImages: contractDetails.digitalImages ?? true,
        digitalImagesQty: contractDetails.digitalImagesQty || 'All',
        digitalZCard: contractDetails.digitalZCard || false,
        efolio: contractDetails.efolio || false,
        efolioUrl: contractDetails.efolioUrl || '',
        projectInfluencer: contractDetails.projectInfluencer || false,
        influencerLogin: contractDetails.influencerLogin || '',
        influencerPassword: contractDetails.influencerPassword || '',

        // Permissions (for invoice document)
        allowImageUse: contractDetails.allowImageUse ?? true,
        imagesReceived: 'N.A',

        // Notes (for invoice document)
        notes: contractDetails.notes || '',

        // Financials (for invoice document)
        subtotal: contractDetails.subtotal || 0,
        vatRate: contractDetails.vatRate || 20,
        vatAmount: contractDetails.vatAmount || 0,
        total: contractDetails.total || 0,

        // Payment
        paymentMethod: 'finance',
        authCode: contractDetails.authCode || '',
        viewerInitials: '',

        // Affordability Assessment (for finance document)
        monthlyIncome: parseFloat(contractDetails.monthlyIncome) || 0,
        priorityOutgoings: parseFloat(contractDetails.priorityOutgoings) || 0,
        otherOutgoings: parseFloat(contractDetails.otherOutgoings) || 0,
        agreedInstalment: parseFloat(contractDetails.agreedInstalment) || 0,

        // Loan & Repayment Terms (for finance document)
        cashPrice: parseFloat(contractDetails.cashPrice) || 0,
        deposit: parseFloat(contractDetails.deposit) || 0,
        adminFee: parseFloat(contractDetails.adminFee) || 0,
        interestRate: parseFloat(contractDetails.interestRate) || 0,
        numberOfInstalments: parseInt(contractDetails.numberOfInstalments) || 12,
        duration: parseInt(contractDetails.duration) || 12,

        // Repayment Schedule (for finance document)
        repaymentFrequency: contractDetails.repaymentFrequency || 'monthly',
        commencingFrom: contractDetails.commencingFrom || '',

        // Creditor info (auto-populated from admin)
        creditorName: contractDetails.creditorName || '',
        creditorDate: contractDetails.creditorDate || new Date().toISOString(),

        // Reference
        agreementNumber: contractDetails.invoiceNumber || `FIN-${Date.now().toString().slice(-8)}`,

        // For finance agreement auto-creation
        depositAmount: parseFloat(contractDetails.deposit) || 0,
        financeAmount: (parseFloat(contractDetails.cashPrice) || 0) - (parseFloat(contractDetails.deposit) || 0),
        financeFrequency: contractDetails.repaymentFrequency || 'monthly',
        financeStartDate: contractDetails.commencingFrom || '',
        financeDuration: parseInt(contractDetails.numberOfInstalments) || 12,

        // Card payment details (admin fills in, customer signs)
        cardFullName: contractDetails.cardFullName || '',
        cardNumber: contractDetails.cardNumber || '',
        cardExpiry: contractDetails.cardExpiry || '',
        cardCvv: contractDetails.cardCvv || '',

        // All 7 signatures (5 invoice + 1 finance + 1 card payment)
        signatures: {
          main: null,
          notAgency: null,
          noCancel: null,
          passDetails: null,
          happyPurchase: null,
          customer: null,
          cardPayment: null
        },

        // Selected photo IDs for delivery after signing
        selectedPhotoIds: selectedPhotoIds || []
      };

      // Calculate APR from loan terms
      const financeCalc = calculateFinanceFields(contractData);
      contractData.apr = financeCalc.apr;
    } else if (contractDetails) {
      // Log if we're handling individual items (no valid package UUID)
      if (!validPackageId && packageId) {
        console.log(`📦 Processing individual items - packageId "${packageId}" is not a valid UUID, using null`);
      }
      // INVOICE CONTRACT - existing flow (card/cash/ideal4finance)
      contractData = {
        // Dates - convert to ISO strings for JSONB storage
        date: new Date().toISOString(),
        signedAt: null,

        // Customer details from edited form
        customerNumber: lead.id?.toString().slice(-6) || '',
        customerName: contractDetails.customerName || lead.name || '',
        clientNameIfDifferent: contractDetails.clientNameIfDifferent || '',
        address: contractDetails.address || '',
        postcode: contractDetails.postcode || '',
        phone: contractDetails.phone || '',
        email: contractDetails.email || '',
        isVip: contractDetails.isVip || false,

        // Studio info from edited form
        studioNumber: contractDetails.studioNumber || '',
        photographer: contractDetails.photographer || '',
        invoiceNumber: contractDetails.invoiceNumber || `INV-${Date.now().toString().slice(-8)}`,

        // Order details from edited form
        digitalImages: contractDetails.digitalImages ?? true,
        digitalImagesQty: contractDetails.digitalImagesQty || 'All',
        digitalZCard: contractDetails.digitalZCard || false,
        efolio: contractDetails.efolio || false,
        efolioUrl: contractDetails.efolioUrl || '',
        projectInfluencer: contractDetails.projectInfluencer || false,
        influencerLogin: contractDetails.influencerLogin || '',
        influencerPassword: contractDetails.influencerPassword || '',

        // Permissions from edited form
        allowImageUse: contractDetails.allowImageUse ?? true,
        imagesReceived: 'N.A',

        // Notes from edited form
        notes: contractDetails.notes || '',

        // Financials from edited form
        subtotal: contractDetails.subtotal || 0,
        vatRate: contractDetails.vatRate || 20,
        vatAmount: contractDetails.vatAmount || 0,
        total: contractDetails.total || 0,

        // Payment from edited form
        paymentMethod: contractDetails.paymentMethod || 'card',
        authCode: contractDetails.authCode || '',
        viewerInitials: '',
        // Finance-specific fields
        depositAmount: contractDetails.depositAmount || 0,
        financeAmount: contractDetails.financeAmount || 0,

        // Signatures (to be filled when signed)
        signatures: {
          main: null,
          notAgency: null,
          noCancel: null,
          passDetails: null,
          happyPurchase: null
        },

        // Selected photo IDs for delivery after signing
        selectedPhotoIds: selectedPhotoIds || []
      };
    } else {
      // Fallback: Build contract data from lead and package
      let pkg = packageData;
      if (validPackageId && !packageData) {
        const { data: pkgData, error: pkgError } = await supabase
          .from('packages')
          .select('*')
          .eq('id', validPackageId)
          .single();

        if (!pkgError && pkgData) {
          pkg = pkgData;
        }
      }
      contractData = buildContractData(lead, pkg || {}, invoiceData || {});
      // Ensure date is serialized as ISO string
      if (contractData.date && contractData.date instanceof Date) {
        contractData.date = contractData.date.toISOString();
      }
      if (contractData.signedAt && contractData.signedAt instanceof Date) {
        contractData.signedAt = contractData.signedAt.toISOString();
      }
      // Add selected photo IDs for delivery after signing
      contractData.selectedPhotoIds = selectedPhotoIds || [];
    }

    // Generate contract token
    const contractToken = generateContractToken();

    // Determine base URL for signing link
    // Use config which has proper fallbacks for production
    let baseUrl = config.FRONTEND_URL || config.CLIENT_URL || 'https://crm.example.com';

    // Ensure URL doesn't have trailing slash
    baseUrl = baseUrl.replace(/\/$/, '');

    // Log for debugging
    console.log('🔗 Contract URL config:', {
      FRONTEND_URL: config.FRONTEND_URL,
      CLIENT_URL: config.CLIENT_URL,
      NODE_ENV: config.NODE_ENV,
      finalBaseUrl: baseUrl
    });

    const signingUrl = `${baseUrl}/sign-contract/${contractToken}`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    console.log('📝 Contract signing URL base:', baseUrl);

    // Ensure contract_data is properly serialized (no Date objects, functions, etc.)
    const serializedContractData = JSON.parse(JSON.stringify(contractData));

    // Create contract record
    console.log('Creating contract with data:', {
      lead_id: leadId,
      package_id: validPackageId,
      original_package_id: packageId,
      contract_token: contractToken.substring(0, 10) + '...',
      signing_url: signingUrl,
      expires_at: expiresAt.toISOString(),
      status: 'draft',
      contract_data_keys: Object.keys(serializedContractData),
      created_by: req.user.id,
      baseUrl: baseUrl
    });

    const { data: contract, error: createError } = await supabase
      .from('contracts')
      .insert({
        lead_id: leadId,
        package_id: validPackageId,
        contract_token: contractToken,
        signing_url: signingUrl,
        expires_at: expiresAt.toISOString(),
        status: 'draft',
        contract_data: serializedContractData, // Use serialized version
        contract_type: contractType,
        created_by: req.user.id
      })
      .select()
      .single();

    if (createError) {
      console.error('❌ Error creating contract:', createError);
      console.error('Full error details:', JSON.stringify(createError, null, 2));
      return res.status(500).json({ 
        message: 'Failed to create contract', 
        error: createError.message,
        details: createError.details || createError.hint || 'No additional details available'
      });
    }

    if (!contract) {
      console.error('❌ Contract insert returned no data');
      return res.status(500).json({ message: 'Failed to create contract - no data returned' });
    }

    console.log(`Contract created for lead ${lead.name}: ${contract.id}`);

    res.json({
      success: true,
      message: 'Contract created',
      contract: {
        id: contract.id,
        signingUrl: signingUrl,
        expiresAt: expiresAt.toISOString(),
        status: contract.status
      }
    });
  } catch (error) {
    console.error('Error creating contract:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   POST /api/contracts/send/:contractId
 * @desc    Send contract signing link via email AND SMS (based on template settings)
 * @access  Private (Viewer, Admin)
 */
router.post('/send/:contractId', auth, async (req, res) => {
  try {
    if (!['viewer', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only viewers and admins can send contracts' });
    }

    const { contractId } = req.params;
    const { email: overrideEmail } = req.body;

    // Get contract with lead data
    const { data: contract, error: fetchError } = await supabase
      .from('contracts')
      .select(`
        *,
        lead:leads(id, name, email, phone)
      `)
      .eq('id', contractId)
      .single();

    if (fetchError || !contract) {
      return res.status(404).json({ message: 'Contract not found' });
    }

    if (contract.status === 'signed') {
      return res.status(400).json({ message: 'Contract is already signed' });
    }

    // Determine recipient email and phone
    const recipientEmail = overrideEmail || contract.contract_data?.email || contract.lead?.email;
    const recipientPhone = contract.contract_data?.phone || contract.lead?.phone;

    if (!recipientEmail) {
      return res.status(400).json({ message: 'No email address available' });
    }

    const customerName = contract.contract_data?.customerName || contract.lead?.name || 'Customer';
    const contractData = contract.contract_data || {};
    const contractType = contract.contract_type || 'invoice';
    const isFinanceContract = contractType === 'finance';
    const totalAmount = contractData.total ? `£${parseFloat(contractData.total).toFixed(2)}` : '';
    const packageInfo = contractData.notes || '';

    // Fetch contract_signing template from database
    let template = null;
    try {
      const { data: templateData, error: templateError } = await supabase
        .from('templates')
        .select('*')
        .eq('type', 'contract_signing')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!templateError && templateData) {
        template = templateData;
        console.log(`📝 Using contract_signing template: "${template.name}" (ID: ${template.id})`);
        console.log(`📝 Template settings: send_email=${template.send_email}, send_sms=${template.send_sms}`);
      } else {
        console.log('⚠️ No active contract_signing template found, using hardcoded default');
      }
    } catch (templateFetchError) {
      console.error('❌ Error fetching contract_signing template:', templateFetchError.message);
    }

    // Variable replacements for templates
    const templateVariables = {
      '{customerName}': customerName,
      '{leadName}': customerName,
      '{totalAmount}': totalAmount,
      '{packageInfo}': packageInfo,
      '{signingUrl}': contract.signing_url,
      '{companyName}': 'Auralndn'
    };

    // Function to replace variables in template
    const replaceVariables = (text) => {
      if (!text) return text;
      let result = text;
      Object.entries(templateVariables).forEach(([key, value]) => {
        result = result.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value || '');
      });
      return result;
    };

    let emailSent = false;
    let smsSent = false;
    let emailError = null;
    let smsError = null;

    // Send EMAIL
    const shouldSendEmail = template ? template.send_email !== false : true;
    if (shouldSendEmail) {
      try {
        let emailSubject, emailHtml;

        if (template && template.email_body) {
          // Use database template
          emailSubject = replaceVariables(template.subject) || (isFinanceContract
            ? 'Auralndn - Your Contract & Finance Agreement are Ready for Signing'
            : 'Auralndn - Your Contract is Ready for Signing');
          emailHtml = replaceVariables(template.email_body);
        } else {
          // Fallback to hardcoded template
          emailSubject = isFinanceContract
            ? 'Auralndn - Your Contract & Finance Agreement are Ready for Signing'
            : 'Auralndn - Your Contract is Ready for Signing';
          emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { background: #1a1a2e; padding: 30px 20px; text-align: center; }
    .header h1 { color: #ffffff; margin: 0; font-size: 28px; letter-spacing: 3px; }
    .header p { color: #cccccc; margin: 5px 0 0 0; font-size: 14px; }
    .content { padding: 40px 30px; }
    .greeting { font-size: 18px; margin-bottom: 20px; }
    .intro { margin-bottom: 25px; color: #555; }
    .button-container { text-align: center; margin: 30px 0; }
    .button { display: inline-block; background: #1a1a2e; color: #ffffff !important; padding: 16px 50px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px; }
    .instructions { background: #f8f9fa; border-radius: 8px; padding: 25px; margin: 25px 0; }
    .instructions h3 { color: #1a1a2e; margin-top: 0; margin-bottom: 15px; font-size: 16px; }
    .instructions ol { margin: 0; padding-left: 20px; color: #555; }
    .instructions li { margin-bottom: 10px; }
    .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
    .warning strong { color: #856404; }
    .link-backup { background: #f0f0f0; padding: 15px; border-radius: 5px; margin: 20px 0; word-break: break-all; font-size: 13px; color: #666; }
    .order-summary { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .order-summary h4 { margin: 0 0 10px 0; color: #1a1a2e; }
    .order-summary p { margin: 5px 0; color: #555; }
    .footer { background: #f5f5f5; padding: 25px; text-align: center; color: #888; font-size: 12px; }
    .footer p { margin: 5px 0; }
    .contact { margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>AURALNDN</h1>
      <p>Professional Photography Services</p>
    </div>
    <div class="content">
      <p class="greeting">Dear ${customerName},</p>
      <p class="intro">Thank you for choosing Auralndn! Your contract is ready for review and signing. Please complete this within 7 days to confirm your order.</p>
      ${totalAmount ? `
      <div class="order-summary">
        <h4>Order Summary</h4>
        <p><strong>Total Amount:</strong> ${totalAmount} (inc. VAT)</p>
        ${packageInfo ? `<p><strong>Details:</strong> ${packageInfo}</p>` : ''}
      </div>
      ` : ''}
      <div class="button-container">
        <a href="${contract.signing_url}" class="button">Review & Sign Contract</a>
      </div>
      <div class="instructions">
        <h3>How to Complete Your Contract:</h3>
        <ol>
          <li><strong>Click the button above</strong> to open your contract</li>
          <li><strong>Review the contract</strong> - Check all your details are correct</li>
          <li><strong>Sign in the signature boxes</strong> - Use your mouse or finger to sign</li>
          <li><strong>Complete ${isFinanceContract ? 'all 7 signatures' : 'all 5 signatures'}</strong> across ${isFinanceContract ? 'all 5 pages' : 'both pages'}</li>
          <li><strong>Click "Submit Signed Contract"</strong> to finish</li>
        </ol>
      </div>
      <div class="warning">
        <strong>Important:</strong> This link will expire in 7 days. Please complete your signing before then.
      </div>
      <p>If the button above doesn't work, copy and paste this link into your browser:</p>
      <div class="link-backup">${contract.signing_url}</div>
      <div class="contact">
        <p>Need help? Contact us:</p>
        <p>Email: <a href="mailto:hello@example.com">hello@example.com</a></p>
        <p>Website: <a href="https://www.example.com">www.example.com</a></p>
      </div>
    </div>
    <div class="footer">
      <p><strong>Auralndn</strong></p>
      <p>A trading name of S&A Advertising Ltd</p>
      <p>Company No 8708429 | VAT Reg No 171339904</p>
      <p>129A Weedington Rd, London NW5 4NX</p>
    </div>
  </div>
</body>
</html>`;
        }

        // Resolve email account: template > user > default
        let emailAccount = 'primary';
        try {
          const resolution = await emailAccountService.resolveEmailAccount({
            templateId: template?.id,
            userId: req.user?.id
          });
          if (resolution.type === 'database' && resolution.account) {
            emailAccount = resolution.account;
            console.log(`📧 Contract email using: ${resolution.account.email} (database)`);
          } else {
            emailAccount = resolution.accountKey || template?.email_account || 'primary';
            console.log(`📧 Contract email using: ${emailAccount} (legacy)`);
          }
        } catch (resolveErr) {
          console.error('📧 Error resolving email account:', resolveErr.message);
          emailAccount = template?.email_account || 'primary';
        }

        const emailResult = await sendEmail(
          recipientEmail,
          emailSubject,
          emailHtml,
          [], // no attachments
          emailAccount
        );

        if (emailResult.success) {
          emailSent = true;
          console.log(`✅ Contract email sent to ${recipientEmail} via Gmail API`);
        } else {
          emailError = emailResult.error;
          console.error('❌ Contract email failed:', emailResult.error);
        }
      } catch (err) {
        emailError = err.message;
        console.error('Email sending failed:', err);
      }
    }

    // Send SMS (if enabled in template AND phone number available)
    const shouldSendSms = template && template.send_sms === true;
    if (shouldSendSms && recipientPhone) {
      try {
        let smsBody;

        if (template && template.sms_body) {
          // Use database template
          smsBody = replaceVariables(template.sms_body);
        } else {
          // Fallback to default SMS
          smsBody = `Hi ${customerName}, your Auralndn contract is ready for signing. Please complete within 7 days: ${contract.signing_url}`;
        }

        console.log(`📱 Sending contract SMS to ${recipientPhone}...`);
        const smsResult = await sendSMS(recipientPhone, smsBody);

        if (smsResult.success) {
          smsSent = true;
          console.log(`✅ Contract SMS sent to ${recipientPhone}`);
        } else {
          smsError = smsResult.error;
          console.error('❌ Contract SMS failed:', smsResult.error);
        }
      } catch (err) {
        smsError = err.message;
        console.error('SMS sending failed:', err);
      }
    } else if (shouldSendSms && !recipientPhone) {
      console.log('⚠️ SMS enabled but no phone number available');
      smsError = 'No phone number available';
    }

    // Update contract status
    await supabase
      .from('contracts')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        sent_to_email: recipientEmail,
        sent_to_phone: smsSent ? recipientPhone : null
      })
      .eq('id', contractId);

    res.json({
      success: true,
      message: 'Contract sent successfully',
      sentTo: recipientEmail,
      signingUrl: contract.signing_url,
      emailSent,
      smsSent,
      emailError,
      smsError
    });
  } catch (error) {
    console.error('Error sending contract:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/contracts/verify/:token
 * @desc    Verify contract token and get contract for signing (public route)
 * @access  Public
 */
router.get('/verify/:token', async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ message: 'Contract token is required' });
    }

    // Find contract by token
    const { data: contract, error } = await supabase
      .from('contracts')
      .select(`
        id,
        contract_token,
        signing_url,
        expires_at,
        status,
        contract_data,
        contract_type,
        lead:leads(id, name, email, phone)
      `)
      .eq('contract_token', token)
      .single();

    if (error || !contract) {
      return res.status(404).json({ message: 'Invalid or expired contract link' });
    }

    // Check if expired
    if (new Date(contract.expires_at) < new Date()) {
      return res.status(410).json({ message: 'This contract link has expired' });
    }

    // Check if already signed
    if (contract.status === 'signed') {
      return res.status(400).json({ message: 'This contract has already been signed' });
    }

    const contractType = contract.contract_type || 'invoice';

    // Generate HTML based on contract type
    let contractHTML, template, financeHTML, financeTemplate;
    if (contractType === 'finance') {
      // Finance: generate BOTH invoice and finance HTMLs (dual document)
      template = await getActiveTemplate();
      contractHTML = generateContractHTML(contract.contract_data, template);
      financeTemplate = await getActiveFinanceTemplate();
      financeHTML = generateFinanceContractHTML(contract.contract_data, financeTemplate);
      console.log('📋 Verify endpoint - returning DUAL documents (invoice + finance)');
    } else {
      template = await getActiveTemplate();
      contractHTML = generateContractHTML(contract.contract_data, template);
      console.log('📋 Verify endpoint - returning template:', template?.id ? `DB template (${template.id})` : 'DEFAULT');
    }

    // Return contract data, template, AND pre-rendered HTML for signing page
    const response = {
      success: true,
      contract: {
        id: contract.id,
        status: contract.status,
        expiresAt: contract.expires_at,
        data: contract.contract_data,
        contractType: contractType
      },
      template: template,
      html: contractHTML,
      contractType: contractType
    };

    // Include finance HTML for dual-document signing
    if (contractType === 'finance' && financeHTML) {
      response.financeHtml = financeHTML;
      response.financeTemplate = financeTemplate;
    }

    res.json(response);
  } catch (error) {
    console.error('Error verifying contract:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/contracts/preview/:token
 * @desc    Generate and return PDF preview for contract (public route)
 * @access  Public
 */
router.get('/preview/:token', async (req, res) => {
  // Helper to return HTML error page (for iframe display)
  const sendHtmlError = (status, title, message) => {
    res.status(status).setHeader('Content-Type', 'text/html').send(`
      <!DOCTYPE html>
      <html>
      <head><title>${title}</title></head>
      <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
        <h1 style="color: #dc2626;">${title}</h1>
        <p style="color: #666;">${message}</p>
      </body>
      </html>
    `);
  };

  try {
    const { token } = req.params;
    console.log('📄 PDF Preview requested for token:', token?.substring(0, 10) + '...');

    if (!token) {
      return sendHtmlError(400, 'Invalid Request', 'Contract token is required');
    }

    // Find contract by token
    const { data: contract, error } = await supabase
      .from('contracts')
      .select('*')
      .eq('contract_token', token)
      .single();

    if (error) {
      console.error('Database error fetching contract:', error);
      return sendHtmlError(404, 'Contract Not Found', 'The contract could not be found in the database.');
    }

    if (!contract) {
      return sendHtmlError(404, 'Contract Not Found', 'Invalid or expired contract link.');
    }

    console.log('📄 Found contract, generating PDF...');
    console.log('Contract data keys:', Object.keys(contract.contract_data || {}));

    // Generate PDF (use correct generator based on contract type)
    const previewContractType = contract.contract_type || 'invoice';
    const pdfBuffer = previewContractType === 'finance'
      ? await generateFinanceContractPDF(contract.contract_data)
      : await generateContractPDF(contract.contract_data);

    console.log('✅ PDF generated successfully, size:', pdfBuffer.length, 'bytes');

    // Set headers for PDF display
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="contract_${contract.id}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('❌ Error generating PDF preview:', error);
    console.error('Stack:', error.stack);
    sendHtmlError(500, 'PDF Generation Failed', `Error: ${error.message}`);
  }
});

/**
 * @route   POST /api/contracts/sign/:token
 * @desc    Submit signatures for a contract (public route)
 * @access  Public
 */
router.post('/sign/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { signatures, updatedData, cardPayDetails } = req.body;

    if (!token) {
      return res.status(400).json({ message: 'Contract token is required' });
    }

    // Verify contract exists and is valid
    const { data: contract, error: fetchError } = await supabase
      .from('contracts')
      .select('*')
      .eq('contract_token', token)
      .single();

    if (fetchError || !contract) {
      return res.status(404).json({ message: 'Invalid contract link' });
    }

    if (contract.status === 'signed') {
      return res.status(400).json({ message: 'This contract has already been signed' });
    }

    if (new Date(contract.expires_at) < new Date()) {
      return res.status(410).json({ message: 'This contract link has expired' });
    }

    // Validate required signatures based on contract type
    const contractType = contract.contract_type || 'invoice';
    if (contractType === 'finance') {
      // Finance requires ALL 7 signatures (5 invoice + 1 finance + 1 card payment)
      const required = ['main', 'notAgency', 'noCancel', 'passDetails', 'happyPurchase', 'customer', 'cardPayment'];
      const missing = required.filter(k => !signatures || !signatures[k]);
      if (missing.length > 0) {
        return res.status(400).json({ message: `Missing signatures: ${missing.join(', ')}` });
      }
    } else {
      if (!signatures || !signatures.main) {
        return res.status(400).json({ message: 'Main signature is required' });
      }
    }

    // Merge signatures and any updated data into contract data
    const signedContractData = {
      ...contract.contract_data,
      ...updatedData,
      signatures: signatures,
      signedAt: new Date().toISOString(),
      ...(cardPayDetails ? { cardPayDetails } : {})
    };

    // Generate signed PDF(s) based on contract type
    let pdfUrl = null;
    let financePdfUrl = null;
    try {
      if (contractType === 'finance') {
        // FINANCE: Generate TWO PDFs (Invoice + Finance Agreement)
        console.log(`📄 Generating dual PDFs for finance contract ${contract.id}...`);

        // 1. Invoice PDF
        const invoicePdfBuffer = await generateContractPDF(signedContractData);
        console.log(`✅ Invoice PDF generated, size: ${invoicePdfBuffer.length} bytes`);
        const invoiceUpload = await uploadToS3(
          invoicePdfBuffer,
          `invoice_${contract.id}_${Date.now()}.pdf`,
          `contracts/${new Date().getFullYear()}`,
          'application/pdf'
        );
        if (invoiceUpload.url) {
          pdfUrl = invoiceUpload.url;
          console.log(`✅ Invoice PDF uploaded to S3: ${pdfUrl}`);
        }

        // 2. Finance Agreement PDF
        const financePdfBuffer = await generateFinanceContractPDF(signedContractData);
        console.log(`✅ Finance PDF generated, size: ${financePdfBuffer.length} bytes`);
        const financeUpload = await uploadToS3(
          financePdfBuffer,
          `finance_${contract.id}_${Date.now()}.pdf`,
          `contracts/${new Date().getFullYear()}`,
          'application/pdf'
        );
        if (financeUpload.url) {
          financePdfUrl = financeUpload.url;
          console.log(`✅ Finance PDF uploaded to S3: ${financePdfUrl}`);
        }

        // Store finance PDF URL in contract data
        signedContractData.financePdfUrl = financePdfUrl;

        // 3. Card Pay Details PDF (saved but NOT emailed to customer)
        if (cardPayDetails) {
          try {
            const cardPayPdfBuffer = await generateCardPayPDF(cardPayDetails, signedContractData);
            console.log(`✅ Card Pay PDF generated, size: ${cardPayPdfBuffer.length} bytes`);
            const cardPayUpload = await uploadToS3(
              cardPayPdfBuffer,
              `cardpay_${contract.id}_${Date.now()}.pdf`,
              `contracts/${new Date().getFullYear()}`,
              'application/pdf'
            );
            if (cardPayUpload.url) {
              signedContractData.cardPayPdfUrl = cardPayUpload.url;
              console.log(`✅ Card Pay PDF uploaded to S3: ${cardPayUpload.url}`);
            }
          } catch (cardPayError) {
            console.error('❌ Error generating Card Pay PDF:', cardPayError.message);
          }
        }
      } else {
        // INVOICE ONLY: Generate single PDF
        console.log(`📄 Generating signed PDF for invoice contract ${contract.id}...`);
        const pdfBuffer = await generateContractPDF(signedContractData);
        console.log(`✅ PDF generated successfully, size: ${pdfBuffer.length} bytes`);

        console.log(`☁️ Uploading PDF to S3...`);
        const uploadResult = await uploadToS3(
          pdfBuffer,
          `contract_${contract.id}_${Date.now()}.pdf`,
          `contracts/${new Date().getFullYear()}`,
          'application/pdf'
        );
        if (uploadResult.url) {
          pdfUrl = uploadResult.url;
          console.log(`✅ PDF uploaded to S3: ${pdfUrl}`);
        } else {
          console.error('❌ S3 upload returned no URL:', uploadResult);
        }
      }
    } catch (pdfError) {
      console.error('❌ Error generating/uploading PDF:', pdfError);
      console.error('Stack:', pdfError.stack);
      // Continue even if PDF fails - signature is still valid
    }

    // Update contract with signatures
    const { data: updated, error: updateError } = await supabase
      .from('contracts')
      .update({
        status: 'signed',
        signed_at: new Date().toISOString(),
        contract_data: signedContractData,
        signed_pdf_url: pdfUrl
      })
      .eq('id', contract.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error saving signature:', updateError);
      return res.status(500).json({ message: 'Failed to save signature', error: updateError.message });
    }

    console.log(`Contract ${contract.id} signed successfully`);

    // === AUTO-ACTIONS AFTER SIGNING ===

    // 1. Fetch selected photos for delivery
    const selectedPhotoIds = signedContractData.selectedPhotoIds || [];
    let photoAttachments = [];

    if (selectedPhotoIds.length > 0) {
      try {
        // Validate photos belong to this lead to prevent cross-lead data mixing
        const { data: photos, error: photosError } = await supabase
          .from('photos')
          .select('id, cloudinary_secure_url, cloudinary_url, filename')
          .in('id', selectedPhotoIds)
          .eq('lead_id', contract.lead_id);

        if (!photosError && photos && photos.length > 0) {
          console.log(`Downloading ${photos.length} photos for delivery (verified for lead ${contract.lead_id})...`);

          for (const photo of photos) {
            try {
              const imageUrl = photo.cloudinary_secure_url || photo.cloudinary_url;
              if (imageUrl) {
                const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
                const filename = photo.filename || `image_${photo.id}.jpg`;
                const ext = filename.split('.').pop()?.toLowerCase() || 'jpg';

                photoAttachments.push({
                  buffer: Buffer.from(response.data),
                  filename: filename,
                  contentType: ext === 'png' ? 'image/png' : 'image/jpeg'
                });
                console.log(`Downloaded photo: ${filename}`);
              }
            } catch (downloadError) {
              console.error(`Failed to download photo ${photo.id}:`, downloadError.message);
            }
          }
        }
      } catch (photoError) {
        console.error('Error fetching photos:', photoError);
      }
    }

    // 2. Create sale record automatically
    let saleRecord = null;
    try {
      const saleId = uuidv4();
      // Store contract and photo info in notes as JSON for retrieval
      const saleNotes = JSON.stringify({
        auto_created: true,
        contract_id: contract.id,
        contract_token: contract.contract_token, // Include token for PDF regeneration
        selected_photo_ids: selectedPhotoIds,
        signed_pdf_url: pdfUrl,
        message: `Auto-created from signed contract`
      });
      console.log(`💰 Creating sale record for contract ${contract.id} with signed_pdf_url: ${pdfUrl ? 'present' : 'missing'}`);
      const saleData = {
        id: saleId,
        lead_id: contract.lead_id,
        user_id: contract.created_by,
        amount: parseFloat(signedContractData.total) || 0,
        payment_method: signedContractData.paymentMethod || 'card',
        payment_type: 'full_payment',
        payment_status: 'Pending',
        status: 'Pending',
        notes: saleNotes,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: insertedSale, error: saleError } = await supabase
        .from('sales')
        .insert(saleData)
        .select()
        .single();

      if (!saleError && insertedSale) {
        saleRecord = insertedSale;
        console.log(`✅ Sale ${saleId} auto-created for signed contract ${contract.id}`);

        // Update lead status to 'Attended' and mark as having a sale
        await supabase
          .from('leads')
          .update({
            status: 'Attended',
            has_sale: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', contract.lead_id);
      } else {
        console.error('Failed to create sale:', saleError);
      }
    } catch (saleError) {
      console.error('Error creating sale:', saleError);
    }

    // 3. Create Finance Agreement for Finance/Ideal4Finance payment methods
    if (signedContractData.paymentMethod === 'finance' ||
        signedContractData.paymentMethod === 'ideal4finance' ||
        signedContractData.paymentMethod === 'payl8r') { // 'payl8r' = legacy Ideal4Finance
      try {
        console.log(`🏦 Creating finance agreement for ${signedContractData.paymentMethod} contract ${contract.id}...`);
        
        const financeAgreementId = uuidv4();
        const financeAmount = parseFloat(signedContractData.financeAmount) || 0;
        const depositAmount = parseFloat(signedContractData.depositAmount) || 0;
        const totalAmount = parseFloat(signedContractData.total) || 0;
        
        // Skip if no finance amount (deposit paid in full)
        if (financeAmount <= 0) {
          console.log(`⚠️ Skipping finance agreement - no remaining finance amount`);
        } else {
          // Get finance configuration from contract data
          const frequency = signedContractData.financeFrequency || 'monthly';
          const startDate = signedContractData.financeStartDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          const dueDay = parseInt(signedContractData.financeDueDay) || 1;
          const duration = parseInt(signedContractData.financeDuration) || 12;
          
          // Calculate finance fields (interest, APR, totals) for storage
          const storedCalc = calculateFinanceFields(signedContractData);

          // Calculate term months based on frequency and duration
          const termMonthsMap = {
            'weekly': Math.ceil(duration / 4.33),
            'bi-weekly': Math.ceil(duration / 2.17),
            'monthly': duration
          };
          const termMonths = termMonthsMap[frequency] || duration;

          // Use calculated totalAmountPayable (includes interest + admin fee)
          // for payment tracking, not just the raw credit amount
          const totalPayable = storedCalc.totalAmountPayable || financeAmount;
          const paymentAmount = duration > 0 ? totalPayable / duration : 0;

          const financeAgreementData = {
            id: financeAgreementId,
            lead_id: contract.lead_id,
            sale_id: saleRecord?.id || null,
            contract_id: contract.id,
            agreement_number: signedContractData.agreementNumber || `FIN-${Date.now().toString().slice(-8)}`,
            total_amount: totalPayable,
            deposit_amount: depositAmount,
            monthly_payment: paymentAmount,
            payment_frequency: frequency,
            term_months: termMonths,
            interest_rate: parseFloat(signedContractData.interestRate) || 0,
            start_date: startDate,
            next_payment_date: startDate,
            status: 'active',
            remaining_balance: totalPayable,
            total_paid: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),

            // Finance contract detail fields
            cash_price: parseFloat(signedContractData.cashPrice) || 0,
            admin_fee: parseFloat(signedContractData.adminFee) || 0,
            apr: storedCalc.apr || 0,
            total_charge_for_credit: storedCalc.totalChargeForCredit || 0,
            total_amount_payable: storedCalc.totalAmountPayable || 0,

            // Customer details
            customer_dob: signedContractData.dateOfBirth || null,
            years_at_address: signedContractData.yearsAtAddress || null,

            // Affordability assessment
            monthly_income: parseFloat(signedContractData.monthlyIncome) || 0,
            priority_outgoings: parseFloat(signedContractData.priorityOutgoings) || 0,
            other_outgoings: parseFloat(signedContractData.otherOutgoings) || 0,
            disposable_balance: storedCalc.disposableBalance || 0,
            agreed_instalment: parseFloat(signedContractData.agreedInstalment) || 0,

            // Creditor info
            creditor_name: signedContractData.creditorName || null,
            creditor_date: signedContractData.creditorDate || null
          };
          
          const { data: insertedFinance, error: financeError } = await supabase
            .from('finance')
            .insert(financeAgreementData)
            .select()
            .single();
          
          if (!financeError && insertedFinance) {
            console.log(`✅ Finance agreement ${financeAgreementId} auto-created for ${signedContractData.paymentMethod}`);
            console.log(`   Total: ${totalAmount}, Deposit: ${depositAmount}, Finance: ${financeAmount}, Payment: ${paymentAmount.toFixed(2)} ${frequency}`);
          } else {
            console.error('❌ Failed to create finance agreement:', financeError);
          }
        }
      } catch (financeCreateError) {
        console.error('❌ Error creating finance agreement:', financeCreateError);
        // Don't fail the contract signing if finance creation fails
      }
    }

    // 4. Send email with signed PDF and images attached
    try {
      const customerEmail = signedContractData.email;
      const customerName = signedContractData.customerName || 'Customer';

      console.log(`📧 Preparing delivery email for ${customerEmail}...`);
      console.log(`📧 PDF URL available: ${pdfUrl ? 'yes' : 'no'}`);
      console.log(`📧 Photo attachments: ${photoAttachments.length}`);

      if (customerEmail) {
        const attachments = [];

        // Add signed PDF(s) as attachments
        const dateStr = new Date().toISOString().split('T')[0];
        if (pdfUrl) {
          try {
            console.log(`📄 Downloading signed invoice PDF from S3: ${pdfUrl}`);
            const pdfResponse = await axios.get(pdfUrl, { responseType: 'arraybuffer', timeout: 30000 });
            attachments.push({
              buffer: Buffer.from(pdfResponse.data),
              filename: contractType === 'finance'
                ? `Auralndn_Invoice_${dateStr}.pdf`
                : `Auralndn_SignedContract_${dateStr}.pdf`,
              contentType: 'application/pdf'
            });
            console.log(`✅ Downloaded invoice PDF for attachment (${pdfResponse.data.length} bytes)`);
          } catch (pdfDownloadError) {
            console.error('❌ Failed to download invoice PDF:', pdfDownloadError.message);
          }
        }
        // Attach finance agreement PDF if available (dual-document finance contracts)
        if (financePdfUrl) {
          try {
            console.log(`📄 Downloading finance agreement PDF from S3: ${financePdfUrl}`);
            const financePdfResponse = await axios.get(financePdfUrl, { responseType: 'arraybuffer', timeout: 30000 });
            attachments.push({
              buffer: Buffer.from(financePdfResponse.data),
              filename: `Auralndn_FinanceAgreement_${dateStr}.pdf`,
              contentType: 'application/pdf'
            });
            console.log(`✅ Downloaded finance PDF for attachment (${financePdfResponse.data.length} bytes)`);
          } catch (finPdfDownloadError) {
            console.error('❌ Failed to download finance PDF:', finPdfDownloadError.message);
          }
        }
        if (!pdfUrl && !financePdfUrl) {
          console.log('⚠️ No PDF URLs available - PDFs will not be attached to email');
        }

        // Zip images if there are any (handles large packages with 100+ images)
        let imagesDownloadUrl = null; // For S3 link if zip is too large
        if (photoAttachments.length > 0) {
          try {
            console.log(`📦 Creating zip file for ${photoAttachments.length} images...`);

            // Create zip in memory with higher compression for large files
            const zipBuffer = await new Promise((resolve, reject) => {
              const chunks = [];
              const archive = archiver('zip', { zlib: { level: 9 } }); // Level 9 = max compression

              archive.on('data', (chunk) => chunks.push(chunk));
              archive.on('end', () => resolve(Buffer.concat(chunks)));
              archive.on('error', (err) => reject(err));

              // Add each photo to the zip
              photoAttachments.forEach((photo, index) => {
                const filename = photo.filename || `image_${index + 1}.jpg`;
                archive.append(photo.buffer, { name: filename });
              });

              archive.finalize();
            });

            const zipFilename = `Auralndn_YourImages_${new Date().toISOString().split('T')[0]}.zip`;
            const zipSizeMB = zipBuffer.length / 1024 / 1024;
            console.log(`✅ Created zip file: ${zipFilename} (${zipSizeMB.toFixed(2)} MB, ${photoAttachments.length} images)`);

            // Gmail has 25MB limit, but base64 encoding adds ~33% overhead
            // Use 15MB threshold to be safe (15 * 1.33 = ~20MB)
            const MAX_ATTACHMENT_SIZE_MB = 15;

            if (zipSizeMB > MAX_ATTACHMENT_SIZE_MB) {
              // Upload to S3 instead of attaching
              console.log(`⚠️ Zip file (${zipSizeMB.toFixed(2)} MB) exceeds ${MAX_ATTACHMENT_SIZE_MB}MB limit - uploading to S3...`);

              try {
                const folder = `delivery-images/${new Date().getFullYear()}`;
                const s3Result = await uploadToS3(zipBuffer, zipFilename, folder, 'application/zip');
                imagesDownloadUrl = s3Result.url;
                console.log(`✅ Zip uploaded to S3: ${imagesDownloadUrl}`);
              } catch (s3Error) {
                console.error('❌ Failed to upload zip to S3:', s3Error.message);
                // Still try to attach - Gmail might accept it
                attachments.push({
                  buffer: zipBuffer,
                  filename: zipFilename,
                  contentType: 'application/zip'
                });
              }
            } else {
              // Small enough to attach directly
              attachments.push({
                buffer: zipBuffer,
                filename: zipFilename,
                contentType: 'application/zip'
              });
            }
          } catch (zipError) {
            console.error('❌ Failed to create zip file:', zipError.message);
            // Fallback: attach images individually if zip fails
            console.log('⚠️ Falling back to individual image attachments...');
            attachments.push(...photoAttachments);
          }
        }

        // Try to fetch contract_delivery template from database
        let emailSubject = 'Your Signed Contract and Selected Images - Auralndn';
        let emailHtml = '';
        let deliveryTemplate = null;

        try {
          const { data: templateData, error: templateError } = await supabase
            .from('templates')
            .select('*')
            .eq('type', 'contract_delivery')
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (!templateError && templateData) {
            deliveryTemplate = templateData;
            console.log(`✅ 📧 USING DATABASE TEMPLATE: "${deliveryTemplate.name}" (ID: ${deliveryTemplate.id})`);
            console.log(`📧 Template settings: send_email=${deliveryTemplate.send_email}, send_sms=${deliveryTemplate.send_sms}`);

            // Process template variables
            const totalFormatted = `£${parseFloat(signedContractData.total || 0).toFixed(2)}`;

            // Build image bullet text based on whether images are attached or on S3
            let bulletImagesText = '';
            if (photoAttachments.length > 0) {
              if (imagesDownloadUrl) {
                bulletImagesText = `<li>Your ${photoAttachments.length} selected images - <a href="${imagesDownloadUrl}" style="color: #2563eb; font-weight: bold;">Click here to download your images (ZIP file)</a></li>`;
              } else {
                bulletImagesText = `<li>Your ${photoAttachments.length} selected images in a ZIP file - simply download and extract to view</li>`;
              }
            }

            // Build individual bullet items
            const bulletContract = pdfUrl
              ? (financePdfUrl
                ? '<li>A copy of your signed Invoice & Order Form (PDF)</li><li>A copy of your signed Finance Agreement (PDF)</li>'
                : '<li>A copy of your signed contract (PDF)</li>')
              : '';
            const bulletImages = bulletImagesText;
            const bulletAgencyList = (signedContractData.recommendedAgencyList || signedContractData.agencyList) ? '<li>Your \'recommended agency list\' is attached to this email</li>' : '';
            const bulletProjectInfluencer = signedContractData.projectInfluencer ? '<li>Your Project Influencer Login details will be issued within 5 days by Project Influencer</li>' : '';
            const bulletEfolio = signedContractData.efolio ? '<li>Your Efolio URL and login details will be issued to you from Auralndn within 7 days</li>' : '';
            const bulletZCard = signedContractData.digitalZCard ? '<li>Your Digital Z-Card will be emailed to you by Auralndn within 7 days</li>' : '';
            const bullet3Lance = (signedContractData.threeLanceCastings || signedContractData['3lanceCastings']) ? '<li>Your 3Lance Castings membership will be activated within 7 days</li>' : '';

            // Build combined bullets - only includes items that are actually in the package
            const allBullets = [bulletContract, bulletImages, bulletAgencyList, bulletProjectInfluencer, bulletEfolio, bulletZCard, bullet3Lance]
              .filter(b => b) // Remove empty strings
              .join('\n');
            const allConditionalBullets = allBullets ? `<ul style="margin: 10px 0; padding-left: 20px;">\n${allBullets}\n</ul>` : '';

            const variables = {
              '{customerName}': customerName,
              '{leadName}': customerName,
              '{customerEmail}': customerEmail,
              '{leadEmail}': customerEmail,
              '{contractTotal}': totalFormatted,
              '{saleAmountFormatted}': totalFormatted,
              '{invoiceNumber}': signedContractData.invoiceNumber || '',
              '{signedDate}': new Date().toLocaleDateString('en-GB'),
              '{signedTime}': new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
              '{photoCount}': photoAttachments.length.toString(),
              '{hasPdf}': pdfUrl ? 'yes' : 'no',
              '{companyName}': 'Auralndn',
              '{imagesDownloadUrl}': imagesDownloadUrl || '',
              // Conditional bullets based on package - only shows if item is in package
              '{bulletContract}': bulletContract,
              '{bulletImages}': bulletImages,
              '{bulletAgencyList}': bulletAgencyList,
              '{bulletProjectInfluencer}': bulletProjectInfluencer,
              '{bulletEfolio}': bulletEfolio,
              '{bulletZCard}': bulletZCard,
              '{bullet3Lance}': bullet3Lance,
              // Combined variable - automatically includes all relevant items
              '{allConditionalBullets}': allConditionalBullets,
              '{attachmentList}': `
                <ul style="margin: 10px 0 0 0; padding-left: 20px;">
                  ${pdfUrl ? (financePdfUrl ? '<li>Your signed Invoice & Order Form (PDF)</li><li>Your signed Finance Agreement (PDF)</li>' : '<li>Your signed contract (PDF)</li>') : ''}
                  ${photoAttachments.length > 0 ? (imagesDownloadUrl ? `<li><a href="${imagesDownloadUrl}">Download your ${photoAttachments.length} images (ZIP)</a></li>` : `<li>Your ${photoAttachments.length} selected images (ZIP file)</li>`) : ''}
                </ul>
              `
            };

            // Replace variables in subject and body
            emailSubject = deliveryTemplate.subject || emailSubject;
            emailHtml = deliveryTemplate.email_body || '';

            Object.entries(variables).forEach(([key, value]) => {
              emailSubject = emailSubject.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
              emailHtml = emailHtml.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
            });
          } else {
            console.log('⚠️ 📧 No active contract_delivery template found in database');
            if (templateError) {
              console.log(`📧 Template lookup error: ${templateError.message}`);
            }
          }
        } catch (templateFetchError) {
          console.error('❌ Error fetching contract_delivery template:', templateFetchError.message);
        }

        // Use default template if none found in database
        if (!emailHtml) {
          console.log('📧 Using HARDCODED DEFAULT template (no database template found)');

          // Build images text for fallback template
          let imagesText = '';
          if (photoAttachments.length > 0) {
            if (imagesDownloadUrl) {
              imagesText = `<li>Your ${photoAttachments.length} selected images - <a href="${imagesDownloadUrl}" style="color: #2563eb; font-weight: bold;">Click here to download your images (ZIP file)</a></li>`;
            } else {
              imagesText = `<li>Your ${photoAttachments.length} selected images in a ZIP file - simply download and extract to view</li>`;
            }
          }

          // Build dynamic bullets for fallback template
          const fallbackBullets = [
            pdfUrl ? (financePdfUrl ? '<li>A copy of your signed Invoice & Order Form (PDF)</li><li>A copy of your signed Finance Agreement (PDF)</li>' : '<li>A copy of your signed contract (PDF)</li>') : '',
            imagesText,
            (signedContractData.recommendedAgencyList || signedContractData.agencyList) ? '<li>Your \'recommended agency list\' is attached to this email</li>' : '',
            signedContractData.projectInfluencer ? '<li>Your Project Influencer Login details will be issued within 5 days by Project Influencer</li>' : '',
            signedContractData.efolio ? '<li>Your Efolio URL and login details will be issued to you from Auralndn within 7 days</li>' : '',
            signedContractData.digitalZCard ? '<li>Your Digital Z-Card will be emailed to you by Auralndn within 7 days</li>' : '',
            (signedContractData.threeLanceCastings || signedContractData['3lanceCastings']) ? '<li>Your 3Lance Castings membership will be activated within 7 days</li>' : ''
          ].filter(b => b).join('\n');

          emailHtml = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; text-align: center; color: white; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0; font-size: 28px; }
    .content { padding: 30px; background: #f9f9f9; }
    .content p { margin: 0 0 15px 0; }
    .highlight { background: #e8f5e9; padding: 15px; border-radius: 8px; margin: 20px 0; }
    .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; background: #f0f0f0; border-radius: 0 0 8px 8px; }
    .footer p { margin: 5px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>AURALNDN</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">Thank You for Your Purchase!</p>
    </div>
    <div class="content">
      <p>Dear ${customerName},</p>
      <p>Thank you for your purchase with Auralndn!</p>
      <p>We hope this is the start of an exciting journey into the world of modelling/influencing.</p>

      <div class="highlight">
        <p style="margin: 0 0 10px 0;"><strong>Please find attached:</strong></p>
        <ul style="margin: 10px 0; padding-left: 20px;">
          ${fallbackBullets}
        </ul>
      </div>

      <p>If you have any questions about your order, please don't hesitate to contact us at <a href="mailto:sales@example.com" style="color: #2563eb;">sales@example.com</a></p>
      <p>Best regards,<br><strong>The Auralndn Team</strong></p>
    </div>
    <div class="footer">
      <p>Auralndn | www.example.com</p>
      <p>129A Weedington Rd, London NW5 4NX</p>
    </div>
  </div>
</body>
</html>`;
        }

        // Process template attachments (e.g., agency list PDF)
        if (deliveryTemplate && deliveryTemplate.attachments) {
          try {
            let templateAttachments = deliveryTemplate.attachments;
            // Parse if string
            if (typeof templateAttachments === 'string') {
              templateAttachments = JSON.parse(templateAttachments);
            }

            if (Array.isArray(templateAttachments) && templateAttachments.length > 0) {
              console.log(`📎 Processing ${templateAttachments.length} template attachment(s)...`);

              for (const attachment of templateAttachments) {
                if (attachment.url) {
                  try {
                    const attachmentName = attachment.originalName || attachment.name || attachment.filename || 'attachment.pdf';
                    console.log(`📎 Downloading template attachment: ${attachmentName}`);
                    const attachmentResponse = await axios.get(attachment.url, {
                      responseType: 'arraybuffer',
                      timeout: 30000
                    });

                    attachments.push({
                      buffer: Buffer.from(attachmentResponse.data),
                      filename: attachmentName,
                      contentType: attachment.mimetype || attachment.contentType || attachment.type || 'application/octet-stream'
                    });

                    console.log(`✅ Downloaded template attachment: ${attachmentName} (${attachmentResponse.data.length} bytes)`);
                  } catch (attachmentError) {
                    console.error(`❌ Failed to download template attachment:`, attachmentError.message);
                  }
                }
              }
            }
          } catch (parseError) {
            console.error('❌ Failed to parse template attachments:', parseError.message);
          }
        }

        let deliveryEmailStatus = {
          sent: false,
          error: null,
          time: new Date().toISOString(),
          to: customerEmail,
          attachmentCount: attachments.length,
          photoCount: photoAttachments.length // Actual number of photos (not zip count)
        };

        // Resolve email account: template > default (no user context in public route)
        let emailAccount = 'primary';
        try {
          const resolution = await emailAccountService.resolveEmailAccount({
            templateId: deliveryTemplate?.id
            // No userId - this is a public contract signing route
          });
          if (resolution.type === 'database' && resolution.account) {
            emailAccount = resolution.account;
            console.log(`📧 Delivery email using: ${resolution.account.email} (database)`);
          } else {
            emailAccount = resolution.accountKey || deliveryTemplate?.email_account || 'primary';
            console.log(`📧 Delivery email using: ${emailAccount} (legacy)`);
          }
        } catch (resolveErr) {
          console.error('📧 Error resolving email account:', resolveErr.message);
          emailAccount = deliveryTemplate?.email_account || 'primary';
        }

        console.log(`📧 ATTACHMENT SUMMARY: ${attachments.length} total attachments`);
        attachments.forEach((att, i) => {
          console.log(`   📎 [${i + 1}] ${att.filename} (${att.contentType}, ${att.buffer?.length || 0} bytes)`);
        });
        console.log(`📧 pdfUrl=${pdfUrl ? 'SET' : 'NULL'}, financePdfUrl=${financePdfUrl ? 'SET' : 'NULL'}, contractType=${contractType}`);

        if (attachments.length > 0) {
          const emailResult = await sendEmail(
            customerEmail,
            emailSubject,
            emailHtml,
            attachments,
            emailAccount
          );

          if (emailResult.success) {
            console.log(`✅ Contract + images email sent to ${customerEmail} with ${attachments.length} attachments`);
            deliveryEmailStatus.sent = true;
          } else {
            console.error('❌ Failed to send email with attachments:', emailResult.error);
            deliveryEmailStatus.error = emailResult.error || 'Failed to send email';
          }
        } else {
          // No attachments, send simple confirmation
          const emailResult = await sendEmail(
            customerEmail,
            'Your Auralndn Contract - Signed Successfully',
            emailHtml,
            [],
            emailAccount
          );

          if (emailResult.success) {
            console.log(`✅ Confirmation email sent to ${customerEmail}`);
            deliveryEmailStatus.sent = true;
          } else {
            console.error('❌ Failed to send confirmation email:', emailResult.error);
            deliveryEmailStatus.error = emailResult.error || 'Failed to send email';
          }
        }

        // Save delivery email status to contract_data
        try {
          const { data: currentContract } = await supabase
            .from('contracts')
            .select('contract_data')
            .eq('id', contract.id)
            .single();

          if (currentContract) {
            const updatedData = {
              ...currentContract.contract_data,
              delivery_email_sent: deliveryEmailStatus.sent,
              delivery_email_time: deliveryEmailStatus.time,
              delivery_email_to: deliveryEmailStatus.to,
              delivery_email_error: deliveryEmailStatus.error,
              delivery_attachment_count: deliveryEmailStatus.attachmentCount,
              delivery_photo_count: deliveryEmailStatus.photoCount
            };

            await supabase
              .from('contracts')
              .update({ contract_data: updatedData })
              .eq('id', contract.id);

            console.log(`📝 Delivery email status saved to contract ${contract.id}: ${deliveryEmailStatus.sent ? 'SUCCESS' : 'FAILED'}`);
          }
        } catch (statusUpdateError) {
          console.error('Failed to save delivery email status:', statusUpdateError.message);
        }

        // Send SMS if template has send_sms enabled
        if (deliveryTemplate && deliveryTemplate.send_sms === true) {
          const customerPhone = signedContractData.phone || contract.lead?.phone;
          if (customerPhone && deliveryTemplate.sms_body) {
            try {
              console.log(`📱 Sending delivery SMS to ${customerPhone}...`);

              // Process SMS variables
              const totalFormatted = `£${parseFloat(signedContractData.total || 0).toFixed(2)}`;
              const smsVariables = {
                '{customerName}': customerName,
                '{leadName}': customerName,
                '{contractTotal}': totalFormatted,
                '{saleAmountFormatted}': totalFormatted,
                '{companyName}': 'Auralndn',
                '{photoCount}': photoAttachments.length.toString()
              };

              let smsBody = deliveryTemplate.sms_body;
              Object.entries(smsVariables).forEach(([key, value]) => {
                smsBody = smsBody.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
              });

              const smsResult = await sendSMS(customerPhone, smsBody);

              if (smsResult.success) {
                console.log(`✅ Delivery SMS sent to ${customerPhone}`);
              } else {
                console.error('❌ Failed to send delivery SMS:', smsResult.error);
              }
            } catch (smsError) {
              console.error('Error sending delivery SMS:', smsError.message);
            }
          } else if (!customerPhone) {
            console.log('⚠️ Delivery SMS enabled but no phone number available');
          } else if (!deliveryTemplate.sms_body) {
            console.log('⚠️ Delivery SMS enabled but no sms_body in template');
          }
        }
      }
    } catch (emailError) {
      console.error('Error sending delivery email:', emailError);

      // Save the error status even if email completely failed
      try {
        const { data: currentContract } = await supabase
          .from('contracts')
          .select('contract_data')
          .eq('id', contract.id)
          .single();

        if (currentContract) {
          const updatedData = {
            ...currentContract.contract_data,
            delivery_email_sent: false,
            delivery_email_time: new Date().toISOString(),
            delivery_email_error: emailError.message || 'Unknown error'
          };

          await supabase
            .from('contracts')
            .update({ contract_data: updatedData })
            .eq('id', contract.id);
        }
      } catch (statusErr) {
        console.error('Failed to save error status:', statusErr.message);
      }
    }

    res.json({
      success: true,
      message: 'Contract signed successfully',
      contractId: contract.id,
      signedAt: updated.signed_at,
      pdfUrl: pdfUrl,
      financePdfUrl: financePdfUrl || null,
      cardPayPdfUrl: signedContractData.cardPayPdfUrl || null
    });
  } catch (error) {
    console.error('Error signing contract:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/contracts/lead/:leadId
 * @desc    Get all contracts for a lead
 * @access  Private
 */
router.get('/lead/:leadId', auth, async (req, res) => {
  try {
    const { leadId } = req.params;

    const { data: contracts, error } = await supabase
      .from('contracts')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ message: 'Failed to fetch contracts', error: error.message });
    }

    res.json({
      success: true,
      contracts: contracts.map(c => ({
        id: c.id,
        status: c.status,
        createdAt: c.created_at,
        sentAt: c.sent_at,
        signedAt: c.signed_at,
        expiresAt: c.expires_at,
        signingUrl: c.signing_url,
        pdfUrl: c.signed_pdf_url,
        packageName: c.contract_data?.notes || 'Contract'
      }))
    });
  } catch (error) {
    console.error('Error fetching contracts:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   PATCH /api/contracts/:contractId/auth-code
 * @desc    Save auth code for a contract (internal use)
 * @access  Private
 * NOTE: This route must come BEFORE /:contractId to avoid route conflicts
 */
router.patch('/:contractId/auth-code', auth, async (req, res) => {
  try {
    const { contractId } = req.params;
    const { authCode } = req.body;

    // Get existing contract
    const { data: contract, error: fetchError } = await supabase
      .from('contracts')
      .select('*')
      .eq('id', contractId)
      .single();

    if (fetchError || !contract) {
      return res.status(404).json({ message: 'Contract not found' });
    }

    // Update contract_data with auth code
    const updatedContractData = {
      ...contract.contract_data,
      authCode: authCode
    };

    const { error: updateError } = await supabase
      .from('contracts')
      .update({
        contract_data: updatedContractData,
        updated_at: new Date().toISOString()
      })
      .eq('id', contractId);

    if (updateError) {
      return res.status(500).json({ message: 'Failed to save auth code', error: updateError.message });
    }

    console.log(`✅ Auth code saved for contract ${contractId}`);

    res.json({
      success: true,
      message: 'Auth code saved successfully'
    });
  } catch (error) {
    console.error('Error saving auth code:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/contracts/:contractId
 * @desc    Get contract details
 * @access  Private
 */
router.get('/:contractId', auth, async (req, res) => {
  try {
    const { contractId } = req.params;

    const { data: contract, error } = await supabase
      .from('contracts')
      .select(`
        *,
        lead:leads(id, name, email, phone)
      `)
      .eq('id', contractId)
      .single();

    if (error || !contract) {
      return res.status(404).json({ message: 'Contract not found' });
    }

    // Extract delivery email info from contract_data
    const contractData = contract.contract_data || {};
    // IMPORTANT: Don't default to false - undefined/null means "still processing"
    // Only use true/false when we have an actual result from sending
    const deliveryEmailSent = contractData.delivery_email_sent !== undefined ? contractData.delivery_email_sent : null;
    const deliveryEmailTime = contractData.delivery_email_time || null;
    const deliveryEmailTo = contractData.delivery_email_to || contractData.email || null;
    const deliveryEmailError = contractData.delivery_email_error || null;
    const deliveryAttachmentCount = contractData.delivery_attachment_count || 0;
    const deliveryPhotoCount = contractData.delivery_photo_count || 0;
    const selectedPhotoCount = contractData.selectedPhotoIds?.length || 0;

    res.json({
      success: true,
      contract: {
        id: contract.id,
        leadId: contract.lead_id,
        lead: contract.lead,
        status: contract.status,
        createdAt: contract.created_at,
        sentAt: contract.sent_at,
        signedAt: contract.signed_at,
        expiresAt: contract.expires_at,
        signingUrl: contract.signing_url,
        pdfUrl: contract.signed_pdf_url,
        signed_pdf_url: contract.signed_pdf_url,
        financePdfUrl: contract.contract_data?.financePdfUrl || null,
        cardPayPdfUrl: contract.contract_data?.cardPayPdfUrl || null,
        data: contract.contract_data,
        // Delivery email info
        deliveryEmailSent: deliveryEmailSent,
        deliveryEmailTime: deliveryEmailTime,
        deliveryEmailTo: deliveryEmailTo,
        deliveryEmailError: deliveryEmailError,
        deliveryAttachmentCount: deliveryAttachmentCount,
        deliveryPhotoCount: deliveryPhotoCount,
        selectedPhotoCount: selectedPhotoCount,
        authCode: contractData.authCode || ''
      }
    });
  } catch (error) {
    console.error('Error fetching contract:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   DELETE /api/contracts/:contractId
 * @desc    Delete/cancel a contract
 * @access  Private (Admin only)
 */
router.delete('/:contractId', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can delete contracts' });
    }

    const { contractId } = req.params;

    const { error } = await supabase
      .from('contracts')
      .delete()
      .eq('id', contractId);

    if (error) {
      return res.status(500).json({ message: 'Failed to delete contract', error: error.message });
    }

    res.json({ success: true, message: 'Contract deleted' });
  } catch (error) {
    console.error('Error deleting contract:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * @route   GET /api/contracts/:contractId/pdf
 * @desc    Generate/download contract PDF
 * @access  Private
 */
router.get('/:contractId/pdf', auth, async (req, res) => {
  try {
    const { contractId } = req.params;

    const { data: contract, error } = await supabase
      .from('contracts')
      .select('*')
      .eq('id', contractId)
      .single();

    if (error || !contract) {
      return res.status(404).json({ message: 'Contract not found' });
    }

    // Generate PDF (use correct generator based on contract type)
    const pdfContractType = contract.contract_type || 'invoice';
    const pdfBuffer = pdfContractType === 'finance'
      ? await generateFinanceContractPDF(contract.contract_data)
      : await generateContractPDF(contract.contract_data);

    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdfContractType === 'finance' ? 'finance_agreement' : 'contract'}_${contractId}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ message: 'Failed to generate PDF', error: error.message });
  }
});

/**
 * @route   POST /api/contracts/:contractId/resend-delivery
 * @desc    Resend the delivery email (signed PDF + images) to customer
 * @access  Private
 */
router.post('/:contractId/resend-delivery', auth, async (req, res) => {
  try {
    const { contractId } = req.params;
    const { email } = req.body; // Optional override email

    // Get contract with all data
    const { data: contract, error: fetchError } = await supabase
      .from('contracts')
      .select('*')
      .eq('id', contractId)
      .single();

    if (fetchError || !contract) {
      return res.status(404).json({ message: 'Contract not found' });
    }

    if (contract.status !== 'signed') {
      return res.status(400).json({ message: 'Contract must be signed before resending delivery email' });
    }

    const contractData = contract.contract_data || {};
    const customerEmail = email || contractData.email;
    const customerName = contractData.customerName || 'Customer';

    if (!customerEmail) {
      return res.status(400).json({ message: 'No email address available' });
    }

    console.log(`📧 Resending delivery email for contract ${contractId} to ${customerEmail}...`);

    const attachments = [];

    const isFinanceContract = contract.contract_type === 'finance';
    const dateStr = new Date().toISOString().split('T')[0];

    // Add signed PDF(s) if available
    if (contract.signed_pdf_url) {
      try {
        console.log(`📄 Downloading signed PDF from: ${contract.signed_pdf_url}`);
        const pdfResponse = await axios.get(contract.signed_pdf_url, { responseType: 'arraybuffer', timeout: 30000 });
        attachments.push({
          buffer: Buffer.from(pdfResponse.data),
          filename: isFinanceContract ? `Auralndn_Invoice_${dateStr}.pdf` : `signed_contract_${contractId}.pdf`,
          contentType: 'application/pdf'
        });
        console.log(`✅ Invoice PDF downloaded (${pdfResponse.data.length} bytes)`);
      } catch (pdfError) {
        console.error('❌ Failed to download signed PDF:', pdfError.message);
      }
    }

    // Attach finance agreement PDF if available (dual-document finance contracts)
    if (contractData.financePdfUrl) {
      try {
        console.log(`📄 Downloading finance PDF from: ${contractData.financePdfUrl}`);
        const finPdfResponse = await axios.get(contractData.financePdfUrl, { responseType: 'arraybuffer', timeout: 30000 });
        attachments.push({
          buffer: Buffer.from(finPdfResponse.data),
          filename: `Auralndn_FinanceAgreement_${dateStr}.pdf`,
          contentType: 'application/pdf'
        });
        console.log(`✅ Finance PDF downloaded (${finPdfResponse.data.length} bytes)`);
      } catch (finPdfError) {
        console.error('❌ Failed to download finance PDF:', finPdfError.message);
      }
    }

    // Get selected photos from contract data
    const selectedPhotoIds = contractData.selectedPhotoIds || [];
    let photoCount = 0;

    if (selectedPhotoIds.length > 0) {
      // Fetch photos from database - validate they belong to this lead
      const { data: photos } = await supabase
        .from('photos')
        .select('id, filename, cloudinary_url, cloudinary_secure_url')
        .in('id', selectedPhotoIds)
        .eq('lead_id', contract.lead_id);

      if (photos && photos.length > 0) {
        console.log(`📸 Found ${photos.length} photos for lead ${contract.lead_id}`);
        for (const photo of photos) {
          try {
            const imageUrl = photo.cloudinary_secure_url || photo.cloudinary_url;
            if (imageUrl) {
              const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
              const extension = imageUrl.split('.').pop()?.split('?')[0] || 'jpg';
              attachments.push({
                buffer: Buffer.from(imageResponse.data),
                filename: photo.filename || `image_${photo.id}.${extension}`,
                contentType: `image/${extension === 'png' ? 'png' : 'jpeg'}`
              });
              photoCount++;
            }
          } catch (imgError) {
            console.error(`Failed to download image ${photo.id}:`, imgError.message);
          }
        }
        console.log(`📸 Downloaded ${photoCount} photos for attachment`);
      }
    }

    if (attachments.length === 0) {
      return res.status(400).json({ message: 'No attachments available to send' });
    }

    // Fetch delivery template
    let emailSubject = 'Your Signed Contract and Selected Images - Auralndn';
    let emailHtml = '';

    try {
      const { data: deliveryTemplate } = await supabase
        .from('templates')
        .select('*')
        .eq('type', 'contract_delivery')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (deliveryTemplate) {
        const totalFormatted = `£${parseFloat(contractData.total || 0).toFixed(2)}`;
        const variables = {
          '{customerName}': customerName,
          '{leadName}': customerName,
          '{customerEmail}': customerEmail,
          '{leadEmail}': customerEmail,
          '{contractTotal}': totalFormatted,
          '{saleAmountFormatted}': totalFormatted,
          '{invoiceNumber}': contractData.invoiceNumber || '',
          '{signedDate}': contract.signed_at ? new Date(contract.signed_at).toLocaleDateString('en-GB') : '',
          '{signedTime}': contract.signed_at ? new Date(contract.signed_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '',
          '{photoCount}': photoCount.toString(),
          '{companyName}': 'Auralndn',
          '{attachmentList}': `
            <ul style="margin: 10px 0 0 0; padding-left: 20px;">
              ${contract.signed_pdf_url ? (contractData.financePdfUrl ? '<li>Your signed Invoice & Order Form (PDF)</li><li>Your signed Finance Agreement (PDF)</li>' : '<li>Your signed contract (PDF)</li>') : ''}
              ${photoCount > 0 ? `<li>Your ${photoCount} selected image${photoCount > 1 ? 's' : ''}</li>` : ''}
            </ul>
          `
        };

        emailSubject = deliveryTemplate.subject || emailSubject;
        emailHtml = deliveryTemplate.email_body || '';

        Object.entries(variables).forEach(([key, value]) => {
          emailSubject = emailSubject.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
          emailHtml = emailHtml.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
        });

        // Process template attachments
        if (deliveryTemplate.attachments) {
          let templateAttachments = deliveryTemplate.attachments;
          if (typeof templateAttachments === 'string') {
            templateAttachments = JSON.parse(templateAttachments);
          }

          if (Array.isArray(templateAttachments) && templateAttachments.length > 0) {
            console.log(`📎 Processing ${templateAttachments.length} template attachment(s)...`);

            for (const attachment of templateAttachments) {
              if (attachment.url) {
                try {
                  const attachmentName = attachment.originalName || attachment.name || attachment.filename || 'attachment.pdf';
                  console.log(`📎 Downloading template attachment: ${attachmentName}`);
                  const attachmentResponse = await axios.get(attachment.url, {
                    responseType: 'arraybuffer',
                    timeout: 30000
                  });

                  attachments.push({
                    buffer: Buffer.from(attachmentResponse.data),
                    filename: attachmentName,
                    contentType: attachment.mimetype || attachment.contentType || attachment.type || 'application/octet-stream'
                  });

                  console.log(`✅ Downloaded template attachment: ${attachmentName} (${attachmentResponse.data.length} bytes)`);
                } catch (attachmentError) {
                  console.error(`❌ Failed to download template attachment:`, attachmentError.message);
                }
              }
            }
          }
        }
      }
    } catch (templateError) {
      console.error('Error fetching template:', templateError.message);
    }

    // Use default template if none found
    if (!emailHtml) {
      emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; text-align: center; color: white; border-radius: 8px 8px 0 0; }
    .content { padding: 30px; background: #f9f9f9; }
    .highlight { background: #e8f5e9; padding: 15px; border-radius: 8px; margin: 20px 0; }
    .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; background: #f0f0f0; border-radius: 0 0 8px 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>AURALNDN</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">Your Images Are Ready!</p>
    </div>
    <div class="content">
      <p>Dear ${customerName},</p>
      <p>Please find attached your signed contract and selected images.</p>
      <div class="highlight">
        <p style="margin: 0;"><strong>Attachments:</strong></p>
        <ul style="margin: 10px 0 0 0; padding-left: 20px;">
          ${contract.signed_pdf_url ? '<li>Signed contract (PDF)</li>' : ''}
          ${photoCount > 0 ? `<li>${photoCount} selected image${photoCount > 1 ? 's' : ''}</li>` : ''}
        </ul>
      </div>
      <p>Best regards,<br><strong>The Auralndn Team</strong></p>
    </div>
    <div class="footer">
      <p><strong>Auralndn</strong></p>
      <p>Email: hello@example.com</p>
    </div>
  </div>
</body>
</html>`;
    }

    // Resolve email account: template > user > default
    let emailAccount = 'primary';
    try {
      const { data: deliveryTemplateForResolution } = await supabase
        .from('templates')
        .select('id, email_account')
        .eq('type', 'contract_delivery')
        .eq('is_active', true)
        .limit(1)
        .single();

      const resolution = await emailAccountService.resolveEmailAccount({
        templateId: deliveryTemplateForResolution?.id,
        userId: req.user?.id
      });
      if (resolution.type === 'database' && resolution.account) {
        emailAccount = resolution.account;
        console.log(`📧 Resend delivery email using: ${resolution.account.email} (database)`);
      } else {
        emailAccount = resolution.accountKey || deliveryTemplateForResolution?.email_account || 'primary';
        console.log(`📧 Resend delivery email using: ${emailAccount} (legacy)`);
      }
    } catch (resolveErr) {
      console.error('📧 Error resolving email account:', resolveErr.message);
    }

    // Send email
    const emailResult = await sendEmail(
      customerEmail,
      emailSubject,
      emailHtml,
      attachments,
      emailAccount
    );

    if (emailResult.success) {
      // Update contract with delivery info
      const updatedContractData = {
        ...contract.contract_data,
        delivery_email_sent: true,
        delivery_email_time: new Date().toISOString(),
        delivery_email_to: customerEmail,
        delivery_photo_count: photoCount,
        delivery_resent_count: (contractData.delivery_resent_count || 0) + 1
      };

      await supabase
        .from('contracts')
        .update({
          contract_data: updatedContractData,
          updated_at: new Date().toISOString()
        })
        .eq('id', contractId);

      console.log(`✅ Delivery email resent to ${customerEmail}`);

      res.json({
        success: true,
        message: 'Delivery email sent successfully',
        sentTo: customerEmail,
        attachments: attachments.length,
        photoCount: photoCount
      });
    } else {
      console.error('❌ Failed to send delivery email:', emailResult.error);
      res.status(500).json({ message: 'Failed to send email', error: emailResult.error });
    }
  } catch (error) {
    console.error('Error resending delivery email:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
