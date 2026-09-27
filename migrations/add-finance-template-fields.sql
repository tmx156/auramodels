-- Add Finance Section Template Fields to contract_templates
-- These fields control the labels/text shown when finance payment is selected

-- Finance payment labels
ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS finance_payment_label VARCHAR(100) DEFAULT 'DEPOSIT TODAY';
ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS non_finance_payment_label VARCHAR(100) DEFAULT 'PAYMENT TODAY';

-- Finance breakdown labels
ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS finance_deposit_label VARCHAR(100) DEFAULT 'DEPOSIT PAID';
ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS finance_amount_label VARCHAR(100) DEFAULT 'FINANCE AMOUNT';

-- Finance provider info
ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS finance_provider_text VARCHAR(255) DEFAULT 'FINANCE VIA PAYL8R';
ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS finance_info_text VARCHAR(255) DEFAULT 'Complete docs before receipt';

-- Payment section
ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS cash_initial_text VARCHAR(255) DEFAULT '';

-- Update existing templates with defaults (if columns were added with NULL)
UPDATE contract_templates SET
  finance_payment_label = COALESCE(finance_payment_label, 'DEPOSIT TODAY'),
  non_finance_payment_label = COALESCE(non_finance_payment_label, 'PAYMENT TODAY'),
  finance_deposit_label = COALESCE(finance_deposit_label, 'DEPOSIT PAID'),
  finance_amount_label = COALESCE(finance_amount_label, 'FINANCE AMOUNT'),
  finance_provider_text = COALESCE(finance_provider_text, 'FINANCE VIA PAYL8R'),
  finance_info_text = COALESCE(finance_info_text, 'Complete docs before receipt'),
  cash_initial_text = COALESCE(cash_initial_text, '')
WHERE is_active = true;
