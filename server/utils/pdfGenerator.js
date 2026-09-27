/**
 * PDF Generator Utility
 * Generates professional invoice PDFs
 *
 * NOTE: Requires pdfkit package to be installed:
 * npm install pdfkit
 */

const PDFDocument = require('pdfkit');
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const { uploadToS3 } = require('./s3Service');

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey || config.supabase.anonKey);

/**
 * Format currency value
 */
function formatCurrency(amount, currency = 'GBP') {
  const symbols = { GBP: '£', USD: '$', EUR: '€' };
  const symbol = symbols[currency] || '£';
  return `${symbol}${parseFloat(amount).toFixed(2)}`;
}

/**
 * Format date
 */
function formatDate(date) {
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
}

/**
 * Generate invoice PDF
 * @param {Object} invoice - Invoice data
 * @param {Object} options - Generation options
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generateInvoicePDF(invoice, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: `Invoice ${invoice.invoiceNumber || invoice.invoice_number}`,
          Author: 'Auralndn',
          Subject: 'Invoice',
          Creator: 'Auralndn CRM'
        }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const primaryColor = '#1a1a2e';
      const accentColor = '#16213e';
      const textColor = '#333333';
      const lightGray = '#f5f5f5';

      // Header Section
      doc.fontSize(28)
         .font('Helvetica-Bold')
         .fillColor(primaryColor)
         .text('AURALNDN', 50, 50);

      doc.fontSize(10)
         .font('Helvetica')
         .fillColor(textColor)
         .text('Professional Photography Services', 50, 85)
         .text('sales@example.com | tech@example.com', 50, 100);

      // Invoice Title
      doc.fontSize(24)
         .font('Helvetica-Bold')
         .fillColor(primaryColor)
         .text('INVOICE', 400, 50, { align: 'right' });

      // Invoice Number & Date
      const invoiceNumber = invoice.invoiceNumber || invoice.invoice_number;
      const invoiceDate = formatDate(invoice.createdAt || invoice.created_at || new Date());

      doc.fontSize(10)
         .font('Helvetica')
         .fillColor(textColor)
         .text(`Invoice No: ${invoiceNumber}`, 400, 80, { align: 'right' })
         .text(`Date: ${invoiceDate}`, 400, 95, { align: 'right' });

      // Divider
      doc.moveTo(50, 130)
         .lineTo(545, 130)
         .strokeColor(primaryColor)
         .lineWidth(2)
         .stroke();

      // Client Information
      const clientName = invoice.clientName || invoice.client_name;
      const clientEmail = invoice.clientEmail || invoice.client_email;
      const clientPhone = invoice.clientPhone || invoice.client_phone;

      doc.fontSize(12)
         .font('Helvetica-Bold')
         .fillColor(primaryColor)
         .text('BILL TO:', 50, 150);

      doc.fontSize(11)
         .font('Helvetica')
         .fillColor(textColor)
         .text(clientName, 50, 170);

      if (clientEmail) {
        doc.text(clientEmail, 50, 185);
      }
      if (clientPhone) {
        doc.text(clientPhone, 50, clientEmail ? 200 : 185);
      }

      // Items Table Header
      const tableTop = 250;
      const tableLeft = 50;

      // Table header background
      doc.rect(tableLeft, tableTop, 495, 25)
         .fillColor(primaryColor)
         .fill();

      doc.fontSize(10)
         .font('Helvetica-Bold')
         .fillColor('#ffffff')
         .text('DESCRIPTION', tableLeft + 10, tableTop + 8)
         .text('QTY', 370, tableTop + 8, { width: 40, align: 'center' })
         .text('UNIT PRICE', 410, tableTop + 8, { width: 60, align: 'right' })
         .text('TOTAL', 480, tableTop + 8, { width: 55, align: 'right' });

      // Items
      const items = invoice.items || [];
      let yPosition = tableTop + 35;
      let rowIndex = 0;

      items.forEach((item, index) => {
        // Alternate row background
        if (index % 2 === 0) {
          doc.rect(tableLeft, yPosition - 5, 495, 30)
             .fillColor(lightGray)
             .fill();
        }

        const itemName = item.name || 'Package';
        const quantity = item.quantity || 1;
        const unitPrice = item.unitPrice || item.lineTotal || 0;
        const lineTotal = item.lineTotal || (unitPrice * quantity);

        doc.fontSize(10)
           .font('Helvetica')
           .fillColor(textColor)
           .text(itemName, tableLeft + 10, yPosition, { width: 300 });

        // Include items if available
        if (item.includes && Array.isArray(item.includes) && item.includes.length > 0) {
          doc.fontSize(8)
             .fillColor('#666666');
          item.includes.forEach((inc, i) => {
            if (i < 3) { // Show max 3 included items
              doc.text(`• ${inc}`, tableLeft + 15, yPosition + 15 + (i * 10), { width: 290 });
            }
          });
          if (item.includes.length > 3) {
            doc.text(`+ ${item.includes.length - 3} more items`, tableLeft + 15, yPosition + 45, { width: 290 });
          }
          yPosition += Math.min(item.includes.length, 3) * 10 + 10;
        }

        doc.fontSize(10)
           .fillColor(textColor)
           .text(quantity.toString(), 370, yPosition - (item.includes ? 25 : 0), { width: 40, align: 'center' })
           .text(formatCurrency(unitPrice), 410, yPosition - (item.includes ? 25 : 0), { width: 60, align: 'right' })
           .text(formatCurrency(lineTotal), 480, yPosition - (item.includes ? 25 : 0), { width: 55, align: 'right' });

        yPosition += 35;
        rowIndex++;
      });

      // Totals Section
      const totalsTop = yPosition + 20;

      // Subtotal
      const subtotal = invoice.subtotal || 0;
      const vatAmount = invoice.vatAmount || invoice.vat_amount || 0;
      const totalAmount = invoice.totalAmount || invoice.total_amount || 0;

      doc.fontSize(10)
         .font('Helvetica')
         .fillColor(textColor)
         .text('Subtotal:', 380, totalsTop, { width: 80, align: 'right' })
         .text(formatCurrency(subtotal), 470, totalsTop, { width: 65, align: 'right' });

      doc.text('VAT (20%):', 380, totalsTop + 20, { width: 80, align: 'right' })
         .text(formatCurrency(vatAmount), 470, totalsTop + 20, { width: 65, align: 'right' });

      // Total line
      doc.moveTo(380, totalsTop + 40)
         .lineTo(545, totalsTop + 40)
         .strokeColor(primaryColor)
         .lineWidth(1)
         .stroke();

      doc.fontSize(14)
         .font('Helvetica-Bold')
         .fillColor(primaryColor)
         .text('TOTAL:', 380, totalsTop + 50, { width: 80, align: 'right' })
         .text(formatCurrency(totalAmount), 470, totalsTop + 50, { width: 65, align: 'right' });

      // Payment Information
      const paymentMethod = invoice.paymentMethod || invoice.payment_method;
      const authCode = invoice.authCode || invoice.auth_code;

      if (paymentMethod || authCode) {
        doc.fontSize(11)
           .font('Helvetica-Bold')
           .fillColor(primaryColor)
           .text('PAYMENT DETAILS:', 50, totalsTop + 20);

        doc.fontSize(10)
           .font('Helvetica')
           .fillColor(textColor);

        if (paymentMethod) {
          doc.text(`Payment Method: ${paymentMethod.toUpperCase()}`, 50, totalsTop + 40);
        }
        if (authCode) {
          doc.text(`Authorisation Code: ${authCode}`, 50, totalsTop + 55);
        }
      }

      // Signature Section (Page 2 if signature exists)
      const signatureData = invoice.clientSignatureData || invoice.client_signature_data;
      if (signatureData || options.includeSignaturePage) {
        doc.addPage();

        doc.fontSize(18)
           .font('Helvetica-Bold')
           .fillColor(primaryColor)
           .text('TERMS & SIGNATURE', 50, 50);

        // Terms and conditions
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor(textColor)
           .text('By signing below, I acknowledge that:', 50, 90)
           .text('1. I have reviewed and agree to the charges listed in this invoice.', 60, 110)
           .text('2. I understand the payment terms and conditions.', 60, 125)
           .text('3. I authorize the services and products as described above.', 60, 140);

        // Signature box
        doc.rect(50, 180, 300, 100)
           .strokeColor(primaryColor)
           .lineWidth(1)
           .stroke();

        doc.fontSize(10)
           .text('Client Signature:', 55, 165);

        // Add signature image if available
        if (signatureData && signatureData.startsWith('data:image')) {
          try {
            const base64Data = signatureData.split(',')[1];
            const imgBuffer = Buffer.from(base64Data, 'base64');
            doc.image(imgBuffer, 60, 190, { width: 280, height: 80 });
          } catch (err) {
            console.error('Error adding signature image:', err);
          }
        }

        // Date signed
        const signedAt = invoice.signedAt || invoice.signed_at;
        doc.fontSize(10)
           .text('Date:', 380, 165)
           .text(signedAt ? formatDate(signedAt) : '_______________', 380, 185);

        // Print name
        doc.text('Print Name:', 380, 220)
           .text(clientName || '_______________', 380, 240);
      }

      // Footer
      doc.fontSize(8)
         .font('Helvetica')
         .fillColor('#888888')
         .text(
           'Thank you for your business. For any queries, please contact us at sales@example.com',
           50,
           doc.page.height - 50,
           { align: 'center', width: 495 }
         );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generate and upload invoice PDF to Cloudinary
 * @param {string} invoiceId - Invoice ID
 * @returns {Promise<Object>} Upload result with URL
 */
async function generateAndUploadInvoicePDF(invoiceId) {
  try {
    // Fetch invoice data
    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();

    if (error || !invoice) {
      throw new Error('Invoice not found');
    }

    // Generate PDF
    const pdfBuffer = await generateInvoicePDF(invoice, { includeSignaturePage: true });

    // Upload to S3
    const uploadResult = await uploadToS3(
      pdfBuffer,
      `invoice_${invoice.invoice_number.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
      `invoices/${new Date().getFullYear()}`,
      'application/pdf'
    );

    if (!uploadResult.url) {
      throw new Error('Failed to upload PDF to S3');
    }

    // Update invoice with PDF URL
    await supabase
      .from('invoices')
      .update({ pdf_url: uploadResult.url })
      .eq('id', invoiceId);

    console.log(`PDF generated for invoice ${invoice.invoice_number}: ${uploadResult.url}`);

    return {
      success: true,
      pdfUrl: uploadResult.url,
      invoiceNumber: invoice.invoice_number
    };
  } catch (error) {
    console.error('Error generating invoice PDF:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Generate HTML invoice (for email embedding or browser rendering)
 * @param {Object} invoice - Invoice data
 * @returns {string} HTML string
 */
function generateInvoiceHTML(invoice) {
  const invoiceNumber = invoice.invoiceNumber || invoice.invoice_number;
  const invoiceDate = formatDate(invoice.createdAt || invoice.created_at || new Date());
  const clientName = invoice.clientName || invoice.client_name;
  const clientEmail = invoice.clientEmail || invoice.client_email;
  const clientPhone = invoice.clientPhone || invoice.client_phone;
  const items = invoice.items || [];
  const subtotal = invoice.subtotal || 0;
  const vatAmount = invoice.vatAmount || invoice.vat_amount || 0;
  const totalAmount = invoice.totalAmount || invoice.total_amount || 0;

  const itemRows = items.map(item => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #eee;">
        <strong>${item.name}</strong>
        ${item.includes && item.includes.length > 0 ? `
          <ul style="margin: 5px 0 0 0; padding-left: 20px; font-size: 12px; color: #666;">
            ${item.includes.slice(0, 3).map(inc => `<li>${inc}</li>`).join('')}
            ${item.includes.length > 3 ? `<li>+ ${item.includes.length - 3} more items</li>` : ''}
          </ul>
        ` : ''}
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity || 1}</td>
      <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(item.unitPrice || item.lineTotal)}</td>
      <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(item.lineTotal)}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; color: #333; margin: 0; padding: 20px; }
        .invoice-container { max-width: 800px; margin: 0 auto; background: #fff; }
        .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
        .company-info h1 { color: #1a1a2e; margin: 0; font-size: 28px; }
        .invoice-info { text-align: right; }
        .invoice-info h2 { color: #1a1a2e; margin: 0 0 10px 0; }
        .client-info { margin-bottom: 30px; }
        .client-info h3 { color: #1a1a2e; margin-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #1a1a2e; color: #fff; padding: 12px; text-align: left; }
        th:nth-child(2), th:nth-child(3), th:nth-child(4) { text-align: center; }
        th:last-child { text-align: right; }
        .totals { margin-top: 20px; text-align: right; }
        .totals table { width: 300px; margin-left: auto; }
        .totals td { padding: 8px; }
        .totals .total-row { font-size: 18px; font-weight: bold; border-top: 2px solid #1a1a2e; }
        .footer { margin-top: 40px; text-align: center; color: #888; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="invoice-container">
        <div class="header">
          <div class="company-info">
            <h1>AURALNDN</h1>
            <p>Professional Photography Services<br>sales@example.com | tech@example.com</p>
          </div>
          <div class="invoice-info">
            <h2>INVOICE</h2>
            <p>Invoice No: ${invoiceNumber}<br>Date: ${invoiceDate}</p>
          </div>
        </div>

        <div class="client-info">
          <h3>BILL TO:</h3>
          <p>
            ${clientName}<br>
            ${clientEmail ? clientEmail + '<br>' : ''}
            ${clientPhone || ''}
          </p>
        </div>

        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
        </table>

        <div class="totals">
          <table>
            <tr>
              <td>Subtotal:</td>
              <td>${formatCurrency(subtotal)}</td>
            </tr>
            <tr>
              <td>VAT (20%):</td>
              <td>${formatCurrency(vatAmount)}</td>
            </tr>
            <tr class="total-row">
              <td>TOTAL:</td>
              <td>${formatCurrency(totalAmount)}</td>
            </tr>
          </table>
        </div>

        <div class="footer">
          <p>Thank you for your business. For any queries, please contact us at sales@example.com</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

module.exports = {
  generateInvoicePDF,
  generateAndUploadInvoicePDF,
  generateInvoiceHTML,
  formatCurrency,
  formatDate
};
