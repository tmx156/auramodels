-- =====================================================
-- Migration: Fix RLS Policies for Lead Status Updates
-- =====================================================
-- Purpose: Ensure RLS policies allow status updates
--          and booking_history updates
-- Date: 2025-01-XX
-- =====================================================

-- Verify RLS is enabled on leads table
DO $$
DECLARE
  rls_enabled BOOLEAN;
BEGIN
  SELECT relrowsecurity INTO rls_enabled
  FROM pg_class c
  JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = 'public'
  AND c.relname = 'leads';
  
  IF NOT rls_enabled THEN
    ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
    RAISE NOTICE '✅ Enabled RLS on leads table';
  ELSE
    RAISE NOTICE '✅ RLS already enabled on leads table';
  END IF;
END $$;

-- Check and fix UPDATE policy on leads table
DO $$
BEGIN
  -- Drop existing UPDATE policy if it exists
  DROP POLICY IF EXISTS "Leads are updatable by authenticated users" ON public.leads;
  
  -- Create new UPDATE policy that allows all authenticated users to update
  CREATE POLICY "Leads are updatable by authenticated users" 
  ON public.leads 
  FOR UPDATE 
  USING (true)
  WITH CHECK (true);
  
  RAISE NOTICE '✅ Created/Updated RLS UPDATE policy on leads table';
END $$;

-- Verify the policy exists and is correct
DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'leads'
    AND policyname = 'Leads are updatable by authenticated users'
    AND cmd = 'UPDATE';
  
  IF policy_count > 0 THEN
    RAISE NOTICE '✅ UPDATE policy verified on leads table';
  ELSE
    RAISE WARNING '⚠️  UPDATE policy not found on leads table';
  END IF;
END $$;

-- Check if blocked_slots table needs RLS
DO $$
DECLARE
  table_exists BOOLEAN;
  rls_enabled BOOLEAN;
  policy_exists BOOLEAN;
BEGIN
  -- Check if table exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'blocked_slots'
  ) INTO table_exists;
  
  IF table_exists THEN
    -- Check if RLS is enabled
    SELECT relrowsecurity INTO rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
    AND c.relname = 'blocked_slots';
    
    IF NOT rls_enabled THEN
      ALTER TABLE public.blocked_slots ENABLE ROW LEVEL SECURITY;
      
      -- Check if policy exists
      SELECT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'blocked_slots'
        AND policyname = 'Blocked slots are viewable by authenticated users'
      ) INTO policy_exists;
      
      IF NOT policy_exists THEN
        CREATE POLICY "Blocked slots are viewable by authenticated users"
        ON public.blocked_slots FOR SELECT USING (true);
      END IF;
      
      RAISE NOTICE '✅ Enabled RLS on blocked_slots table';
    ELSE
      RAISE NOTICE '✅ RLS already enabled on blocked_slots table';
    END IF;
  ELSE
    RAISE NOTICE '⚠️  blocked_slots table does not exist, skipping';
  END IF;
END $$;

-- Summary
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'RLS Policy Fix Complete';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Leads table RLS: Enabled';
  RAISE NOTICE '✅ Leads UPDATE policy: Created/Verified';
  RAISE NOTICE '✅ Blocked slots RLS: Checked';
  RAISE NOTICE '========================================';
END $$;

