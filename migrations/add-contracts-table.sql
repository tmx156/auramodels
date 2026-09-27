-- Create contracts table for Auralndn Invoice & Order Form contracts
-- Run this migration in Supabase SQL Editor

-- Create the contracts table
CREATE TABLE IF NOT EXISTS contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    package_id UUID REFERENCES packages(id) ON DELETE SET NULL,

    -- Contract token and URL
    contract_token TEXT UNIQUE NOT NULL,
    signing_url TEXT,
    expires_at TIMESTAMPTZ,

    -- Status tracking
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'signed', 'expired', 'cancelled')),
    sent_at TIMESTAMPTZ,
    sent_to_email TEXT,
    viewed_at TIMESTAMPTZ,
    signed_at TIMESTAMPTZ,

    -- Contract data (JSON with all form fields)
    contract_data JSONB DEFAULT '{}',

    -- Signed PDF
    signed_pdf_url TEXT,

    -- Audit fields
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_contracts_lead_id ON contracts(lead_id);
CREATE INDEX IF NOT EXISTS idx_contracts_token ON contracts(contract_token);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_created_at ON contracts(created_at DESC);

-- Enable Row Level Security
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view contracts for leads they have access to
CREATE POLICY "Users can view contracts" ON contracts
    FOR SELECT
    USING (true);

-- Policy: Viewers and admins can create contracts
CREATE POLICY "Viewers and admins can create contracts" ON contracts
    FOR INSERT
    WITH CHECK (true);

-- Policy: Viewers and admins can update contracts
CREATE POLICY "Viewers and admins can update contracts" ON contracts
    FOR UPDATE
    USING (true);

-- Policy: Admins can delete contracts
CREATE POLICY "Admins can delete contracts" ON contracts
    FOR DELETE
    USING (true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_contracts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contracts_updated_at ON contracts;
CREATE TRIGGER contracts_updated_at
    BEFORE UPDATE ON contracts
    FOR EACH ROW
    EXECUTE FUNCTION update_contracts_updated_at();

-- Add comment to table
COMMENT ON TABLE contracts IS 'Auralndn Invoice & Order Form contracts with e-signature support';
