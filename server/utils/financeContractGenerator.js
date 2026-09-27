/**
 * Finance Contract Generator
 * Generates HTML/PDF for "Finance Agreement & Affordability Assessment"
 * CCA 1974 regulated, 2-page contract with 1 customer signature
 */

const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const { getLabels } = require('./contractLabels');

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey || config.supabase.anonKey);

// Default finance template values
const DEFAULT_FINANCE_TEMPLATE = {
  company_name: 'AURALNDN',
  company_address: '129A Weedington Rd, London NW5 4NX',
  company_website: 'www.example.com',
  creditor_trading_as: 'S&A Advertising Ltd',
  key_information_text: 'This is a credit agreement regulated by the Consumer Credit Act 1974. By signing this agreement, you are confirming that you wish to enter into a credit arrangement with the creditor named above. You have the right to withdraw from this agreement within 14 days of signing without giving any reason. If you withdraw, you must repay the credit and any interest accrued within 30 days. If you do not keep up repayments, your account will go into arrears and this may affect your credit rating. The creditor may take legal action to recover any outstanding balance. Please ensure you have read and understood all terms before signing.',
  customer_agreement_text: 'I confirm that the information provided is true and accurate. I understand the terms of this credit agreement and agree to make payments as outlined above. I acknowledge that failure to maintain payments may result in additional charges and may affect my credit rating.',
  creditor_acknowledgement_text: 'The creditor confirms that the affordability assessment has been conducted and the customer has been provided with adequate pre-contract information in accordance with the Consumer Credit Act 1974.',
  cca_notice: 'This is a Credit Agreement regulated by the Consumer Credit Act 1974. Sign it only if you want to be legally bound by its terms. Under the Consumer Credit Act 1974, you have the right to withdraw from this agreement within 14 days.',
  footer_line1: 'Auralndn is a trading name of S&A Advertising Ltd',
  footer_line2: 'Company No 8708429 VAT Reg No 171339904'
};

/**
 * Get active finance template from database or return defaults
 */
async function getActiveFinanceTemplate() {
  try {
    const { data: template, error } = await supabase
      .from('contract_templates')
      .select('*')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.warn('⚠️ Error fetching finance template:', error.message);
      return DEFAULT_FINANCE_TEMPLATE;
    }

    if (template && template.id) {
      // Merge: use finance-specific fields from DB template if they exist, otherwise defaults
      return {
        ...DEFAULT_FINANCE_TEMPLATE,
        company_name: template.company_name || DEFAULT_FINANCE_TEMPLATE.company_name,
        company_address: template.company_address || DEFAULT_FINANCE_TEMPLATE.company_address,
        company_website: template.company_website || DEFAULT_FINANCE_TEMPLATE.company_website,
        footer_line1: template.footer_line1 || DEFAULT_FINANCE_TEMPLATE.footer_line1,
        footer_line2: template.footer_line2 || DEFAULT_FINANCE_TEMPLATE.footer_line2,
        // Finance-specific fields from template if saved
        creditor_trading_as: template.creditor_trading_as || DEFAULT_FINANCE_TEMPLATE.creditor_trading_as,
        key_information_text: template.key_information_text || DEFAULT_FINANCE_TEMPLATE.key_information_text,
        customer_agreement_text: template.customer_agreement_text || DEFAULT_FINANCE_TEMPLATE.customer_agreement_text,
        creditor_acknowledgement_text: template.creditor_acknowledgement_text || DEFAULT_FINANCE_TEMPLATE.creditor_acknowledgement_text,
        cca_notice: template.cca_notice || DEFAULT_FINANCE_TEMPLATE.cca_notice,
        // Static label overrides (headings, row labels) live in one JSONB column
        labels: template.labels || {}
      };
    }

    return DEFAULT_FINANCE_TEMPLATE;
  } catch (err) {
    console.warn('⚠️ Exception fetching finance template:', err.message);
    return DEFAULT_FINANCE_TEMPLATE;
  }
}

/**
 * Format currency value
 */
function formatCurrency(amount) {
  return `£${parseFloat(amount || 0).toFixed(2)}`;
}

/**
 * Format date as DD/MM/YYYY
 */
function formatDate(date) {
  const d = new Date(date || new Date());
  return d.toLocaleDateString('en-GB');
}

/**
 * Calculate all finance fields from input data
 */
function calculateFinanceFields(data) {
  const cashPrice = parseFloat(data.cashPrice) || 0;
  const deposit = parseFloat(data.deposit) || 0;
  const interestRate = parseFloat(data.interestRate) || 0;
  const adminFee = parseFloat(data.adminFee) || 0;
  const numberOfInstalments = parseInt(data.numberOfInstalments) || 12;
  const duration = parseInt(data.duration) || 12;
  const monthlyIncome = parseFloat(data.monthlyIncome) || 0;
  const priorityOutgoings = parseFloat(data.priorityOutgoings) || 0;
  const otherOutgoings = parseFloat(data.otherOutgoings) || 0;

  const amountOfCredit = cashPrice - deposit;
  const interest = amountOfCredit * (interestRate / 100) * (duration / 12);
  const totalChargeForCredit = interest + adminFee;
  const totalAmountPayable = amountOfCredit + totalChargeForCredit;
  const monthlyRepayment = numberOfInstalments > 0 ? totalAmountPayable / numberOfInstalments : 0;
  const dailyRateOfInterest = interestRate / 365;
  const disposableBalance = monthlyIncome - priorityOutgoings - otherOutgoings;
  const totalExpenditure = priorityOutgoings + otherOutgoings;
  const apr = amountOfCredit > 0 && duration > 0
    ? (totalChargeForCredit / amountOfCredit) * (12 / duration) * 100
    : 0;

  return {
    amountOfCredit,
    interest,
    totalChargeForCredit,
    totalAmountPayable,
    monthlyRepayment,
    dailyRateOfInterest,
    disposableBalance,
    totalExpenditure,
    apr
  };
}

/**
 * Generate the Finance Agreement HTML (2-page layout)
 */
function generateFinanceContractHTML(contractData, template = DEFAULT_FINANCE_TEMPLATE) {
  const t = template && template.company_name ? template : DEFAULT_FINANCE_TEMPLATE;
  const d = contractData;

  // Resolve every static label (defaults + whatever the editor has overridden)
  const L = getLabels(t);

  // Calculate derived fields
  const calc = calculateFinanceFields(d);

  const page1HTML = `
    <div class="page" style="padding: 30px; font-family: Arial, sans-serif; font-size: 11px; background: white;">
      <!-- Header -->
      <div data-editable="fin_header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px; border-bottom: 2px solid #1a1a2e; padding-bottom: 10px;">
        <div>
          <h1 style="font-size: 24px; font-weight: bold; letter-spacing: 2px; margin: 0; color: #1a1a2e;">${t.company_name}</h1>
          <p style="font-size: 9px; margin: 3px 0 0 0; color: #666;">${t.company_address}</p>
        </div>
        <div style="text-align: right;">
          <h2 style="font-size: 14px; font-weight: bold; margin: 0; color: #1a1a2e;">${L.fin_doc_title}</h2>
          <h3 style="font-size: 11px; font-weight: bold; margin: 2px 0 0 0; color: #1a1a2e;">${L.fin_doc_subtitle}</h3>
          <p style="font-size: 9px; margin: 5px 0 0 0; color: #666;">${L.fin_date_label} ${formatDate(d.date)}</p>
          <p style="font-size: 8px; margin: 2px 0 0 0; color: #999;">${L.fin_ref_label} ${d.agreementNumber || d.invoiceNumber || ''}</p>
        </div>
      </div>

      <!-- Section 1: Customer Information -->
      <div data-editable="fin_section1" style="margin-bottom: 12px;">
        <div style="background: #1a1a2e; color: white; padding: 5px 10px; font-weight: bold; font-size: 11px; margin-bottom: 0;">
          ${L.fin_section1_heading}
        </div>
        <table style="width: 100%; border-collapse: collapse; border: 1px solid #333; font-size: 10px;">
          <tr style="border-bottom: 1px solid #ccc;">
            <td style="padding: 6px 10px; width: 30%; color: #666; border-right: 1px solid #ccc;">${L.fin_s1_name}</td>
            <td style="padding: 6px 10px; font-weight: 500;">${d.customerName || ''}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ccc;">
            <td style="padding: 6px 10px; color: #666; border-right: 1px solid #ccc;">${L.fin_s1_address}</td>
            <td style="padding: 6px 10px; font-weight: 500;">${d.address || ''}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ccc;">
            <td style="padding: 6px 10px; color: #666; border-right: 1px solid #ccc;">${L.fin_s1_postcode}</td>
            <td style="padding: 6px 10px; font-weight: 500;">${d.postcode || ''}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ccc;">
            <td style="padding: 6px 10px; color: #666; border-right: 1px solid #ccc;">${L.fin_s1_dob}</td>
            <td style="padding: 6px 10px; font-weight: 500;">${d.dateOfBirth ? formatDate(d.dateOfBirth) : ''}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ccc;">
            <td style="padding: 6px 10px; color: #666; border-right: 1px solid #ccc;">${L.fin_s1_years}</td>
            <td style="padding: 6px 10px; font-weight: 500;">${d.yearsAtAddress || ''}</td>
          </tr>
          <tr>
            <td style="padding: 6px 10px; color: #666; border-right: 1px solid #ccc;">${L.fin_s1_mobile}</td>
            <td style="padding: 6px 10px; font-weight: 500;">${d.phone || ''}</td>
          </tr>
        </table>
      </div>

      <!-- Section 2: Affordability Assessment -->
      <div data-editable="fin_section2" style="margin-bottom: 12px;">
        <div style="background: #1a1a2e; color: white; padding: 5px 10px; font-weight: bold; font-size: 11px; margin-bottom: 0;">
          ${L.fin_section2_heading}
        </div>
        <table style="width: 100%; border-collapse: collapse; border: 1px solid #333; font-size: 10px;">
          <tr style="border-bottom: 1px solid #ccc;">
            <td style="padding: 6px 10px; width: 60%; color: #666; border-right: 1px solid #ccc;">${L.fin_s2_income}</td>
            <td style="padding: 6px 10px; font-weight: 500; text-align: right;">${formatCurrency(d.monthlyIncome)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ccc;">
            <td style="padding: 6px 10px; color: #666; border-right: 1px solid #ccc;">${L.fin_s2_priority}</td>
            <td style="padding: 6px 10px; font-weight: 500; text-align: right;">${formatCurrency(d.priorityOutgoings)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ccc;">
            <td style="padding: 6px 10px; color: #666; border-right: 1px solid #ccc;">${L.fin_s2_other}</td>
            <td style="padding: 6px 10px; font-weight: 500; text-align: right;">${formatCurrency(d.otherOutgoings)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ccc; background: #f0f9ff;">
            <td style="padding: 6px 10px; font-weight: bold; border-right: 1px solid #ccc;">${L.fin_s2_disposable}</td>
            <td style="padding: 6px 10px; font-weight: bold; text-align: right;">${formatCurrency(calc.disposableBalance)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ccc; background: #f0f9ff;">
            <td style="padding: 6px 10px; font-weight: bold; border-right: 1px solid #ccc;">${L.fin_s2_expenditure}</td>
            <td style="padding: 6px 10px; font-weight: bold; text-align: right;">${formatCurrency(calc.totalExpenditure)}</td>
          </tr>
          <tr style="background: #fef3c7;">
            <td style="padding: 6px 10px; font-weight: bold; border-right: 1px solid #ccc;">${L.fin_s2_instalment}</td>
            <td style="padding: 6px 10px; font-weight: bold; text-align: right; font-size: 12px;">${formatCurrency(d.agreedInstalment)}</td>
          </tr>
        </table>
      </div>

      <!-- Section 3: Loan & Repayment Terms -->
      <div data-editable="fin_section3" style="margin-bottom: 12px;">
        <div style="background: #1a1a2e; color: white; padding: 5px 10px; font-weight: bold; font-size: 11px; margin-bottom: 0;">
          ${L.fin_section3_heading}
        </div>
        <table style="width: 100%; border-collapse: collapse; border: 1px solid #333; font-size: 10px;">
          <tr style="border-bottom: 1px solid #ccc;">
            <td style="padding: 5px 10px; width: 50%; color: #666; border-right: 1px solid #ccc;">${L.fin_s3_cash_price}</td>
            <td style="padding: 5px 10px; font-weight: 500; text-align: right;">${formatCurrency(d.cashPrice)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ccc;">
            <td style="padding: 5px 10px; color: #666; border-right: 1px solid #ccc;">${L.fin_s3_deposit}</td>
            <td style="padding: 5px 10px; font-weight: 500; text-align: right;">${formatCurrency(d.deposit)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ccc; background: #f0f9ff;">
            <td style="padding: 5px 10px; font-weight: bold; border-right: 1px solid #ccc;">${L.fin_s3_credit}</td>
            <td style="padding: 5px 10px; font-weight: bold; text-align: right;">${formatCurrency(calc.amountOfCredit)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ccc;">
            <td style="padding: 5px 10px; color: #666; border-right: 1px solid #ccc;">${L.fin_s3_interest}</td>
            <td style="padding: 5px 10px; font-weight: 500; text-align: right;">${formatCurrency(calc.interest)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ccc;">
            <td style="padding: 5px 10px; color: #666; border-right: 1px solid #ccc;">${L.fin_s3_admin_fee}</td>
            <td style="padding: 5px 10px; font-weight: 500; text-align: right;">${formatCurrency(d.adminFee)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ccc; background: #f0f9ff;">
            <td style="padding: 5px 10px; font-weight: bold; border-right: 1px solid #ccc;">${L.fin_s3_total_charge}</td>
            <td style="padding: 5px 10px; font-weight: bold; text-align: right;">${formatCurrency(calc.totalChargeForCredit)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ccc; background: #fef3c7;">
            <td style="padding: 5px 10px; font-weight: bold; border-right: 1px solid #ccc;">${L.fin_s3_total_payable}</td>
            <td style="padding: 5px 10px; font-weight: bold; text-align: right; font-size: 12px;">${formatCurrency(calc.totalAmountPayable)}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ccc;">
            <td style="padding: 5px 10px; color: #666; border-right: 1px solid #ccc;">${L.fin_s3_instalments}</td>
            <td style="padding: 5px 10px; font-weight: 500; text-align: right;">${d.numberOfInstalments || 12}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ccc;">
            <td style="padding: 5px 10px; color: #666; border-right: 1px solid #ccc;">${L.fin_s3_duration}</td>
            <td style="padding: 5px 10px; font-weight: 500; text-align: right;">${d.duration || 12}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ccc;">
            <td style="padding: 5px 10px; color: #666; border-right: 1px solid #ccc;">${L.fin_s3_rate}</td>
            <td style="padding: 5px 10px; font-weight: 500; text-align: right;">${parseFloat(d.interestRate || 0).toFixed(1)}%</td>
          </tr>
          <tr>
            <td style="padding: 5px 10px; color: #666; border-right: 1px solid #ccc;">${L.fin_s3_apr}</td>
            <td style="padding: 5px 10px; font-weight: 500; text-align: right;">${calc.apr.toFixed(1)}%</td>
          </tr>
        </table>
      </div>

      <!-- Footer -->
      <div data-editable="footer" style="text-align: center; font-size: 8px; color: #999; padding-top: 8px;">
        <p style="margin: 1px 0;">${t.footer_line1}</p>
        <p style="margin: 1px 0;">${t.footer_line2}</p>
      </div>
    </div>
  `;

  const page2HTML = `
    <div class="page" style="padding: 30px; font-family: Arial, sans-serif; font-size: 11px; background: white; page-break-before: always;">
      <!-- Header -->
      <div data-editable="fin_page2_header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; border-bottom: 2px solid #1a1a2e; padding-bottom: 8px;">
        <h1 style="font-size: 18px; font-weight: bold; letter-spacing: 2px; margin: 0; color: #1a1a2e;">${t.company_name}</h1>
        <div style="text-align: right;">
          <p style="font-size: 10px; margin: 0; font-weight: bold;">${L.fin_page2_title}</p>
          <p style="font-size: 9px; margin: 2px 0 0 0; color: #666;">${d.customerName || ''} - ${formatDate(d.date)}</p>
        </div>
      </div>

      <!-- Section 4: Repayment Schedule -->
      <div data-editable="fin_section4" style="margin-bottom: 15px;">
        <div style="background: #1a1a2e; color: white; padding: 5px 10px; font-weight: bold; font-size: 11px; margin-bottom: 0;">
          ${L.fin_section4_heading}
        </div>
        <table style="width: 100%; border-collapse: collapse; border: 1px solid #333; font-size: 10px;">
          <tr style="border-bottom: 1px solid #ccc;">
            <td style="padding: 6px 10px; width: 50%; color: #666; border-right: 1px solid #ccc;">${L.fin_s4_frequency}</td>
            <td style="padding: 6px 10px; font-weight: 500; text-transform: capitalize;">${d.repaymentFrequency || 'Monthly'}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ccc;">
            <td style="padding: 6px 10px; color: #666; border-right: 1px solid #ccc;">${L.fin_s4_commencing}</td>
            <td style="padding: 6px 10px; font-weight: 500;">${d.commencingFrom ? formatDate(d.commencingFrom) : ''}</td>
          </tr>
          <tr style="border-bottom: 1px solid #ccc; background: #fef3c7;">
            <td style="padding: 6px 10px; font-weight: bold; border-right: 1px solid #ccc;">${L.fin_s4_monthly}</td>
            <td style="padding: 6px 10px; font-weight: bold; font-size: 12px;">${formatCurrency(calc.monthlyRepayment)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 10px; color: #666; border-right: 1px solid #ccc;">${L.fin_s4_daily_rate}</td>
            <td style="padding: 6px 10px; font-weight: 500;">${calc.dailyRateOfInterest.toFixed(4)}%</td>
          </tr>
        </table>
      </div>

      <!-- Section 5: Key Information & Acknowledgement -->
      <div data-editable="key_information" style="margin-bottom: 15px;">
        <div style="background: #1a1a2e; color: white; padding: 5px 10px; font-weight: bold; font-size: 11px; margin-bottom: 0;">
          ${L.fin_section5_heading}
        </div>
        <div style="border: 1px solid #333; border-top: none; padding: 10px; font-size: 9px; line-height: 1.4; color: #444;">
          ${t.key_information_text}
        </div>
      </div>

      <!-- Section 6: Execution -->
      <div data-editable="fin_section6" style="margin-bottom: 15px;">
        <div style="background: #1a1a2e; color: white; padding: 5px 10px; font-weight: bold; font-size: 11px; margin-bottom: 0;">
          ${L.fin_section6_heading}
        </div>
        <div style="border: 1px solid #333; border-top: none;">
          <!-- CCA Notice -->
          <div data-editable="finance_cca" style="padding: 8px 10px; font-size: 8px; color: #666; border-bottom: 1px solid #ccc; background: #fff8dc; font-style: italic;">
            ${t.cca_notice}
          </div>

          <!-- Creditor Info -->
          <div data-editable="finance_creditor" style="padding: 8px 10px; border-bottom: 1px solid #ccc;">
            <p style="font-size: 9px; color: #666; margin: 0 0 3px 0;">${L.fin_s6_creditor_label}</p>
            <p style="font-weight: bold; margin: 0; font-size: 11px;">${t.company_name}</p>
            <p style="font-size: 9px; margin: 2px 0 0 0; color: #555;">${L.fin_s6_trading_as_label} ${t.creditor_trading_as}</p>
            <p style="font-size: 9px; margin: 2px 0 0 0; color: #555;">${t.company_address}</p>
          </div>

          <!-- Customer Signature -->
          <div data-editable="finance_agreements" style="padding: 10px; border-bottom: 1px solid #ccc;">
            <p style="font-size: 9px; color: #666; margin: 0 0 3px 0;">${L.fin_s6_customer_agreement_label}</p>
            <p style="font-size: 8px; color: #555; margin: 0 0 8px 0; line-height: 1.3;">${t.customer_agreement_text}</p>
            <div style="display: flex; gap: 20px; align-items: flex-end;">
              <div style="flex: 1;">
                <p style="font-size: 9px; font-weight: bold; margin: 0 0 5px 0;">${L.fin_s6_customer_signature_label}</p>
                <div data-signature="customer" style="border: 2px solid #333; min-height: 70px; padding: 5px;">
                  ${d.signatures?.customer ? `<img src="${d.signatures.customer}" style="max-height: 60px; max-width: 250px;" />` : ''}
                </div>
              </div>
              <div style="width: 120px; text-align: center;">
                <p style="font-size: 9px; font-weight: bold; margin: 0 0 5px 0;">${L.fin_s6_date_label}</p>
                <div style="border: 1px solid #333; padding: 8px; font-weight: 500; font-size: 10px;">
                  ${d.signedAt ? formatDate(d.signedAt) : formatDate(new Date())}
                </div>
              </div>
            </div>
          </div>

          <!-- Creditor Signature (auto-populated text, not drawn) -->
          <div data-editable="finance_agreements" style="padding: 10px;">
            <p style="font-size: 9px; color: #666; margin: 0 0 3px 0;">${L.fin_s6_creditor_ack_label}</p>
            <p style="font-size: 8px; color: #555; margin: 0 0 8px 0; line-height: 1.3;">${t.creditor_acknowledgement_text}</p>
            <div style="display: flex; gap: 20px; align-items: flex-end;">
              <div style="flex: 1;">
                <p style="font-size: 9px; font-weight: bold; margin: 0 0 5px 0;">${L.fin_s6_creditor_signatory_label}</p>
                <div style="border: 1px solid #999; min-height: 40px; padding: 8px; background: #f9f9f9;">
                  <span style="font-size: 14px; font-family: 'Brush Script MT', 'Segoe Script', cursive; color: #1a1a2e;">${d.creditorName || ''}</span>
                </div>
              </div>
              <div style="width: 120px; text-align: center;">
                <p style="font-size: 9px; font-weight: bold; margin: 0 0 5px 0;">${L.fin_s6_date_label}</p>
                <div style="border: 1px solid #999; padding: 8px; font-weight: 500; font-size: 10px; background: #f9f9f9;">
                  ${formatDate(d.creditorDate || d.date)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div data-editable="footer" style="text-align: center; font-size: 8px; color: #999; padding-top: 5px;">
        <p style="margin: 1px 0;">${t.footer_line1}</p>
        <p style="margin: 1px 0;">${t.footer_line2}</p>
      </div>
    </div>
  `;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { margin: 0; padding: 0; }
        .page { width: 210mm; min-height: 297mm; }
        @media print {
          .page { page-break-after: always; }
        }
      </style>
    </head>
    <body>
      ${page1HTML}
      ${page2HTML}
    </body>
    </html>
  `;
}

/**
 * Generate Finance Contract PDF using Puppeteer
 */
async function generateFinanceContractPDF(contractData) {
  let browser = null;

  try {
    console.log('🔄 Starting Puppeteer PDF generation for finance contract...');

    const template = await getActiveFinanceTemplate();
    const html = generateFinanceContractHTML(contractData, template);

    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' }
    });

    console.log('✅ Finance PDF generated successfully, size:', pdfBuffer.length, 'bytes');
    return Buffer.from(pdfBuffer);
  } catch (error) {
    console.error('❌ Error generating finance PDF:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Generate Card Pay Details HTML (single page)
 */
function generateCardPayHTML(cardDetails, contractData) {
  const d = cardDetails || {};
  const sig = d.signature || '';
  const sigDate = d.date ? new Date(d.date).toLocaleDateString('en-GB') : '';

  return `
    <!DOCTYPE html>
    <html>
    <head><style>
      body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
      .page { width: 794px; min-height: 1123px; padding: 50px 60px; box-sizing: border-box; background: white; position: relative; }
      .title { text-align: center; font-size: 28px; font-weight: bold; margin-bottom: 40px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
      td { padding: 12px 15px; border: 1px solid #333; font-size: 14px; }
      td.label { font-weight: bold; width: 45%; background: #f9f9f9; }
      td.value { width: 55%; }
      .sig-section { margin-top: 30px; display: flex; gap: 20px; align-items: flex-start; }
      .sig-box { border: 1px solid #333; width: 250px; min-height: 100px; padding: 5px; }
      .sig-box p { margin: 0 0 5px; font-weight: bold; font-size: 12px; }
      .sig-box img { max-width: 240px; max-height: 80px; }
      .sig-text { font-size: 13px; line-height: 1.5; padding-top: 10px; }
      .date-box { border: 1px solid #333; padding: 10px 15px; margin-top: 15px; font-weight: bold; font-size: 14px; display: inline-block; min-width: 200px; }
      .footer { position: absolute; bottom: 40px; left: 0; right: 0; text-align: center; font-size: 11px; color: #666; }
    </style></head>
    <body>
      <div class="page">
        <div class="title">AURALNDN</div>
        <table>
          <tr><td class="label">FULL NAME ON CARD:</td><td class="value">${d.fullNameOnCard || ''}</td></tr>
          <tr><td class="label">CARD NUMBER:</td><td class="value">${d.cardNumber || ''}</td></tr>
          <tr><td class="label">EXPIRY DATE:</td><td class="value">${d.expiryDate || ''}</td></tr>
          <tr><td class="label">SECURITY PIN (CSV):</td><td class="value">${d.securityPin || ''}</td></tr>
          <tr><td class="label">NUMBER OF PAYMENTS:</td><td class="value">${d.numberOfPayments || ''}</td></tr>
          <tr><td class="label">PAYMENT AMOUNT:</td><td class="value">&pound; ${d.paymentAmount || ''}</td></tr>
          <tr><td class="label">TOTAL AMOUNT OF PAYMENTS:</td><td class="value">&pound; ${d.totalAmount || ''}</td></tr>
        </table>

        <div class="sig-section">
          <div class="sig-box">
            <p>SIGNATURE</p>
            ${sig ? `<img src="${sig}" />` : '<div style="height:80px;"></div>'}
          </div>
          <div class="sig-text">
            I hereby authorise Auralndn to charge the specified payment(s) to my card for the purpose of settling my finance agreement.
          </div>
        </div>

        <div class="date-box">DATE: ${sigDate}</div>

        <div class="footer">
          <p>AURALNDN IS A TRADING NAME OF S&A ADVERTISING LTD</p>
          <p>COMPANY NO 8708429 VAT REG NO 171339904</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate Card Pay Details PDF
 */
async function generateCardPayPDF(cardDetails, contractData) {
  let browser = null;

  try {
    console.log('🔄 Generating Card Pay Details PDF...');

    const html = generateCardPayHTML(cardDetails, contractData);

    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' }
    });

    console.log('✅ Card Pay PDF generated, size:', pdfBuffer.length, 'bytes');
    return Buffer.from(pdfBuffer);
  } catch (error) {
    console.error('❌ Error generating Card Pay PDF:', error);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

module.exports = {
  generateFinanceContractHTML,
  generateFinanceContractPDF,
  getActiveFinanceTemplate,
  calculateFinanceFields,
  generateCardPayHTML,
  generateCardPayPDF,
  DEFAULT_FINANCE_TEMPLATE
};
