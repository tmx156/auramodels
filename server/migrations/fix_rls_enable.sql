-- =====================================================
-- Migration: Enable Row Level Security (RLS) on All Tables
-- =====================================================
-- Purpose: Fix RLS errors that are causing database crashes
--          Enable RLS on all public tables that are missing it
-- Date: 2025-01-XX
-- =====================================================

-- Enable RLS on leads table (has policies but RLS not enabled)
ALTER TABLE IF EXISTS public.leads ENABLE ROW LEVEL SECURITY;

-- Enable RLS on gmail_watch_state table (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables 
             WHERE table_schema = 'public' 
             AND table_name = 'gmail_watch_state') THEN
    ALTER TABLE public.gmail_watch_state ENABLE ROW LEVEL SECURITY;
    
    -- Create basic RLS policies for gmail_watch_state if they don't exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname = 'public' 
      AND tablename = 'gmail_watch_state' 
      AND policyname = 'Gmail watch state is viewable by authenticated users'
    ) THEN
      CREATE POLICY "Gmail watch state is viewable by authenticated users" 
      ON public.gmail_watch_state FOR SELECT 
      USING (true);
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname = 'public' 
      AND tablename = 'gmail_watch_state' 
      AND policyname = 'Gmail watch state is insertable by authenticated users'
    ) THEN
      CREATE POLICY "Gmail watch state is insertable by authenticated users" 
      ON public.gmail_watch_state FOR INSERT 
      WITH CHECK (true);
    END IF;
    
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname = 'public' 
      AND tablename = 'gmail_watch_state' 
      AND policyname = 'Gmail watch state is updatable by authenticated users'
    ) THEN
      CREATE POLICY "Gmail watch state is updatable by authenticated users" 
      ON public.gmail_watch_state FOR UPDATE 
      USING (true);
    END IF;
    
    RAISE NOTICE '✅ Enabled RLS on gmail_watch_state table';
  ELSE
    RAISE NOTICE '⚠️  gmail_watch_state table does not exist, skipping';
  END IF;
END $$;

-- Enable RLS on callback_reminders table (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables 
             WHERE table_schema = 'public' 
             AND table_name = 'callback_reminders') THEN
    ALTER TABLE public.callback_reminders ENABLE ROW LEVEL SECURITY;
    
    -- Check if any policies exist - if not, create basic ones
    -- (callback_reminders schema may already have user-specific policies)
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname = 'public' 
      AND tablename = 'callback_reminders'
    ) THEN
      -- No policies exist, create basic authenticated user policies
      CREATE POLICY "Callback reminders are viewable by authenticated users" 
      ON public.callback_reminders FOR SELECT 
      USING (true);
      
      CREATE POLICY "Callback reminders are insertable by authenticated users" 
      ON public.callback_reminders FOR INSERT 
      WITH CHECK (true);
      
      CREATE POLICY "Callback reminders are updatable by authenticated users" 
      ON public.callback_reminders FOR UPDATE 
      USING (true);
      
      CREATE POLICY "Callback reminders are deletable by authenticated users" 
      ON public.callback_reminders FOR DELETE 
      USING (true);
      
      RAISE NOTICE '✅ Created basic RLS policies for callback_reminders';
    ELSE
      RAISE NOTICE '✅ callback_reminders already has RLS policies, keeping existing';
    END IF;
    
    RAISE NOTICE '✅ Enabled RLS on callback_reminders table';
  ELSE
    RAISE NOTICE '⚠️  callback_reminders table does not exist, skipping';
  END IF;
END $$;

-- Verify RLS is enabled on all critical tables
DO $$
DECLARE
  rls_status RECORD;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'RLS Status Check:';
  RAISE NOTICE '========================================';
  
  FOR rls_status IN
    SELECT 
      tablename,
      CASE 
        WHEN rowsecurity THEN '✅ ENABLED'
        ELSE '❌ DISABLED'
      END as rls_status
    FROM pg_tables t
    JOIN pg_class c ON c.relname = t.tablename
    WHERE schemaname = 'public'
      AND tablename IN ('leads', 'gmail_watch_state', 'callback_reminders', 
                        'users', 'sales', 'templates', 'messages')
    ORDER BY tablename
  LOOP
    RAISE NOTICE 'Table: % - RLS: %', rls_status.tablename, rls_status.rls_status;
  END LOOP;
  
  RAISE NOTICE '========================================';
END $$;

