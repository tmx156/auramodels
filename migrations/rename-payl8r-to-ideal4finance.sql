-- Payl8r is no longer used; the provider is Ideal4Finance.
--
-- The code rename is in server/utils/contractLabels.js, contractGenerator.js,
-- routes/contract-templates.js, routes/contracts.js, ContractEditor.js and
-- SendContractModal.js. Existing contracts.contract_data.paymentMethod values
-- were migrated from 'payl8r' to 'ideal4finance' separately (4 rows, backed up
-- to supabase_backup/payl8r_contracts_before_rename_2026-09-24.json).
--
-- This file clears the last place the old name could come back from: the column
-- default set by migrations/add-finance-template-fields.sql, which would apply
-- to any contract_templates row inserted without finance_provider_text.
--
-- Run this in the Supabase SQL Editor.

-- 1. Stop new rows defaulting to the old provider
ALTER TABLE contract_templates
  ALTER COLUMN finance_provider_text SET DEFAULT 'FINANCE VIA IDEAL4FINANCE';

-- 2. Scrub any saved wording that still names Payl8r.
--    (No rows matched at the time of writing - this is here for safety and for
--    any other environment restored from an older backup.)
UPDATE contract_templates
SET finance_provider_text = REPLACE(REPLACE(finance_provider_text, 'PAYL8R', 'IDEAL4FINANCE'), 'Payl8r', 'Ideal4Finance'),
    terms_and_conditions  = REPLACE(REPLACE(terms_and_conditions,  'PAYL8R', 'IDEAL4FINANCE'), 'Payl8r', 'Ideal4Finance'),
    finance_info_text     = REPLACE(REPLACE(finance_info_text,     'PAYL8R', 'IDEAL4FINANCE'), 'Payl8r', 'Ideal4Finance')
WHERE finance_provider_text ILIKE '%payl8%'
   OR terms_and_conditions  ILIKE '%payl8%'
   OR finance_info_text     ILIKE '%payl8%';

-- 3. Catch any contract that still stores the old payment method.
--    The application also still accepts 'payl8r' when rendering, so an
--    unmigrated row would display correctly either way.
UPDATE contracts
SET contract_data = jsonb_set(contract_data, '{paymentMethod}', '"ideal4finance"')
WHERE contract_data->>'paymentMethod' = 'payl8r';
