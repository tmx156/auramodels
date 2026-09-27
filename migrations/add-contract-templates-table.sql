-- Contract Templates Table
-- Stores customizable contract template content

CREATE TABLE IF NOT EXISTS contract_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL DEFAULT 'Default Contract',
  is_active BOOLEAN DEFAULT true,

  -- Page 1: Header & Company Info
  company_name VARCHAR(255) DEFAULT 'AURALNDN',
  company_website VARCHAR(255) DEFAULT 'www.example.com',
  company_address VARCHAR(500) DEFAULT '129A Weedington Rd, London NW5 4NX',

  -- Page 1: Title Section
  form_title VARCHAR(255) DEFAULT 'INVOICE & ORDER FORM',
  form_subtitle TEXT DEFAULT 'PLEASE CHECK YOUR ORDER BEFORE LEAVING YOUR VIEWING',
  form_contact_info TEXT DEFAULT 'FOR ALL ENQUIRIES PLEASE EMAIL CUSTOMER SERVICES ON SALES@EXAMPLE.COM',

  -- Page 1: Terms and Conditions
  terms_and_conditions TEXT DEFAULT 'By signing this invoice, you confirm that you have viewed, selected and approved all images and all cropping, editing and adjustments. You understand that all orders are final and due to the immediate nature of digital delivery this order is strictly non-refundable, non-cancellable and non-amendable once you leave the premises, without affecting your statutory rights. All digital products, including images, efolios and Z-cards and Project Influencer are delivered immediately upon full payment. Project Influencer has been added to this order as a complimentary addition to your purchased package and holds no independent monetary value. By signing you accept responsibility for downloading, backing up and securely storing your files once they are provided. Finance customers must complete all Payl8r documentation prior to receipt of goods. Efolios include 10 images and hosting for 1 year, which may require renewal thereafter; content may be removed if renewal fees are unpaid. You own the copyright to all images purchased and unless you opt out in writing at the time of signing, Auralndn may use your images for promotional purposes (above) including, but not limited to, display on its website and social media channels. You acknowledge that Auralndn is not a talent casting company/agency and does not guarantee work, representation or casting opportunities. Auralndn accepts no liability for compatibility issues, loss of files after delivery, missed opportunities, or indirect losses and total liability is limited to the amount paid for your order. All personal data is processed in accordance with GDPR and used only to fulfil your order or meet legal requirements. By signing below, you acknowledge that you have read, understood and agree to these Terms & Conditions. For any post-delivery assistance, please contact sales@example.com',

  -- Page 1: Signature Section Text
  signature_instruction TEXT DEFAULT 'PLEASE SIGN BELOW TO INDICATE YOUR ACCEPTANCE OF THE ABOVE TERMS, AND ENSURE YOU RECEIVE YOUR OWN SIGNED COPY OF THIS INVOICE FOR YOUR RECORDS',

  -- Page 1: Footer
  footer_line1 VARCHAR(255) DEFAULT 'Auralndn is a trading name of S&A Advertising Ltd',
  footer_line2 VARCHAR(255) DEFAULT 'Company No 8708429 VAT Reg No 171339904',

  -- Page 2: Confirmation Box Texts
  confirmation1_text TEXT DEFAULT 'I understand that Auralndn is <strong>not a talent casting company/agency and will not find me work.</strong>',
  confirmation2_text TEXT DEFAULT 'I understand that once I leave the premises I <strong>cannot cancel</strong>, amend or reduce the order.',
  confirmation3_text TEXT DEFAULT 'I confirm that I am happy for Auralndn to <strong>pass on details and photos</strong> of the client named on this order form. Talent Agencies we pass your details to typically charge between £50 - £200 to register onto their books',
  confirmation4_text TEXT DEFAULT 'I confirm that I''m happy and comfortable with my decision to purchase.',

  -- Image permission text
  image_permission_text TEXT DEFAULT 'I give permission for Auralndn to use my images',
  image_no_permission_text TEXT DEFAULT 'I DO NOT give permission for Auralndn to use my images',

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_contract_templates_active ON contract_templates(is_active);

-- Insert default template
INSERT INTO contract_templates (name, is_active)
VALUES ('Default Contract', true)
ON CONFLICT DO NOTHING;

-- Enable RLS
ALTER TABLE contract_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow authenticated read" ON contract_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert" ON contract_templates
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated update" ON contract_templates
  FOR UPDATE TO authenticated USING (true);
