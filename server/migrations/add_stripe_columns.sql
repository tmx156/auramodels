-- Migration: Add Stripe columns to leads table
-- Purpose: Store Stripe payment method and customer IDs for booking deposits
-- Run this in Supabase SQL Editor

-- Add stripe_payment_method_id column
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS stripe_payment_method_id TEXT;

-- Add stripe_customer_id column
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- Add comment to document the columns
COMMENT ON COLUMN leads.stripe_payment_method_id IS 'Stripe payment method ID for no-show fee collection';
COMMENT ON COLUMN leads.stripe_customer_id IS 'Stripe customer ID for payment processing';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_leads_stripe_customer_id ON leads(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
