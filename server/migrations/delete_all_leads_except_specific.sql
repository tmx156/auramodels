-- Migration: Delete all leads except specific ones
-- Purpose: Keep only Sandra Poon, Alan Rutherford, and Tinashe Mamire
-- Run this in Supabase SQL Editor

-- First, let's find the IDs of the leads to keep
DO $$
DECLARE
    sandra_id UUID;
    alan_id UUID;
    tinashe_id UUID;
    leads_to_keep UUID[];
    total_leads_before INT;
    total_leads_after INT;
    deleted_count INT;
BEGIN
    -- Find Sandra Poon by phone and postcode
    SELECT id INTO sandra_id
    FROM leads
    WHERE phone = '+447964037793' 
       OR postcode ILIKE 'N7%7FJ%'
       OR (name ILIKE '%Sandra%' AND name ILIKE '%Poon%')
    LIMIT 1;
    
    -- Find Alan Rutherford by phone and postcode
    SELECT id INTO alan_id
    FROM leads
    WHERE phone = '+447984976030'
       OR postcode ILIKE 'W44ED%'
       OR (name ILIKE '%Alan%' AND name ILIKE '%Rutherford%')
    LIMIT 1;
    
    -- Find Tinashe Mamire by postcode and name
    SELECT id INTO tinashe_id
    FROM leads
    WHERE postcode ILIKE 'EN6%3PU%'
       OR (name ILIKE '%Tinashe%' AND name ILIKE '%Mamire%')
    LIMIT 1;
    
    -- Build array of IDs to keep (filter out NULLs)
    leads_to_keep := ARRAY[]::UUID[];
    IF sandra_id IS NOT NULL THEN
        leads_to_keep := array_append(leads_to_keep, sandra_id);
    END IF;
    IF alan_id IS NOT NULL THEN
        leads_to_keep := array_append(leads_to_keep, alan_id);
    END IF;
    IF tinashe_id IS NOT NULL THEN
        leads_to_keep := array_append(leads_to_keep, tinashe_id);
    END IF;
    
    -- Get count before deletion
    SELECT COUNT(*) INTO total_leads_before FROM leads;
    
    -- Log the leads we're keeping
    RAISE NOTICE 'Leads to keep:';
    IF sandra_id IS NOT NULL THEN
        RAISE NOTICE '  - Sandra Poon: %', sandra_id;
    ELSE
        RAISE NOTICE '  - Sandra Poon: NOT FOUND';
    END IF;
    IF alan_id IS NOT NULL THEN
        RAISE NOTICE '  - Alan Rutherford: %', alan_id;
    ELSE
        RAISE NOTICE '  - Alan Rutherford: NOT FOUND';
    END IF;
    IF tinashe_id IS NOT NULL THEN
        RAISE NOTICE '  - Tinashe Mamire: %', tinashe_id;
    ELSE
        RAISE NOTICE '  - Tinashe Mamire: NOT FOUND';
    END IF;
    
    RAISE NOTICE 'Total leads before deletion: %', total_leads_before;
    RAISE NOTICE 'Leads to keep: %', array_length(leads_to_keep, 1);
    
    -- Delete all leads NOT in the keep list
    -- Also delete related sales records first
    IF array_length(leads_to_keep, 1) > 0 THEN
        -- Delete sales for leads that will be deleted
        DELETE FROM sales
        WHERE lead_id NOT IN (SELECT unnest(leads_to_keep));
        
        -- Delete the leads
        DELETE FROM leads
        WHERE id NOT IN (SELECT unnest(leads_to_keep));
        
        GET DIAGNOSTICS deleted_count = ROW_COUNT;
    ELSE
        RAISE EXCEPTION 'No leads found to keep! Aborting deletion to prevent deleting all leads.';
    END IF;
    
    -- Get count after deletion
    SELECT COUNT(*) INTO total_leads_after FROM leads;
    
    RAISE NOTICE 'Deleted % leads', deleted_count;
    RAISE NOTICE 'Total leads after deletion: %', total_leads_after;
    RAISE NOTICE 'Migration completed successfully';
END $$;

-- Verify the results
SELECT 
    id,
    name,
    phone,
    postcode,
    status,
    created_at
FROM leads
ORDER BY name;

