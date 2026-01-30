-- ============================================================
-- Update Siddhim Campaign Content with Complete Metrics
-- This adds followers count for proper engagement rate calculation
-- ============================================================

-- First, let's see what content exists
SELECT 
    cnt.id,
    cnt.post_url,
    cnt.content_type,
    cr.name as creator_name,
    cr.ig_handle,
    cr.ig_followers,
    cnt.performance_metrics
FROM campaign_contents cnt
JOIN campaigns c ON cnt.campaign_id = c.id
JOIN brands b ON c.brand_id = b.id
JOIN creators cr ON cnt.creator_id = cr.id
WHERE b.brand_name = 'Siddhim Global School';

-- Update the content with complete metrics including followers
-- This is for the @jainism_talks reel
UPDATE campaign_contents cnt
SET 
    performance_metrics = jsonb_build_object(
        'likes', 2847,
        'comments', 156,
        'views', 78500,
        'shares', 342,
        'saves', 1205,
        'followers', 245000,
        'reach', 125000,
        'impressions', 185000,
        'engagement_rate', 1.23
    ),
    thumbnail_url = 'https://images.unsplash.com/photo-1577896851231-70ef18881754?w=400&h=400&fit=crop',
    updated_at = NOW()
FROM campaigns c, brands b
WHERE cnt.campaign_id = c.id
AND c.brand_id = b.id
AND b.brand_name = 'Siddhim Global School'
AND cnt.post_url IS NOT NULL;

-- Verify the update
SELECT 
    cnt.id,
    cnt.post_url,
    cnt.thumbnail_url,
    cr.name as creator_name,
    cr.ig_handle,
    cnt.performance_metrics
FROM campaign_contents cnt
JOIN campaigns c ON cnt.campaign_id = c.id
JOIN brands b ON c.brand_id = b.id
JOIN creators cr ON cnt.creator_id = cr.id
WHERE b.brand_name = 'Siddhim Global School'
AND cnt.post_url IS NOT NULL;
