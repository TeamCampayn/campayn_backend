-- Clear Existing Creator Data
-- Run this in Supabase SQL Editor before importing HashFame CSV

-- Step 1: Check current creator count
SELECT 'Current creator count:' as info, COUNT(*) as count FROM creators;

-- Step 2: Check if any creators are linked to campaigns
SELECT 
  'Creators linked to campaigns:' as info, 
  COUNT(DISTINCT creator_id) as linked_creators 
FROM campaign_creators;

-- Step 3: (Optional) If you want to also clear campaign-creator relationships:
-- UNCOMMENT the line below if you want to delete campaign_creators too
-- DELETE FROM campaign_creators;

-- Step 4: Delete all creators
DELETE FROM creators;

-- Step 5: Reset sequence if needed (optional)
-- This ensures IDs start fresh, but UUIDs don't need this

-- Step 6: Verify deletion
SELECT 
  'After deletion:' as status,
  COUNT(*) as remaining_creators 
FROM creators;

-- Success message
SELECT '✅ Creators table cleared and ready for HashFame import!' as result;
