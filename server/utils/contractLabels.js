/**
 * Contract Labels
 *
 * Every piece of static text that appears on the contract / finance agreement
 * lives here. Anything a user might want to reword should be a key in this file
 * so the Contract Editor can expose it.
 *
 * Overrides are stored in a single `labels` JSONB column on `contract_templates`
 * (see migrations/add-contract-labels-jsonb.sql) so adding a new editable label
 * never needs another database migration.
 */

const DEFAULT_LABELS = {
  // ---- Page 1: header ----
  header_date_label: 'Date:',

  // ---- Page 1: info row ----
  info_customer_no: 'Customer Nos.',
  info_studio_no: 'Studio no.',
  info_photographer: 'Photographer',
  info_invoice_no: 'Invoice no.',

  // ---- Page 1: customer details ----
  customer_details_heading: 'CUSTOMER DETAILS',
  customer_name_label: 'NAME OF PERSON IN DIARY',
  customer_vip_label: 'VIP?',
  customer_alt_name_label: 'NAME OF CLIENT IF DIFFERENT',
  customer_address_label: 'ADDRESS',
  customer_postcode_label: 'POSTCODE',
  customer_phone_label: 'PHONE/MOBILE NO.',
  customer_email_label: 'EMAIL:',

  // ---- Page 1: order details ----
  order_details_heading: 'ORDER DETAILS',
  order_row1_label: 'DIGITAL IMAGES?',
  order_row1_qty_prefix: 'QTY:',
  order_row2_label: 'DIGITAL Z-CARD?',
  order_row2_note: 'DIGITAL PDF ONLY',
  order_row3_label: 'EFOLIO?',
  order_row3_url_prefix: 'URL:',
  order_row4_label: 'PROJECT INFLUENCER?',
  order_row4_login_prefix: 'LOGIN:',
  order_checked_label: 'Digital Images checked & received?',
  order_checked_value: 'N.A',
  order_yes: 'YES',
  order_no: 'NO',

  // ---- Page 1: totals box ----
  totals_subtotal_label: 'SUB TOTAL',
  totals_total_label: 'TOTAL',

  // ---- Page 1: notes ----
  notes_label: 'NOTES:',

  // ---- Page 1: terms ----
  terms_heading: 'Terms and Conditions:',

  // ---- Page 1: payment table ----
  payment_details_label: 'PAYMENT DETAILS',
  payment_card_label: 'CREDIT/DEBIT CARD',
  payment_cash_label: 'CASH',
  payment_finance_label: 'FINANCE',
  payment_ideal4finance_label: 'IDEAL4FINANCE',
  payment_subtotal_label: 'SUB TOTAL',
  payment_vat_label: 'VAT@',
  payment_auth_code_label: 'AUTHORISATION CODE',
  payment_ideal4finance_ref_label: 'IDEAL4FINANCE',
  payment_total_label: 'TOTAL',
  ideal4finance_deposit_label: 'DEPOSIT TODAY',
  ideal4finance_amount_label: 'IDEAL4FINANCE AMOUNT',

  // ---- Page 1: signature block ----
  signature_customer_label: 'CUSTOMER SIGNATURE:',
  signature_date_label: 'DATE:',

  // ---- Page 2: header + signature boxes ----
  page2_customer_name_label: 'CUSTOMER NAME:',
  page2_date_label: 'DATE:',
  page2_sign_here: 'Sign Here',

  // ---- Finance agreement: page 1 ----
  fin_doc_title: 'FINANCE AGREEMENT',
  fin_doc_subtitle: '& AFFORDABILITY ASSESSMENT',
  fin_date_label: 'Date:',
  fin_ref_label: 'Ref:',

  fin_section1_heading: 'SECTION 1: CUSTOMER INFORMATION',
  fin_s1_name: 'Full Name',
  fin_s1_address: 'Address',
  fin_s1_postcode: 'Postcode',
  fin_s1_dob: 'Date of Birth',
  fin_s1_years: 'Years at Address',
  fin_s1_mobile: 'Mobile Number',

  fin_section2_heading: 'SECTION 2: AFFORDABILITY ASSESSMENT',
  fin_s2_income: 'Monthly Household Income',
  fin_s2_priority: 'Priority Outgoings (Rent/Mortgage, Bills, etc.)',
  fin_s2_other: 'Other Outgoings (Lifestyle, Subscriptions, etc.)',
  fin_s2_disposable: 'Disposable Balance',
  fin_s2_expenditure: 'Total Expenditure',
  fin_s2_instalment: 'Agreed Instalment Value',

  fin_section3_heading: 'SECTION 3: LOAN & REPAYMENT TERMS',
  fin_s3_cash_price: 'Cash Price of Goods',
  fin_s3_deposit: 'Deposit',
  fin_s3_credit: 'Amount of Credit',
  fin_s3_interest: 'Interest',
  fin_s3_admin_fee: 'Admin Fee',
  fin_s3_total_charge: 'Total Charge for Credit',
  fin_s3_total_payable: 'Total Amount Payable',
  fin_s3_instalments: 'Number of Instalments',
  fin_s3_duration: 'Duration of Agreement (months)',
  fin_s3_rate: 'Interest Rate (annual %)',
  fin_s3_apr: 'APR',

  // ---- Finance agreement: page 2 ----
  fin_page2_title: 'FINANCE AGREEMENT - Page 2',

  fin_section4_heading: 'SECTION 4: REPAYMENT SCHEDULE',
  fin_s4_frequency: 'Repayment Frequency',
  fin_s4_commencing: 'Commencing From',
  fin_s4_monthly: 'Monthly Repayment Amount',
  fin_s4_daily_rate: 'Daily Rate of Interest',

  fin_section5_heading: 'SECTION 5: KEY INFORMATION & ACKNOWLEDGEMENT',

  fin_section6_heading: 'SECTION 6: EXECUTION',
  fin_s6_creditor_label: 'Creditor:',
  fin_s6_trading_as_label: 'Trading as:',
  fin_s6_customer_agreement_label: 'Customer Agreement:',
  fin_s6_customer_signature_label: 'CUSTOMER SIGNATURE:',
  fin_s6_date_label: 'DATE:',
  fin_s6_creditor_ack_label: 'Creditor Acknowledgement:',
  fin_s6_creditor_signatory_label: 'CREDITOR (Authorised Signatory):'
};

/**
 * Merge a template's saved label overrides over the defaults.
 * Blank overrides fall back to the default so a section can never vanish
 * because someone cleared a box by accident.
 *
 * @param {Object} template - a contract_templates row (or DEFAULT_TEMPLATE)
 * @returns {Object} every label key, resolved
 */
function getLabels(template) {
  let saved = (template && template.labels) || {};

  // jsonb normally comes back as an object, but tolerate a stringified column
  if (typeof saved === 'string') {
    try {
      saved = JSON.parse(saved);
    } catch (err) {
      saved = {};
    }
  }

  const resolved = { ...DEFAULT_LABELS };
  Object.keys(DEFAULT_LABELS).forEach(key => {
    const value = saved[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      resolved[key] = value;
    }
  });

  return resolved;
}

module.exports = { DEFAULT_LABELS, getLabels };
