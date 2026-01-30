-- ============================================================
-- Clear Mock Performance Metrics from Campaign Contents
-- This removes the fake/mock data so real API data is displayed
-- ============================================================

-- Step 1: View current mock data
SELECT 
    cnt.id,
    c.ig_handle,
    cnt.post_url,
    cnt.performance_metrics
FROM campaign_contents cnt
JOIN creators c ON cnt.creator_id = c.id
WHERE cnt.post_url IS NOT NULL
AND cnt.campaign_id IN (SELECT id FROM campaigns WHERE campaign_name LIKE '%Siddhim%');

-- Step 2: Clear mock performance_metrics (set to empty object)
-- This forces the frontend to use only real Instagram API data
UPDATE campaign_contents
SET 
    performance_metrics = '{}',
    updated_at = NOW()
WHERE post_url IS NOT NULL
AND campaign_id IN (SELECT id FROM campaigns WHERE campaign_name LIKE '%Siddhim%');

-- Step 3: Verify the update
SELECT 
    cnt.id,
    c.ig_handle,
    cnt.post_url,
    cnt.performance_metrics
FROM campaign_contents cnt
JOIN creators c ON cnt.creator_id = c.id
WHERE cnt.post_url IS NOT NULL
AND cnt.campaign_id IN (SELECT id FROM campaigns WHERE campaign_name LIKE '%Siddhim%');
