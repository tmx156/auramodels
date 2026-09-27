/**
 * Migration: Add Contract Signing Email Template
 * Run: node migrations/add-contract-signing-template.js
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const contractSigningTemplate = {
  id: `template-contract-signing-${Date.now()}`,
  name: 'Contract Signing Invitation',
  type: 'contract_signing',
  subject: 'Auralndn - Your Contract is Ready for Signing',
  email_body: `<!DOCTYPE html>
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
      <p class="greeting">Dear {customerName},</p>
      <p class="intro">Thank you for choosing Auralndn! Your contract is ready for review and signing. Please complete this within 7 days to confirm your order.</p>
      <div class="order-summary">
        <h4>Order Summary</h4>
        <p><strong>Total Amount:</strong> {totalAmount} (inc. VAT)</p>
        <p><strong>Details:</strong> {packageInfo}</p>
      </div>
      <div class="button-container">
        <a href="{signingUrl}" class="button">Review & Sign Contract</a>
      </div>
      <div class="instructions">
        <h3>How to Complete Your Contract:</h3>
        <ol>
          <li><strong>Click the button above</strong> to open your contract</li>
          <li><strong>Review the contract</strong> - Check all your details are correct</li>
          <li><strong>Sign in the signature boxes</strong> - Use your mouse or finger to sign</li>
          <li><strong>Complete all 5 signatures</strong> on both pages</li>
          <li><strong>Click "Submit Signed Contract"</strong> to finish</li>
        </ol>
      </div>
      <div class="warning">
        <strong>Important:</strong> This link will expire in 7 days. Please complete your signing before then.
      </div>
      <p>If the button above doesn't work, copy and paste this link into your browser:</p>
      <div class="link-backup">{signingUrl}</div>
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
</html>`,
  sms_body: 'Hi {customerName}, your Auralndn contract is ready for signing. Please complete within 7 days: {signingUrl}',
  is_active: true,
  is_default: true,
  send_email: true,
  send_sms: true,  // SMS enabled by default for contract signing
  email_account: 'primary',
  category: 'sales',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

async function addContractSigningTemplate() {
  console.log('Adding Contract Signing email template...');

  // Check if template already exists
  const { data: existing } = await supabase
    .from('templates')
    .select('id')
    .eq('name', 'Contract Signing Invitation')
    .single();

  if (existing) {
    console.log('Template already exists, updating...');
    const { error } = await supabase
      .from('templates')
      .update({
        ...contractSigningTemplate,
        id: existing.id
      })
      .eq('id', existing.id);

    if (error) {
      console.error('Error updating template:', error);
      process.exit(1);
    }
    console.log('Template updated successfully!');
  } else {
    const { error } = await supabase
      .from('templates')
      .insert([contractSigningTemplate]);

    if (error) {
      console.error('Error inserting template:', error);
      process.exit(1);
    }
    console.log('Template created successfully!');
  }

  console.log('\nTemplate Variables:');
  console.log('  {customerName} - Customer name');
  console.log('  {totalAmount} - Order total (e.g., £999.00)');
  console.log('  {packageInfo} - Package details/notes');
  console.log('  {signingUrl} - Contract signing link');

  process.exit(0);
}

addContractSigningTemplate();
