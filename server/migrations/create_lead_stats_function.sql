-- Performance Optimization: Database function for lead statistics aggregation
-- This replaces the inefficient batch-fetching approach with native SQL aggregation
-- Expected performance improvement: 95% faster (10s → 0.5s)

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS get_lead_stats(timestamptz, timestamptz, uuid);
DROP FUNCTION IF EXISTS get_lead_stats(timestamptz, timestamptz, text);

-- Create optimized function for lead statistics
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
      AND postcode != 'ZZGHOST'  -- Exclude ghost bookings
  )
  SELECT
    COUNT(*)::bigint as total,
    COUNT(*) FILTER (WHERE status = 'New')::bigint as new_count,
    COUNT(*) FILTER (WHERE status = 'Booked')::bigint as booked_count,
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

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_lead_stats TO authenticated;
GRANT EXECUTE ON FUNCTION get_lead_stats TO anon;

-- Create indexes if they don't exist (for optimal query performance)
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_ever_booked ON leads(ever_booked);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_booker_id ON leads(booker_id);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_leads_created_at_status ON leads(created_at, status);
CREATE INDEX IF NOT EXISTS idx_leads_booker_created ON leads(booker_id, created_at);

COMMENT ON FUNCTION get_lead_stats IS 'Optimized aggregation function for lead statistics - returns counts by status in a single query';
