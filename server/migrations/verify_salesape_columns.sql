-- Quick verification query - run this to check if columns exist
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'leads'
    AND column_name LIKE 'salesape%'
ORDER BY column_name;

