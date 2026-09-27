-- Add HTML template columns to contract_templates table
-- Run this in Supabase SQL Editor

ALTER TABLE contract_templates
ADD COLUMN IF NOT EXISTS payment_details_html TEXT,
ADD COLUMN IF NOT EXISTS order_details_html TEXT;
