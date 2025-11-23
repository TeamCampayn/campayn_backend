-- Diagnostic script to check your current database structure

-- Check campaigns table structure
SELECT 'campaigns' as table_name, column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'campaigns' 
ORDER BY ordinal_position;

-- Check if other campaign-related tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_name IN ('campaign_creators', 'campaign_contents', 'campaign_payments', 'campaign_activities', 'campaign_performance')
ORDER BY table_name;

-- Check if there are any existing campaigns
SELECT COUNT(*) as existing_campaigns FROM campaigns WHERE TRUE;

-- Check brands table for sample data
SELECT COUNT(*) as existing_brands FROM brands WHERE TRUE;