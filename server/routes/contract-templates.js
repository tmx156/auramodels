const express = require('express');
const { auth } = require('../middleware/auth');
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const { generateContractHTML } = require('../utils/contractGenerator');
const { generateFinanceContractHTML, DEFAULT_FINANCE_TEMPLATE } = require('../utils/financeContractGenerator');
const { DEFAULT_LABELS, getLabels } = require('../utils/contractLabels');

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey || config.supabase.anonKey);

const router = express.Router();

/**
 * Keep only known label keys, so a bad payload can't bloat the JSONB column.
 * A label that matches the default (or is blank) isn't stored at all.
 */
function sanitiseLabels(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;

  Object.keys(DEFAULT_LABELS).forEach(key => {
    const value = input[key];
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (trimmed === '' || trimmed === DEFAULT_LABELS[key]) return;
    out[key] = trimmed;
  });

  return out;
}

/** True when Postgres rejected the write because the labels column isn't there yet. */
function isMissingLabelsColumn(error) {
  if (!error) return false;
  const text = `${error.code || ''} ${error.message || ''}`.toLowerCase();
  return text.includes('labels') && (text.includes('column') || text.includes('schema cache'));
}

// Sample contract data for preview - Normal (Card/Cash) mode
const SAMPLE_CONTRACT_DATA_NORMAL = {
  date: new Date(),
  signedAt: null,
  customerNumber: '123456',
  customerName: 'John Doe',
  clientNameIfDifferent: '',
  address: '123 Example Street, London',
  postcode: 'SW1A 1AA',
  phone: '07123 456789',
  email: 'john.doe@email.com',
  isVip: false,
  studioNumber: 'Studio 1',
  photographer: 'Sarah Johnson',
  invoiceNumber: 'INV-00001',
  digitalImages: true,
  digitalImagesQty: '10',
  digitalZCard: false,
  efolio: true,
  efolioUrl: '',
  projectInfluencer: false,
  influencerLogin: '',
  influencerPassword: '',
  allowImageUse: true,
  imagesReceived: 'N.A',
  notes: 'Package: Premium Portfolio Package',
  subtotal: 499.17,
  vatAmount: 99.83,
  total: 599.00,
  paymentMethod: 'card',
  authCode: 'ABC123',
  signatures: {
    main: null,
    notAgency: null,
    noCancel: null,
    passDetails: null,
    happyPurchase: null
  }
};

// Sample contract data for preview - Finance mode
const SAMPLE_CONTRACT_DATA_FINANCE = {
  date: new Date(),
  signedAt: null,
  customerNumber: '123456',
  customerName: 'Jane Smith',
  clientNameIfDifferent: '',
  address: '456 Finance Road, Manchester',
  postcode: 'M1 2AB',
  phone: '07987 654321',
  email: 'jane.smith@email.com',
  isVip: false,
  studioNumber: 'Studio 2',
  photographer: 'Mike Brown',
  invoiceNumber: 'INV-00002',
  digitalImages: true,
  digitalImagesQty: '15',
  digitalZCard: true,
  efolio: true,
  efolioUrl: '',
  projectInfluencer: true,
  influencerLogin: '',
  influencerPassword: '',
  allowImageUse: true,
  imagesReceived: 'N.A',
  notes: 'Package: Ultimate Portfolio Package (Finance)',
  subtotal: 832.50,
  vatAmount: 166.50,
  total: 999.00,
  paymentMethod: 'finance',
  depositAmount: 199.00,
  financeAmount: 800.00,
  authCode: '',
  signatures: {
    main: null,
    notAgency: null,
    noCancel: null,
    passDetails: null,
    happyPurchase: null
  }
};

// Sample contract data for preview - Ideal4Finance mode (identical to finance but with Ideal4Finance branding)
const SAMPLE_CONTRACT_DATA_IDEAL4FINANCE = {
  date: new Date(),
  signedAt: null,
  customerNumber: '123457',
  customerName: 'Alex Ideal',
  clientNameIfDifferent: '',
  address: '789 Ideal Street, Birmingham',
  postcode: 'B1 1AA',
  phone: '07888 999000',
  email: 'alex.ideal@email.com',
  isVip: false,
  studioNumber: 'Studio 3',
  photographer: 'Emma Wilson',
  invoiceNumber: 'INV-00003',
  digitalImages: true,
  digitalImagesQty: '20',
  digitalZCard: true,
  efolio: true,
  efolioUrl: '',
  projectInfluencer: true,
  influencerLogin: '',
  influencerPassword: '',
  allowImageUse: true,
  imagesReceived: 'N.A',
  notes: 'Package: Ultimate Portfolio Package (Ideal4Finance)',
  subtotal: 832.50,
  vatAmount: 166.50,
  total: 999.00,
  paymentMethod: 'ideal4finance',
  depositAmount: 199.00,
  financeAmount: 800.00,
  authCode: '',
  signatures: {
    main: null,
    notAgency: null,
    noCancel: null,
    passDetails: null,
    happyPurchase: null
  }
};

// Sample finance agreement data for preview
const SAMPLE_FINANCE_CONTRACT_DATA = {
  date: new Date(),
  signedAt: null,
  customerName: 'Jane Smith',
  address: '456 Finance Road, Manchester',
  postcode: 'M1 2AB',
  phone: '07987 654321',
  email: 'jane.smith@email.com',
  dateOfBirth: '1990-05-15',
  yearsAtAddress: '3',
  monthlyIncome: 2500,
  priorityOutgoings: 900,
  otherOutgoings: 350,
  agreedInstalment: 85,
  cashPrice: 999,
  deposit: 199,
  adminFee: 25,
  interestRate: 9.9,
  apr: 12.5,
  numberOfInstalments: 12,
  duration: 12,
  repaymentFrequency: 'monthly',
  commencingFrom: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  creditorName: 'Admin User',
  creditorDate: new Date().toISOString(),
  agreementNumber: 'FIN-00001',
  invoiceNumber: 'FIN-00001',
  paymentMethod: 'finance',
  signatures: { customer: null }
};

// Legacy alias for backward compatibility
const SAMPLE_CONTRACT_DATA = SAMPLE_CONTRACT_DATA_NORMAL;

// Default template values (matches current hardcoded template)
const DEFAULT_TEMPLATE = {
  company_name: 'AURALNDN',
  company_website: 'www.example.com',
  company_address: '129A Weedington Rd, London NW5 4NX',
  form_title: 'INVOICE & ORDER FORM',
  form_subtitle: 'PLEASE CHECK YOUR ORDER BEFORE LEAVING YOUR VIEWING',
  form_contact_info: 'FOR ALL ENQUIRIES PLEASE EMAIL CUSTOMER SERVICES ON SALES@EXAMPLE.COM',
  terms_and_conditions: `By signing this invoice, you confirm that you have viewed, selected and approved all images and all cropping, editing and adjustments. You understand that all orders are final and due to the immediate nature of digital delivery this order is strictly non-refundable, non-cancellable and non-amendable once you leave the premises, without affecting your statutory rights. All digital products, including images, efolios and Z-cards and Project Influencer are delivered immediately upon full payment. Project Influencer has been added to this order as a complimentary addition to your purchased package and holds no independent monetary value. By signing you accept responsibility for downloading, backing up and securely storing your files once they are provided. Finance customers must complete all Ideal4Finance documentation prior to receipt of goods. Efolios include 10 images and hosting for 1 year, which may require renewal thereafter; content may be removed if renewal fees are unpaid. You own the copyright to all images purchased and unless you opt out in writing at the time of signing, Auralndn may use your images for promotional purposes (above) including, but not limited to, display on its website and social media channels. You acknowledge that Auralndn is not a talent casting company/agency and does not guarantee work, representation or casting opportunities. Auralndn accepts no liability for compatibility issues, loss of files after delivery, missed opportunities, or indirect losses and total liability is limited to the amount paid for your order. All personal data is processed in accordance with GDPR and used only to fulfil your order or meet legal requirements. By signing below, you acknowledge that you have read, understood and agree to these Terms & Conditions. For any post-delivery assistance, please contact sales@example.com`,
  signature_instruction: 'PLEASE SIGN BELOW TO INDICATE YOUR ACCEPTANCE OF THE ABOVE TERMS, AND ENSURE YOU RECEIVE YOUR OWN SIGNED COPY OF THIS INVOICE FOR YOUR RECORDS',
  footer_line1: 'Auralndn is a trading name of S&A Advertising Ltd',
  footer_line2: 'Company No 8708429 VAT Reg No 171339904',
  confirmation1_text: 'I understand that Auralndn is <strong>not a talent casting company/agency and will not find me work.</strong>',
  confirmation2_text: 'I understand that once I leave the premises I <strong>cannot cancel</strong>, amend or reduce the order.',
  confirmation3_text: 'I confirm that I am happy for Auralndn to <strong>pass on details and photos</strong> of the client named on this order form. Talent Agencies we pass your details to typically charge between £50 - £200 to register onto their books',
  confirmation4_text: "I confirm that I'm happy and comfortable with my decision to purchase.",
  image_permission_text: 'I give permission for Auralndn to use my images',
  image_no_permission_text: 'I DO NOT give permission for Auralndn to use my images',
  // Finance section labels (dynamic - only shown when finance payment selected)
  finance_payment_label: 'DEPOSIT TODAY',
  non_finance_payment_label: 'PAYMENT TODAY',
  finance_deposit_label: 'DEPOSIT PAID',
  finance_amount_label: 'FINANCE AMOUNT',
  finance_provider_text: 'FINANCE VIA IDEAL4FINANCE',
  finance_info_text: 'Complete docs before receipt',
  // Payment section
  cash_initial_text: 'Viewer must initial any cash received and sign here',
  // Every other static label on the contract (headings, table labels, YES/NO, etc.)
  labels: { ...DEFAULT_LABELS }
};

// @route   GET /api/contract-templates
// @desc    Get the active contract template (or default if none exists)
// @access  Private (Admin only)
router.get('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    // Try to get active template from database
    const { data: template, error } = await supabase
      .from('contract_templates')
      .select('*')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching contract template:', error);
      return res.status(500).json({ message: 'Server error' });
    }

    // If no template exists, return the default
    if (!template) {
      return res.json({
        ...DEFAULT_TEMPLATE,
        id: null,
        name: 'Default Contract',
        is_active: true,
        is_default: true
      });
    }

    res.json({ ...template, labels: getLabels(template) });
  } catch (error) {
    console.error('Error fetching contract template:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/contract-templates/active
// @desc    Get the active contract template for PDF generation (internal use)
// @access  Private
router.get('/active', auth, async (req, res) => {
  try {
    const { data: template, error } = await supabase
      .from('contract_templates')
      .select('*')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching contract template:', error);
      return res.status(500).json({ message: 'Server error' });
    }

    // Return template or default (with every static label resolved)
    const active = template || DEFAULT_TEMPLATE;
    res.json({ ...active, labels: getLabels(active) });
  } catch (error) {
    console.error('Error fetching contract template:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/contract-templates/preview
// @desc    Get the actual HTML preview of the contract using the current template
// @access  Private (Admin only)
// @query   mode - 'normal' (default), 'finance', or 'ideal4finance' to show respective payment section preview
router.get('/preview', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    // Get preview mode from query param (default: normal, options: normal, finance, ideal4finance)
    let previewMode = 'normal';
    if (req.query.mode === 'finance') previewMode = 'finance';
    // 'payl8r' is the legacy name for this mode - still accepted so a cached
    // browser tab does not get an unexpected preview
    else if (req.query.mode === 'ideal4finance' || req.query.mode === 'payl8r') previewMode = 'ideal4finance';

    // Get the active template from database or use defaults
    const { data: dbTemplate, error } = await supabase
      .from('contract_templates')
      .select('*')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching contract template:', error);
      return res.status(500).json({ message: 'Server error' });
    }

    const template = dbTemplate || DEFAULT_TEMPLATE;

    // Select sample data and generator based on preview mode
    let sampleData;
    let html;
    if (previewMode === 'finance') {
      // Use the new finance contract generator for finance preview
      sampleData = SAMPLE_FINANCE_CONTRACT_DATA;
      const financeTemplate = {
        ...DEFAULT_FINANCE_TEMPLATE,
        company_name: template.company_name || DEFAULT_FINANCE_TEMPLATE.company_name,
        company_address: template.company_address || DEFAULT_FINANCE_TEMPLATE.company_address,
        company_website: template.company_website || DEFAULT_FINANCE_TEMPLATE.company_website,
        footer_line1: template.footer_line1 || DEFAULT_FINANCE_TEMPLATE.footer_line1,
        footer_line2: template.footer_line2 || DEFAULT_FINANCE_TEMPLATE.footer_line2,
        creditor_trading_as: template.creditor_trading_as || DEFAULT_FINANCE_TEMPLATE.creditor_trading_as,
        key_information_text: template.key_information_text || DEFAULT_FINANCE_TEMPLATE.key_information_text,
        customer_agreement_text: template.customer_agreement_text || DEFAULT_FINANCE_TEMPLATE.customer_agreement_text,
        creditor_acknowledgement_text: template.creditor_acknowledgement_text || DEFAULT_FINANCE_TEMPLATE.creditor_acknowledgement_text,
        cca_notice: template.cca_notice || DEFAULT_FINANCE_TEMPLATE.cca_notice,
        labels: template.labels || {}
      };
      html = generateFinanceContractHTML(sampleData, financeTemplate);
    } else if (previewMode === 'ideal4finance') {
      sampleData = SAMPLE_CONTRACT_DATA_IDEAL4FINANCE;
      html = generateContractHTML(sampleData, template);
    } else {
      sampleData = SAMPLE_CONTRACT_DATA_NORMAL;
      html = generateContractHTML(sampleData, template);
    }

    res.json({
      html,
      previewMode,
      template: {
        ...DEFAULT_TEMPLATE,
        ...template,
        // Always send every label resolved, so the editor shows the text
        // that is actually on the page rather than blank boxes
        labels: getLabels(template),
        id: template.id || null,
        is_default: !dbTemplate
      }
    });
  } catch (error) {
    console.error('Error generating contract preview:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/contract-templates
// @desc    Create or update contract template
// @access  Private (Admin only)
router.post('/', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    const templateData = {
      name: req.body.name || 'Custom Contract',
      is_active: true,
      company_name: req.body.company_name,
      company_website: req.body.company_website,
      company_address: req.body.company_address,
      form_title: req.body.form_title,
      form_subtitle: req.body.form_subtitle,
      form_contact_info: req.body.form_contact_info,
      terms_and_conditions: req.body.terms_and_conditions,
      signature_instruction: req.body.signature_instruction,
      footer_line1: req.body.footer_line1,
      footer_line2: req.body.footer_line2,
      confirmation1_text: req.body.confirmation1_text,
      confirmation2_text: req.body.confirmation2_text,
      confirmation3_text: req.body.confirmation3_text,
      confirmation4_text: req.body.confirmation4_text,
      image_permission_text: req.body.image_permission_text,
      image_no_permission_text: req.body.image_no_permission_text,
      // Finance section labels (dynamic - only shown when finance payment selected)
      finance_payment_label: req.body.finance_payment_label,
      non_finance_payment_label: req.body.non_finance_payment_label,
      finance_deposit_label: req.body.finance_deposit_label,
      finance_amount_label: req.body.finance_amount_label,
      finance_provider_text: req.body.finance_provider_text,
      finance_info_text: req.body.finance_info_text,
      // Payment section
      cash_initial_text: req.body.cash_initial_text,
      // Finance contract template fields
      creditor_trading_as: req.body.creditor_trading_as,
      key_information_text: req.body.key_information_text,
      customer_agreement_text: req.body.customer_agreement_text,
      creditor_acknowledgement_text: req.body.creditor_acknowledgement_text,
      cca_notice: req.body.cca_notice,
      // All remaining static labels live in one JSONB column
      labels: sanitiseLabels(req.body.labels),
      updated_at: new Date().toISOString()
      // Note: created_by removed due to foreign key constraint with users table
    };

    // Check if template already exists
    const { data: existingTemplate, error: checkError } = await supabase
      .from('contract_templates')
      .select('id')
      .eq('is_active', true)
      .limit(1)
      .single();

    let result;

    // Write, and if the labels column hasn't been added yet, save everything
    // else rather than losing the user's edit entirely.
    const write = async (payload) => {
      if (existingTemplate) {
        return supabase
          .from('contract_templates')
          .update(payload)
          .eq('id', existingTemplate.id)
          .select('*')
          .single();
      }
      return supabase
        .from('contract_templates')
        .insert([{ ...payload, created_at: new Date().toISOString() }])
        .select('*')
        .single();
    };

    let { data, error } = await write(templateData);

    if (error && isMissingLabelsColumn(error)) {
      console.warn('⚠️ contract_templates.labels column missing - run migrations/add-contract-labels-jsonb.sql');
      const { labels, ...withoutLabels } = templateData;
      ({ data, error } = await write(withoutLabels));
    }

    if (error) {
      console.error('Error saving contract template:', error);
      return res.status(500).json({ message: 'Server error', error: error.message });
    }

    result = data;
    console.log(existingTemplate ? 'Contract template updated:' : 'Contract template created:', result.id);

    res.json({
      message: 'Contract template saved successfully',
      template: { ...result, labels: getLabels(result) }
    });
  } catch (error) {
    console.error('Error saving contract template:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/contract-templates/reset
// @desc    Reset contract template to defaults
// @access  Private (Admin only)
router.post('/reset', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin only.' });
    }

    // Delete all existing templates
    const { error: deleteError } = await supabase
      .from('contract_templates')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (deleteError) {
      console.error('Error resetting contract template:', deleteError);
      return res.status(500).json({ message: 'Server error' });
    }

    console.log('Contract template reset to defaults');

    res.json({
      message: 'Contract template reset to defaults',
      template: {
        ...DEFAULT_TEMPLATE,
        id: null,
        name: 'Default Contract',
        is_active: true,
        is_default: true
      }
    });
  } catch (error) {
    console.error('Error resetting contract template:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Export default template for use in contractGenerator
router.DEFAULT_TEMPLATE = DEFAULT_TEMPLATE;

module.exports = router;
