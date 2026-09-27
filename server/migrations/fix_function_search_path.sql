-- =====================================================
-- Migration: Fix Function Search Path Security Issues
-- =====================================================
-- Purpose: Add SET search_path to all functions to prevent
--          search path injection attacks (security best practice)
-- Date: 2025-01-XX
-- =====================================================

-- Fix 1: update_updated_at_column function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Fix 2: update_gmail_watch_state_updated_at function
CREATE OR REPLACE FUNCTION update_gmail_watch_state_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Fix 3: get_lead_stats function
CREATE OR REPLACE FUNCTION get_lead_stats(
  start_date timestamptz DEFAULT NULL,
  end_date timestamptz DEFAULT NULL,
  booker_user_id text DEFAULT NULL
)
RETURNS TABLE (
  total bigint,
  new_count bigint,
  booked_count bigint,
  attended_count bigint,
  cancelled_count bigint,
  assigned_count bigint,
  rejected_count bigint,
  callback_count bigint,
  no_answer_count bigint,
  not_interested_count bigint,
  wrong_number_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH filtered_leads AS (
    SELECT
      status
    FROM leads
    WHERE
      (start_date IS NULL OR created_at >= start_date)
      AND (end_date IS NULL OR created_at <= end_date)
      AND (booker_user_id IS NULL OR booker_id::text = booker_user_id)
      AND (postcode IS NULL OR postcode != 'ZZGHOST')  -- Exclude ghost bookings
  )
  SELECT
    COUNT(*)::bigint as total,
    COUNT(*) FILTER (WHERE status = 'New')::bigint as new_count,
    COUNT(*) FILTER (WHERE status = 'Booked')::bigint as booked_count,
    COUNT(*) FILTER (WHERE status = 'Attended')::bigint as attended_count,
    COUNT(*) FILTER (WHERE status = 'Cancelled')::bigint as cancelled_count,
    COUNT(*) FILTER (WHERE status = 'Assigned')::bigint as assigned_count,
    COUNT(*) FILTER (WHERE status = 'Rejected')::bigint as rejected_count,
    COUNT(*) FILTER (WHERE status = 'Call Back')::bigint as callback_count,
    COUNT(*) FILTER (WHERE status = 'No Answer')::bigint as no_answer_count,
    COUNT(*) FILTER (WHERE status = 'Not Interested')::bigint as not_interested_count,
    COUNT(*) FILTER (WHERE status = 'Wrong number')::bigint as wrong_number_count
  FROM filtered_leads;
END;
$$;

-- Fix 4: update_user_stats function (if it exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' 
    AND p.proname = 'update_user_stats'
  ) THEN
    -- Function exists, update it with search_path
    -- Note: We need to get the function signature first
    EXECUTE (
      SELECT 'CREATE OR REPLACE FUNCTION update_user_stats' || 
             pg_get_function_identity_arguments(p.oid) || ' ' ||
             'RETURNS ' || pg_get_function_result(p.oid) || ' ' ||
             'LANGUAGE ' || l.lanname || ' ' ||
             'SECURITY DEFINER ' ||
             'SET search_path = public ' ||
             'AS $func$' || pg_get_functiondef(p.oid) || '$func$'
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      JOIN pg_language l ON p.prolang = l.oid
      WHERE n.nspname = 'public' 
      AND p.proname = 'update_user_stats'
      LIMIT 1
    );
    RAISE NOTICE '✅ Fixed update_user_stats function';
  ELSE
    RAISE NOTICE '⚠️  update_user_stats function does not exist, skipping';
  END IF;
END $$;

-- Fix 5: ensure_message_content function (if it exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' 
    AND p.proname = 'ensure_message_content'
  ) THEN
    -- Function exists, update it with search_path
    EXECUTE (
      SELECT 'CREATE OR REPLACE FUNCTION ensure_message_content' || 
             pg_get_function_identity_arguments(p.oid) || ' ' ||
             'RETURNS ' || pg_get_function_result(p.oid) || ' ' ||
             'LANGUAGE ' || l.lanname || ' ' ||
             'SECURITY DEFINER ' ||
             'SET search_path = public ' ||
             'AS $func$' || pg_get_functiondef(p.oid) || '$func$'
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      JOIN pg_language l ON p.prolang = l.oid
      WHERE n.nspname = 'public' 
      AND p.proname = 'ensure_message_content'
      LIMIT 1
    );
    RAISE NOTICE '✅ Fixed ensure_message_content function';
  ELSE
    RAISE NOTICE '⚠️  ensure_message_content function does not exist, skipping';
  END IF;
END $$;

-- Verify all functions now have search_path set
DO $$
DECLARE
  func_record RECORD;
  func_count INTEGER := 0;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Function Search Path Status:';
  RAISE NOTICE '========================================';
  
  FOR func_record IN
    SELECT 
      p.proname as func_name,
      CASE 
        WHEN p.proconfig IS NULL THEN '❌ NO search_path'
        WHEN array_to_string(p.proconfig, ', ') LIKE '%search_path%' THEN '✅ HAS search_path'
        ELSE '❌ NO search_path'
      END as search_path_status
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'update_updated_at_column',
        'update_gmail_watch_state_updated_at',
        'get_lead_stats',
        'update_user_stats',
        'ensure_message_content'
      )
    ORDER BY p.proname
  LOOP
    RAISE NOTICE 'Function: % - %', func_record.func_name, func_record.search_path_status;
    IF func_record.search_path_status LIKE '%✅%' THEN
      func_count := func_count + 1;
    END IF;
  END LOOP;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Fixed: % out of 5 functions', func_count;
  RAISE NOTICE '========================================';
END $$;

