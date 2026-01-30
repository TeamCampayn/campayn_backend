-- ============================================================
-- Fix Siddhim Content - Link to Correct Creator
-- The reel DT5K5RvkwUH is from @jain_pathshala_n_family_values, not @jainism_talks
-- ============================================================

-- Step 1: Find the correct creator ID
SELECT id, name, ig_handle 
FROM creators 
WHERE ig_handle = 'jain_pathshala_n_family_values'
   OR ig_handle = '@jain_pathshala_n_family_values';

-- Step 2: Update the content to use the correct creator
UPDATE campaign_contents
SET 
    creator_id = (
        SELECT id FROM creators 
        WHERE ig_handle = 'jain_pathshala_n_family_values' 
           OR ig_handle = '@jain_pathshala_n_family_values'
        LIMIT 1
    ),
    updated_at = NOW()
WHERE post_url = 'https://www.instagram.com/reel/DT5K5RvkwUH/?igsh=ZTNoZGh4dXExdmd3';

-- Step 3: Verify the fix
SELECT 
    cnt.id as content_id,
    cnt.post_url,
    c.name as creator_name,
    c.ig_handle,
    cnt.performance_metrics
FROM campaign_contents cnt
JOIN creators c ON cnt.creator_id = c.id
WHERE cnt.post_url IS NOT NULL
AND cnt.campaign_id IN (
    SELECT id FROM campaigns WHERE campaign_name LIKE '%Siddhim%'
);
