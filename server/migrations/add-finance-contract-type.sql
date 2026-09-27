-- Add contract_type column to contracts table
-- 'invoice' = existing Invoice & Order Form (default for all existing contracts)
-- 'finance' = new Finance Agreement & Affordability Assessment
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS contract_type TEXT DEFAULT 'invoice';
CREATE INDEX IF NOT EXISTS idx_contracts_type ON contracts(contract_type);

-- Add finance template fields to contract_templates table
ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS creditor_trading_as TEXT;
ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS key_information_text TEXT;
ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS customer_agreement_text TEXT;
ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS creditor_acknowledgement_text TEXT;
ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS cca_notice TEXT;
