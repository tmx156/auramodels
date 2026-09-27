-- Make every contract section editable.
-- All static labels/headings on the contract and finance agreement are stored
-- as overrides in one JSONB column, so new editable labels never need another
-- migration. Defaults live in server/utils/contractLabels.js.
--
-- Run this in the Supabase SQL Editor.

ALTER TABLE contract_templates
  ADD COLUMN IF NOT EXISTS labels JSONB DEFAULT '{}'::jsonb;

UPDATE contract_templates
  SET labels = '{}'::jsonb
  WHERE labels IS NULL;
