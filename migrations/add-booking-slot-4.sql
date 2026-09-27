-- Migration: Allow booking_slot = 4 (add 4th diary slot)
-- Date: 2026-04-20

-- Drop the old CHECK constraint on booking_slot and add new one allowing 1-4
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_booking_slot_check;
ALTER TABLE leads ADD CONSTRAINT leads_booking_slot_check CHECK (booking_slot IN (1, 2, 3, 4));

-- Also update blocked_slots if it has a constraint on slot_number
ALTER TABLE blocked_slots DROP CONSTRAINT IF EXISTS blocked_slots_slot_number_check;
ALTER TABLE blocked_slots ADD CONSTRAINT blocked_slots_slot_number_check CHECK (slot_number IN (1, 2, 3, 4));
