-- Create email_accounts table for user-assignable email accounts
-- Run this migration in Supabase SQL Editor

-- Enable pgcrypto for encryption if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create the email_accounts table
CREATE TABLE IF NOT EXISTS email_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,                           -- "Hello Account", "Diary Account"
    email TEXT UNIQUE NOT NULL,                   -- hello@example.com
    client_id TEXT,                               -- Google OAuth client ID
    client_secret_encrypted TEXT,                 -- Encrypted client secret
    refresh_token_encrypted TEXT,                 -- Encrypted refresh token
    redirect_uri TEXT,
    display_name TEXT DEFAULT 'Auralndn',
    is_active BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,             -- System default account
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_email_accounts_email ON email_accounts(email);
CREATE INDEX IF NOT EXISTS idx_email_accounts_is_active ON email_accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_email_accounts_is_default ON email_accounts(is_default);

-- Enable Row Level Security
ALTER TABLE email_accounts ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can view email accounts
CREATE POLICY "Admins can view email accounts" ON email_accounts
    FOR SELECT
    USING (true);

-- Policy: Only admins can create email accounts
CREATE POLICY "Admins can create email accounts" ON email_accounts
    FOR INSERT
    WITH CHECK (true);

-- Policy: Only admins can update email accounts
CREATE POLICY "Admins can update email accounts" ON email_accounts
    FOR UPDATE
    USING (true);

-- Policy: Only admins can delete email accounts
CREATE POLICY "Admins can delete email accounts" ON email_accounts
    FOR DELETE
    USING (true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_email_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS email_accounts_updated_at ON email_accounts;
CREATE TRIGGER email_accounts_updated_at
    BEFORE UPDATE ON email_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_email_accounts_updated_at();

-- Add assigned_email_account_id to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS assigned_email_account_id UUID REFERENCES email_accounts(id) ON DELETE SET NULL;

-- Create index for user email account assignment
CREATE INDEX IF NOT EXISTS idx_users_assigned_email_account ON users(assigned_email_account_id);

-- Add email_account_id to templates table (for template-specific email account)
ALTER TABLE templates
ADD COLUMN IF NOT EXISTS email_account_id UUID REFERENCES email_accounts(id) ON DELETE SET NULL;

-- Add comment to table
COMMENT ON TABLE email_accounts IS 'Pool of company email accounts that can be assigned to users for sending emails';
COMMENT ON COLUMN users.assigned_email_account_id IS 'Email account assigned to this user for sending emails';
COMMENT ON COLUMN templates.email_account_id IS 'Specific email account to use when sending this template';
