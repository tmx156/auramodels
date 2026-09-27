-- Add finance contract detail columns to finance table
-- These store the full affordability & loan data from the finance contract

-- Loan details
ALTER TABLE finance ADD COLUMN IF NOT EXISTS cash_price NUMERIC DEFAULT 0;
ALTER TABLE finance ADD COLUMN IF NOT EXISTS admin_fee NUMERIC DEFAULT 0;
ALTER TABLE finance ADD COLUMN IF NOT EXISTS apr NUMERIC DEFAULT 0;
ALTER TABLE finance ADD COLUMN IF NOT EXISTS total_charge_for_credit NUMERIC DEFAULT 0;
ALTER TABLE finance ADD COLUMN IF NOT EXISTS total_amount_payable NUMERIC DEFAULT 0;

-- Customer details
ALTER TABLE finance ADD COLUMN IF NOT EXISTS customer_dob TEXT;
ALTER TABLE finance ADD COLUMN IF NOT EXISTS years_at_address TEXT;

-- Affordability assessment
ALTER TABLE finance ADD COLUMN IF NOT EXISTS monthly_income NUMERIC DEFAULT 0;
ALTER TABLE finance ADD COLUMN IF NOT EXISTS priority_outgoings NUMERIC DEFAULT 0;
ALTER TABLE finance ADD COLUMN IF NOT EXISTS other_outgoings NUMERIC DEFAULT 0;
ALTER TABLE finance ADD COLUMN IF NOT EXISTS disposable_balance NUMERIC DEFAULT 0;
ALTER TABLE finance ADD COLUMN IF NOT EXISTS agreed_instalment NUMERIC DEFAULT 0;

-- Creditor info
ALTER TABLE finance ADD COLUMN IF NOT EXISTS creditor_name TEXT;
ALTER TABLE finance ADD COLUMN IF NOT EXISTS creditor_date TEXT;

-- Link to signed contract
ALTER TABLE finance ADD COLUMN IF NOT EXISTS contract_id TEXT;
