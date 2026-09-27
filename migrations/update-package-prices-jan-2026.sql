-- =====================================================
-- Migration: Update Package Values (January 2026)
-- =====================================================
-- Updates main package total_value (the "was" price shown crossed out):
-- INTRO: £1199
-- SILVER: £3100
-- GOLD: £3600
-- PLATINUM: £4800
--
-- Note: The actual price (what customer pays) remains unchanged.
-- =====================================================

-- Update INTRO package value
UPDATE packages
SET total_value = 1199.00,
    updated_at = NOW()
WHERE code = 'intro';

-- Update SILVER package value
UPDATE packages
SET total_value = 3100.00,
    updated_at = NOW()
WHERE code = 'silver';

-- Update GOLD package value
UPDATE packages
SET total_value = 3600.00,
    updated_at = NOW()
WHERE code = 'gold';

-- Update PLATINUM package value
UPDATE packages
SET total_value = 4800.00,
    updated_at = NOW()
WHERE code = 'platinum';

-- Verify the updates
SELECT code, name, price, total_value FROM packages WHERE type = 'main' ORDER BY display_order;
