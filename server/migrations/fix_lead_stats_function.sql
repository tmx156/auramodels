-- Fix get_lead_stats function to exclude ghost bookings and ensure it works correctly

-- First, drop all existing variants of the function
-- We need to specify the exact signature for each variant
DO $$ 
DECLARE
  func_record RECORD;
BEGIN
  -- Find all get_lead_stats functions and drop them
  FOR func_record IN 
    SELECT 
      p.proname as func_name,
      pg_get_function_identity_arguments(p.oid) as func_args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' 
      AND p.proname = 'get_lead_stats'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %I.%I(%s) CASCADE', 
      'public', 
      func_record.func_name, 
      func_record.func_args
    );
    RAISE NOTICE 'Dropped function: get_lead_stats(%)', func_record.func_args;
  END LOOP;
END $$;

-- Create optimized function for lead statistics with ghost booking exclusion
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
AS $$
BEGIN
  RETURN QUERY
  WITH filtered_leads AS (
    SELECT
      status,
      booker_id
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
    COUNT(*) FILTER (WHERE status = 'Booked')::bigint as booked_count,  -- Fixed: Use status, not ever_booked
    COUNT(*) FILTER (WHERE status = 'Attended')::bigint as attended_count,
    COUNT(*) FILTER (WHERE status = 'Cancelled')::bigint as cancelled_count,
    COUNT(*) FILTER (WHERE booker_id IS NOT NULL)::bigint as assigned_count,
    COUNT(*) FILTER (WHERE status = 'Rejected')::bigint as rejected_count,
    COUNT(*) FILTER (WHERE status = 'Call Back')::bigint as callback_count,
    COUNT(*) FILTER (WHERE status = 'No Answer')::bigint as no_answer_count,
    COUNT(*) FILTER (WHERE status = 'Not Interested')::bigint as not_interested_count,
    COUNT(*) FILTER (WHERE status = 'Wrong number')::bigint as wrong_number_count
  FROM filtered_leads;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_lead_stats(timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_lead_stats(timestamptz, timestamptz, text) TO anon;

COMMENT ON FUNCTION get_lead_stats(timestamptz, timestamptz, text) IS 'Optimized aggregation function for lead statistics - returns counts by status in a single query, excludes ghost bookings';
