/**
 * Contract Generator Utility
 * Uses Puppeteer to render HTML to PDF - guarantees exact visual match
 * with what the user sees when signing
 */

const puppeteer = require('puppeteer');
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const { getLabels } = require('./contractLabels');

// Initialize Supabase client
const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey || config.supabase.anonKey);

// Default template values (fallback if no custom template exists)
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
  cash_initial_text: 'Viewer must initial any cash received and sign here'
};

/**
 * Get active contract template from database or return defaults
 */
async function getActiveTemplate() {
  try {
    const { data: template, error } = await supabase
      .from('contract_templates')
      .select('*')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      // Real error (not "no rows returned")
      console.warn('⚠️ Error fetching contract template from database:', error.message);
      console.warn('⚠️ FALLING BACK to hardcoded DEFAULT_TEMPLATE');
      return DEFAULT_TEMPLATE;
    }

    if (template && template.id) {
      console.log('✅ Found active contract template in database (ID:', template.id, ', Name:', template.name, ')');
      return template;
    }

    // No template in database - use defaults
    console.log('⚠️ No active template found in database - using hardcoded DEFAULT_TEMPLATE');
    return DEFAULT_TEMPLATE;
  } catch (err) {
    console.warn('⚠️ Exception fetching contract template:', err.message);
    console.warn('⚠️ FALLING BACK to hardcoded DEFAULT_TEMPLATE');
    return DEFAULT_TEMPLATE;
  }
}

/**
 * Format currency value
 */
function formatCurrency(amount, currency = 'GBP') {
  const symbols = { GBP: '£', USD: '$', EUR: '€' };
  const symbol = symbols[currency] || '£';
  return `${symbol}${parseFloat(amount || 0).toFixed(2)}`;
}

/**
 * Format date as DD/MM/YYYY
 */
function formatDate(date) {
  const d = new Date(date || new Date());
  return d.toLocaleDateString('en-GB');
}

/**
 * Generate the HTML for the contract (matches ContractSigning.js exactly)
 * @param {Object} contractData - The contract data with customer info, financials, signatures
 * @param {Object} template - Optional custom template (if not provided, uses DEFAULT_TEMPLATE)
 */
function generateContractHTML(contractData, template = DEFAULT_TEMPLATE) {
  // IMPORTANT: If template has an ID, it's from the database - use it EXCLUSIVELY
  // Only fall back to DEFAULT_TEMPLATE when no database template exists at all
  let t;
  if (template && template.id) {
    // Database template exists - use ONLY its values, no merging with defaults
    console.log('📋 Using SAVED database template (ID:', template.id, ')');
    t = template;
  } else {
    // No database template - use hardcoded defaults
    console.log('⚠️ No saved template found - using hardcoded DEFAULT_TEMPLATE');
    t = DEFAULT_TEMPLATE;
  }

  // Resolve every static label (defaults + whatever the editor has overridden)
  const L = getLabels(t);
  const yes = L.order_yes;
  const no = L.order_no;

  // 'payl8r' is the legacy stored value for what is now Ideal4Finance.
  // Accept both so older contracts keep rendering correctly.
  const isIdeal4Finance = contractData.paymentMethod === 'ideal4finance' ||
                          contractData.paymentMethod === 'payl8r';

  // Generate image permission text based on allowImageUse flag
  const imagePermissionText = contractData.allowImageUse
    ? `I <strong>DO</strong> ${t.image_permission_text || 'give permission for Auralndn to use my images'}`
    : `I <strong>DO NOT</strong> ${(t.image_no_permission_text || 'give permission for Auralndn to use my images').replace('I DO NOT ', '')}`;

  const page1HTML = `
    <div class="page" style="padding: 30px; font-family: Arial, sans-serif; font-size: 11px; background: white;">
      <!-- Header -->
      <div data-editable="header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
        <p style="font-size: 10px; margin: 0;">${t.company_website}</p>
        <div style="text-align: center;">
          <h1 style="font-size: 28px; font-weight: bold; letter-spacing: 3px; margin: 0;">${t.company_name}</h1>
          <p style="font-size: 10px; margin: 3px 0 0 0;">${t.company_address}</p>
        </div>
        <div style="border: 1px solid black; padding: 8px 15px;">
          <span style="font-size: 10px;">${L.header_date_label} </span>
          <span style="font-weight: 500;">${formatDate(contractData.date)}</span>
        </div>
      </div>

      <!-- Title -->
      <div data-editable="title" style="text-align: center; margin-bottom: 15px;">
        <h2 style="font-size: 18px; font-weight: bold; margin: 0 0 5px 0;">${t.form_title}</h2>
        <p style="font-size: 9px; margin: 2px 0;">${t.form_subtitle}</p>
        <p style="font-size: 9px; margin: 2px 0;">${t.form_contact_info}</p>
      </div>

      <!-- Info Row -->
      <table data-editable="info_row" style="width: 100%; border-collapse: collapse; border: 1px solid black; margin-bottom: 12px; font-size: 10px;">
        <tr>
          <td style="border-right: 1px solid black; padding: 6px; width: 25%;">
            <span style="color: #666;">${L.info_customer_no}</span><br/>
            <span style="font-weight: 500;">${contractData.customerNumber || ''}</span>
          </td>
          <td style="border-right: 1px solid black; padding: 6px; width: 25%;">
            <span style="color: #666;">${L.info_studio_no}</span><br/>
            <span style="font-weight: 500;">${contractData.studioNumber || ''}</span>
          </td>
          <td style="border-right: 1px solid black; padding: 6px; width: 25%;">
            <span style="color: #666;">${L.info_photographer}</span><br/>
            <span style="font-weight: 500;">${contractData.photographer || ''}</span>
          </td>
          <td style="padding: 6px; width: 25%;">
            <span style="color: #666;">${L.info_invoice_no}</span><br/>
            <span style="font-weight: 500;">${contractData.invoiceNumber || ''}</span>
          </td>
        </tr>
      </table>

      <!-- Customer Details -->
      <h3 data-editable="customer_details" style="font-weight: bold; margin: 0 0 5px 0; font-size: 12px;">${L.customer_details_heading}</h3>
      <table data-editable="customer_details" style="width: 100%; border-collapse: collapse; border: 1px solid black; margin-bottom: 12px; font-size: 10px;">
        <tr style="border-bottom: 1px solid black;">
          <td style="padding: 6px;" colspan="3">
            <span style="color: #666;">${L.customer_name_label}</span><br/>
            <span style="font-weight: 500;">${contractData.customerName || ''}</span>
          </td>
          <td style="border-left: 1px solid black; padding: 6px; text-align: center; width: 80px;">
            <span style="color: #666;">${L.customer_vip_label}</span><br/>
            <span style="font-weight: 500;">${contractData.isVip ? yes : no}</span>
          </td>
        </tr>
        <tr style="border-bottom: 1px solid black;">
          <td style="padding: 6px;" colspan="4">
            <span style="color: #666;">${L.customer_alt_name_label}</span><br/>
            <span style="font-weight: 500;">${contractData.clientNameIfDifferent || ''}</span>
          </td>
        </tr>
        <tr style="border-bottom: 1px solid black;">
          <td style="padding: 6px;" colspan="4">
            <span style="color: #666;">${L.customer_address_label}</span><br/>
            <span style="font-weight: 500;">${contractData.address || ''}</span>
          </td>
        </tr>
        <tr style="border-bottom: 1px solid black;">
          <td style="padding: 6px; text-align: right;" colspan="4">
            <span style="color: #666;">${L.customer_postcode_label}</span>
            <span style="font-weight: 500; margin-left: 8px;">${contractData.postcode || ''}</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 6px; width: 50%;">
            <span style="color: #666;">${L.customer_phone_label}</span><br/>
            <span style="font-weight: 500;">${contractData.phone || ''}</span>
          </td>
          <td style="border-left: 1px solid black; padding: 6px;" colspan="3">
            <span style="color: #666;">${L.customer_email_label}</span><br/>
            <span style="font-weight: 500;">${contractData.email || ''}</span>
          </td>
        </tr>
      </table>

      <!-- Order Details with Totals -->
      <div style="display: flex; gap: 12px; margin-bottom: 8px;">
        <div data-editable="order_details" style="flex: 1;">
          <h3 style="font-weight: bold; margin: 0 0 5px 0; font-size: 12px;">${L.order_details_heading}</h3>
          <table style="width: 100%; border-collapse: collapse; border: 1px solid black; font-size: 10px;">
            <tr style="border-bottom: 1px solid black;">
              <td style="padding: 5px; width: 120px;">${L.order_row1_label}</td>
              <td style="border-left: 1px solid black; padding: 5px; width: 60px; text-align: center;">${contractData.digitalImages ? yes : no}</td>
              <td style="border-left: 1px solid black; padding: 5px;">${L.order_row1_qty_prefix} <span style="font-weight: 500;">${contractData.digitalImagesQty || ''}</span></td>
            </tr>
            <tr style="border-bottom: 1px solid black;">
              <td style="padding: 5px;">${L.order_row2_label}</td>
              <td style="border-left: 1px solid black; padding: 5px; text-align: center;">${contractData.digitalZCard ? yes : no}</td>
              <td style="border-left: 1px solid black; padding: 5px; color: #666;">${L.order_row2_note}</td>
            </tr>
            <tr style="border-bottom: 1px solid black;">
              <td style="padding: 5px;">${L.order_row3_label}</td>
              <td style="border-left: 1px solid black; padding: 5px; text-align: center;">${contractData.efolio ? yes : no}</td>
              <td style="border-left: 1px solid black; padding: 5px;">${L.order_row3_url_prefix} <span style="font-weight: 500;">${contractData.efolioUrl || ''}</span></td>
            </tr>
            <tr style="border-bottom: 1px solid black;">
              <td style="padding: 5px;">${L.order_row4_label}</td>
              <td style="border-left: 1px solid black; padding: 5px; text-align: center;">${contractData.projectInfluencer ? yes : no}</td>
              <td style="border-left: 1px solid black; padding: 5px;">${L.order_row4_login_prefix} <span style="font-weight: 500;">${contractData.influencerLogin || ''}</span></td>
            </tr>
            <tr style="border-bottom: 1px solid black;">
              <td data-editable="image_permission" style="padding: 5px;" colspan="3">
                ${imagePermissionText}
              </td>
            </tr>
            <tr>
              <td style="padding: 5px;" colspan="2">${L.order_checked_label}</td>
              <td style="border-left: 1px solid black; padding: 5px; text-align: center;">${L.order_checked_value}</td>
            </tr>
          </table>
        </div>
        <div data-editable="totals" style="width: 100px;">
          <table style="width: 100%; border-collapse: collapse; border: 1px solid black; font-size: 10px; height: 100%;">
            <tr style="border-bottom: 1px solid black;">
              <td style="padding: 8px; text-align: center;">
                <span style="color: #666;">${L.totals_subtotal_label}</span><br/>
                <span style="font-weight: 500;">${formatCurrency(contractData.subtotal)}</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px; text-align: center;">
                <strong>${L.totals_total_label}</strong><br/>
                <span style="font-weight: bold; font-size: 14px;">${formatCurrency(contractData.total)}</span>
              </td>
            </tr>
          </table>
        </div>
      </div>

      <!-- Notes -->
      <div data-editable="notes" style="margin-bottom: 8px;">
        <span style="font-weight: bold; font-size: 10px;">${L.notes_label}</span>
        <div style="border: 1px solid black; padding: 6px; min-height: 35px; font-size: 10px; margin-top: 3px;">${contractData.notes || ''}</div>
      </div>

      <!-- Terms -->
      <div data-editable="terms" style="font-size: 8px; color: #444; margin-bottom: 10px; line-height: 1.3;">
        <strong>${L.terms_heading}</strong> ${t.terms_and_conditions}
      </div>

      <!-- Payment Details -->
      <table data-editable="finance" style="width: 100%; border-collapse: collapse; border: 1px solid black; margin-bottom: 10px; font-size: 10px;">
        <tr data-editable="payment_headers" style="border-bottom: 1px solid black;">
          <td style="padding: 5px; border-right: 1px solid black; width: 100px;">${L.payment_details_label}</td>
          <td style="padding: 5px; border-right: 1px solid black; text-align: center; width: 100px;">${L.payment_card_label}</td>
          <td style="padding: 5px; border-right: 1px solid black; text-align: center; width: 50px;">${L.payment_cash_label}</td>
          <td style="padding: 5px; border-right: 1px solid black; text-align: center; width: 60px;">${L.payment_finance_label}</td>
          <td style="padding: 5px; border-right: 1px solid black; text-align: center; width: 60px;">${L.payment_ideal4finance_label}</td>
          <td style="padding: 5px; text-align: right;">${L.payment_subtotal_label}</td>
        </tr>
        <tr style="border-bottom: 1px solid black;">
          <td style="padding: 5px; border-right: 1px solid black;">${contractData.paymentMethod === 'finance' ? (t.finance_payment_label || 'DEPOSIT TODAY') : (t.non_finance_payment_label || 'PAYMENT TODAY')}</td>
          <td style="padding: 5px; border-right: 1px solid black; text-align: center; font-weight: bold;">${contractData.paymentMethod === 'card' ? '✓' : ''}</td>
          <td style="padding: 5px; border-right: 1px solid black; text-align: center; font-weight: bold;">${contractData.paymentMethod === 'cash' ? '✓' : ''}</td>
          <td style="padding: 5px; border-right: 1px solid black; text-align: center; font-weight: bold;">${contractData.paymentMethod === 'finance' ? '✓' : ''}</td>
          <td style="padding: 5px; border-right: 1px solid black; text-align: center; font-weight: bold;">${isIdeal4Finance ? '✓' : ''}</td>
          <td style="padding: 5px; text-align: right; font-weight: 500;">${formatCurrency(contractData.subtotal)}</td>
        </tr>
        ${contractData.paymentMethod === 'finance' || isIdeal4Finance ? `
        <tr style="border-bottom: 1px solid black;">
          <td style="padding: 5px; border-right: 1px solid black; background: #fef3c7;">${isIdeal4Finance ? L.ideal4finance_deposit_label : (t.finance_deposit_label || 'DEPOSIT PAID')}</td>
          <td style="padding: 5px; border-right: 1px solid black; text-align: center; background: #fef3c7;" colspan="4">
            <span style="font-weight: bold; font-size: 12px;">${formatCurrency(contractData.depositAmount || 0)}</span>
          </td>
          <td style="padding: 5px; text-align: right; background: #fef3c7;">
            <div style="text-align: right;">
              <span style="font-size: 9px; color: #666;">${isIdeal4Finance ? L.ideal4finance_amount_label : (t.finance_amount_label || 'FINANCE AMOUNT')}:</span><br/>
              <span style="font-weight: bold; font-size: 12px;">${formatCurrency(contractData.financeAmount || 0)}</span>
            </div>
          </td>
        </tr>
        ` : ''}
        <tr style="border-bottom: 1px solid black;">
          <td style="padding: 5px; border-right: 1px solid black; font-size: 9px; color: #666;" rowspan="2">${t.cash_initial_text || ''}</td>
          <td style="padding: 5px; border-right: 1px solid black;" rowspan="2"></td>
          <td style="padding: 5px; border-right: 1px solid black; text-align: center;" colspan="3">${L.payment_vat_label}${contractData.vatRate || 20}%</td>
          <td style="padding: 5px; text-align: right; font-weight: 500;">${formatCurrency(contractData.vatAmount)}</td>
        </tr>
        <tr>
          <td style="padding: 5px; border-right: 1px solid black; text-align: center;" colspan="3">
            <span style="font-size: 9px;">${isIdeal4Finance ? L.payment_ideal4finance_ref_label : L.payment_auth_code_label}:</span><br/>
            <span style="font-weight: 500;">${isIdeal4Finance ? '' : (contractData.authCode || '')}</span>
          </td>
          <td style="padding: 5px; text-align: right;">
            <div style="text-align: right;">
              <strong>${L.payment_total_label}</strong><br/>
              <span style="font-weight: bold; font-size: 16px;">${formatCurrency(contractData.total)}</span>
            </div>
          </td>
        </tr>
      </table>

      <!-- Signature Section -->
      <p data-editable="signature_instruction" style="font-size: 9px; font-weight: bold; margin-bottom: 8px;">${t.signature_instruction}</p>
      <table data-editable="signature_block" style="width: 100%; border-collapse: collapse; border: 1px solid black;">
        <tr>
          <td style="padding: 8px; border-right: 1px solid black; width: 75%;">
            <span style="font-size: 10px;">${L.signature_customer_label}</span>
            <div data-signature="main" style="margin-top: 5px; min-height: 60px;">
              ${contractData.signatures?.main ? `<img src="${contractData.signatures.main}" style="max-height: 55px; max-width: 250px;" />` : ''}
            </div>
          </td>
          <td style="padding: 8px; text-align: center;">
            <span style="font-size: 10px;">${L.signature_date_label}</span>
            <div style="font-weight: 500; margin-top: 10px;">${formatDate(contractData.signedAt || new Date())}</div>
          </td>
        </tr>
      </table>

      <!-- Footer -->
      <div data-editable="footer" style="text-align: center; font-size: 9px; color: #666; padding-top: 12px;">
        <p style="margin: 2px 0;">${t.footer_line1}</p>
        <p style="margin: 2px 0;">${t.footer_line2}</p>
      </div>
    </div>
  `;

  const page2HTML = `
    <div class="page" style="padding: 40px; font-family: Arial, sans-serif; background: white; page-break-before: always;">
      <!-- Header -->
      <div data-editable="page2_header" style="margin-bottom: 25px;">
        <p style="font-weight: bold; font-size: 14px; margin: 0 0 10px 0;">${L.page2_customer_name_label} <span style="font-weight: normal;">${contractData.customerName || ''}</span></p>
        <p style="font-weight: bold; font-size: 14px; margin: 0;">${L.page2_date_label} <span style="font-weight: normal;">${formatDate(contractData.signedAt || new Date())}</span></p>
      </div>

      <!-- 4 Confirmation Boxes -->
      <div style="display: flex; flex-direction: column; gap: 25px;">

        <!-- Box 1 -->
        <div data-editable="confirmation1" style="display: flex; gap: 25px; align-items: flex-start;">
          <div data-signature="notAgency" style="width: 180px; flex-shrink: 0; border: 2px solid black; padding: 5px; min-height: 90px;">
            ${contractData.signatures?.notAgency ? `<img src="${contractData.signatures.notAgency}" style="max-height: 80px; max-width: 170px;" />` : `<div style="color: #ccc; text-align: center; padding-top: 30px;">${L.page2_sign_here}</div>`}
          </div>
          <div style="flex: 1; padding-top: 10px;">
            <p style="font-size: 14px; line-height: 1.5; margin: 0;">
              ${t.confirmation1_text}
            </p>
          </div>
        </div>

        <!-- Box 2 -->
        <div data-editable="confirmation2" style="display: flex; gap: 25px; align-items: flex-start;">
          <div data-signature="noCancel" style="width: 180px; flex-shrink: 0; border: 2px solid black; padding: 5px; min-height: 90px;">
            ${contractData.signatures?.noCancel ? `<img src="${contractData.signatures.noCancel}" style="max-height: 80px; max-width: 170px;" />` : `<div style="color: #ccc; text-align: center; padding-top: 30px;">${L.page2_sign_here}</div>`}
          </div>
          <div style="flex: 1; padding-top: 10px;">
            <p style="font-size: 14px; line-height: 1.5; margin: 0;">
              ${t.confirmation2_text}
            </p>
          </div>
        </div>

        <!-- Box 3 -->
        <div data-editable="confirmation3" style="display: flex; gap: 25px; align-items: flex-start;">
          <div data-signature="passDetails" style="width: 180px; flex-shrink: 0; border: 2px solid black; padding: 5px; min-height: 90px;">
            ${contractData.signatures?.passDetails ? `<img src="${contractData.signatures.passDetails}" style="max-height: 80px; max-width: 170px;" />` : `<div style="color: #ccc; text-align: center; padding-top: 30px;">${L.page2_sign_here}</div>`}
          </div>
          <div style="flex: 1; padding-top: 10px;">
            <p style="font-size: 14px; line-height: 1.5; margin: 0;">
              ${t.confirmation3_text}
            </p>
          </div>
        </div>

        <!-- Box 4 -->
        <div data-editable="confirmation4" style="display: flex; gap: 25px; align-items: flex-start;">
          <div data-signature="happyPurchase" style="width: 180px; flex-shrink: 0; border: 2px solid black; padding: 5px; min-height: 90px;">
            ${contractData.signatures?.happyPurchase ? `<img src="${contractData.signatures.happyPurchase}" style="max-height: 80px; max-width: 170px;" />` : `<div style="color: #ccc; text-align: center; padding-top: 30px;">${L.page2_sign_here}</div>`}
          </div>
          <div style="flex: 1; padding-top: 10px;">
            <p style="font-size: 14px; line-height: 1.5; margin: 0;">
              ${t.confirmation4_text}
            </p>
          </div>
        </div>

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
 * Generate Contract PDF using Puppeteer
 * This renders the HTML to PDF, guaranteeing exact visual match
 */
async function generateContractPDF(contractData) {
  let browser = null;

  try {
    console.log('🔄 Starting Puppeteer PDF generation...');

    // Fetch custom template from database (or use defaults)
    const template = await getActiveTemplate();
    console.log('📄 Using contract template:', template.id ? 'Custom' : 'Default');

    // Generate HTML with template
    const html = generateContractHTML(contractData, template);

    // Launch Puppeteer - use system Chromium on Railway/Alpine
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

    // Set content
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' }
    });

    console.log('✅ PDF generated successfully, size:', pdfBuffer.length, 'bytes');

    return Buffer.from(pdfBuffer);
  } catch (error) {
    console.error('❌ Error generating PDF with Puppeteer:', error);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Generate contract data from lead and package selection
 */
function buildContractData(lead, packageData, invoiceData = {}) {
  return {
    // Dates
    date: new Date(),
    signedAt: null,

    // Customer details
    customerNumber: lead.id?.toString().slice(-6) || '',
    customerName: lead.name || '',
    clientNameIfDifferent: lead.parent_name || '',
    address: lead.address || '',
    postcode: lead.postcode || '',
    phone: lead.phone || '',
    email: lead.email || '',
    isVip: lead.is_vip || false,

    // Studio info
    studioNumber: invoiceData.studioNumber || '',
    photographer: invoiceData.photographer || '',
    invoiceNumber: invoiceData.invoiceNumber || `INV-${Date.now().toString().slice(-8)}`,

    // Order details
    digitalImages: true,
    digitalImagesQty: packageData.imageCount || packageData.image_count || 'All',
    digitalZCard: packageData.includes?.some(i => i.toLowerCase().includes('z-card')) || false,
    efolio: packageData.includes?.some(i => i.toLowerCase().includes('efolio') || i.toLowerCase().includes('e-folio')) || false,
    efolioUrl: '',
    projectInfluencer: packageData.includes?.some(i => i.toLowerCase().includes('influencer')) || false,
    influencerLogin: '',
    influencerPassword: '',

    // Permissions
    allowImageUse: true,
    imagesReceived: 'N.A',

    // Notes
    notes: `Package: ${packageData.name || 'Standard Package'}`,

    // Financials - handle VAT-inclusive vs exclusive pricing
    subtotal: invoiceData.subtotal || (
      (packageData.vat_inclusive || packageData.vatInclusive)
        ? packageData.price / (1 + (packageData.vatRate || packageData.vat_rate || 20) / 100)
        : packageData.price
    ) || 0,
    vatRate: invoiceData.vatRate || packageData.vatRate || packageData.vat_rate || 20,
    vatAmount: invoiceData.vatAmount || (
      (packageData.vat_inclusive || packageData.vatInclusive)
        ? packageData.price - (packageData.price / (1 + (packageData.vatRate || packageData.vat_rate || 20) / 100))
        : packageData.price * ((packageData.vatRate || packageData.vat_rate || 20) / 100)
    ) || 0,
    total: invoiceData.total || (
      (packageData.vat_inclusive || packageData.vatInclusive)
        ? packageData.price
        : packageData.price * (1 + (packageData.vatRate || packageData.vat_rate || 20) / 100)
    ) || 0,

    // Payment
    paymentMethod: invoiceData.paymentMethod || 'card',
    authCode: invoiceData.authCode || '',
    depositAmount: invoiceData.depositAmount || 0,
    financeAmount: invoiceData.financeAmount || 0,
    viewerInitials: '',

    // Signatures
    signatures: {
      main: null,
      notAgency: null,
      noCancel: null,
      passDetails: null,
      happyPurchase: null
    }
  };
}

module.exports = {
  generateContractPDF,
  generateContractHTML,
  buildContractData,
  getActiveTemplate,
  formatCurrency,
  formatDate,
  DEFAULT_TEMPLATE
};
