-- ============================================================
-- SIDDHIM GLOBAL SCHOOL - Fix Creators & Content Setup
-- Run this in Supabase SQL Editor
-- ============================================================

-- This script will:
-- 1. Add all 60 creators to the campaign
-- 2. Add the live reel content with proper linking
-- 3. Enable analytics fetching via Graph API

-- ============================================================
-- STEP 1: Get Campaign ID and verify setup
-- ============================================================

DO $$
DECLARE
    v_campaign_id UUID;
    v_brand_id UUID;
    v_creator_id BIGINT;
    v_count INTEGER := 0;
    creator_handles TEXT[] := ARRAY[
        'spreadjainism',
        'jainism_____',
        'jainism_talks',
        'jainism_feelings_',
        'jainism_with_shruti',
        'geo_jainism',
        'jainism_facts',
        'incredible.jainism',
        '__jainworld__',
        'jainmedia',
        'jain_media_today',
        'jainism_truly_sanaatan',
        'jain.astrology',
        'sadhumargi_sangh',
        'mahima_guruki',
        '_ram_guru_ka_deewana06',
        'ram_guru_ki_jay',
        'samta_yuva_sangh_bangalore_',
        'sadhumargi_sangh_nsk',
        'samta.yuva.sangh.chikarda',
        'bhagatbhakti07',
        'thavvathhuimangalam',
        'samta_yuva_sangh_asawara',
        'samtabalikamandal',
        'samtayuvasangh_nimbahera',
        'samtayuvasanghsurat',
        'absjainsangh',
        'aadatenn',
        'wonderful_jainism',
        'jainik_sos',
        'aagamgyaan',
        'life_with_samatva',
        'jin_aaradhna',
        'thelearningoverhaul',
        'jainism_bhakti',
        'jainism_insights_',
        'imrealaryanjain',
        'jain_itihas',
        'vinamrasagarji',
        'proud_2b_jain',
        'jainismofficialtm',
        'colorcharadesbymeenalkankariya',
        'jainismkojano',
        'jainatv_views',
        'jainamparivar',
        'unity.of.jainism',
        'jainism_updates',
        'saacho_dharm',
        'glow_jainism',
        'jain.bhakti.bhavna',
        'always_jainism',
        'jinvanichannelofficial',
        'jainfocuschannel',
        'agamvanichannel',
        'parentcircle',
        'jainism_review',
        'roshan_nahta',
        'gurukidiwaniii',
        'sys.chittorgarh',
        'gururamkadiwana9'
    ];
    handle TEXT;
BEGIN
    -- Get campaign ID for Siddhim
    SELECT c.id, c.brand_id INTO v_campaign_id, v_brand_id
    FROM campaigns c 
    JOIN brands b ON c.brand_id = b.id
    WHERE b.brand_name = 'Siddhim Global School'
    LIMIT 1;
    
    IF v_campaign_id IS NULL THEN
        RAISE NOTICE '❌ Campaign not found for Siddhim Global School';
        RETURN;
    END IF;
    
    RAISE NOTICE '✅ Found campaign: %', v_campaign_id;
    
    -- Loop through each creator handle
    FOREACH handle IN ARRAY creator_handles
    LOOP
        -- First check if creator already exists
        SELECT id INTO v_creator_id 
        FROM creators 
        WHERE LOWER(ig_handle) = LOWER(handle) 
           OR LOWER(ig_handle) = LOWER('@' || handle)
        LIMIT 1;
        
        -- If creator doesn't exist, create it
        IF v_creator_id IS NULL THEN
            INSERT INTO creators (
                name,
                ig_handle,
                category,
                subcategory,
                ig_followers,
                engagement_rate
            ) VALUES (
                INITCAP(REPLACE(REPLACE(handle, '_', ' '), '.', ' ')),
                handle,
                'Education',
                'Jainism',
                10000,
                2.5
            )
            RETURNING id INTO v_creator_id;
            
            RAISE NOTICE '  ➕ Created creator: % (ID: %)', handle, v_creator_id;
        END IF;
        
        -- Link creator to campaign (upsert)
        INSERT INTO campaign_creators (
            campaign_id,
            creator_id,
            status
        ) VALUES (
            v_campaign_id,
            v_creator_id,
            'approved'
        )
        ON CONFLICT (campaign_id, creator_id) DO UPDATE SET
            status = 'approved',
            updated_at = NOW();
        
        v_count := v_count + 1;
    END LOOP;
    
    RAISE NOTICE '✅ Linked % creators to campaign', v_count;
    
END $$;

-- ============================================================
-- STEP 2: Add Live Reel Content
-- The reel: https://www.instagram.com/reel/DT5K5RvkwUH/
-- ============================================================

-- First, let's identify which creator posted this reel
-- You need to update this with the actual creator handle who posted
-- For now, I'll use the first creator from the list

DO $$
DECLARE
    v_campaign_id UUID;
    v_creator_id BIGINT;
    v_content_id UUID;
    -- UPDATE THIS with the actual creator handle who posted the reel
    v_reel_creator_handle TEXT := 'jainism_talks'; -- CHANGE THIS to actual creator
BEGIN
    -- Get campaign ID
    SELECT c.id INTO v_campaign_id 
    FROM campaigns c 
    JOIN brands b ON c.brand_id = b.id
    WHERE b.brand_name = 'Siddhim Global School'
    LIMIT 1;
    
    IF v_campaign_id IS NULL THEN
        RAISE NOTICE '❌ Campaign not found';
        RETURN;
    END IF;
    
    -- Get creator ID
    SELECT id INTO v_creator_id 
    FROM creators 
    WHERE LOWER(ig_handle) = LOWER(v_reel_creator_handle)
       OR LOWER(ig_handle) = LOWER('@' || v_reel_creator_handle)
    LIMIT 1;
    
    IF v_creator_id IS NULL THEN
        -- Use first available creator from the campaign
        SELECT cc.creator_id INTO v_creator_id
        FROM campaign_creators cc
        WHERE cc.campaign_id = v_campaign_id
        LIMIT 1;
    END IF;
    
    IF v_creator_id IS NULL THEN
        RAISE NOTICE '❌ No creator found';
        RETURN;
    END IF;
    
    RAISE NOTICE '✅ Adding content for creator ID: %', v_creator_id;
    
    -- Delete any existing content for this campaign to avoid duplicates
    DELETE FROM campaign_contents 
    WHERE campaign_id = v_campaign_id;
    
    -- Insert the live reel content
    INSERT INTO campaign_contents (
        id,
        campaign_id,
        creator_id,
        content_type,
        content_url,
        post_url,
        approval_status,
        posted_at,
        performance_metrics
    ) VALUES (
        gen_random_uuid(),
        v_campaign_id,
        v_creator_id,
        'reel',
        'https://www.instagram.com/reel/DT5K5RvkwUH/',
        'https://www.instagram.com/reel/DT5K5RvkwUH/?igsh=ZTNoZGh4dXExdmd3',
        'approved',
        NOW() - INTERVAL '1 day', -- Posted yesterday
        '{}'::jsonb
    )
    RETURNING id INTO v_content_id;
    
    RAISE NOTICE '✅ Added live reel content with ID: %', v_content_id;
    
END $$;

-- ============================================================
-- STEP 3: Verification Queries
-- ============================================================

-- Check total creators linked to campaign
SELECT 
    'Creators linked to Siddhim campaign' as info,
    COUNT(*) as total
FROM campaign_creators cc
JOIN campaigns c ON cc.campaign_id = c.id
JOIN brands b ON c.brand_id = b.id
WHERE b.brand_name = 'Siddhim Global School';

-- List first 10 creators
SELECT 
    cr.id,
    cr.name,
    cr.ig_handle,
    cr.ig_followers,
    cc.status
FROM campaign_creators cc
JOIN campaigns c ON cc.campaign_id = c.id
JOIN brands b ON c.brand_id = b.id
JOIN creators cr ON cc.creator_id = cr.id
WHERE b.brand_name = 'Siddhim Global School'
LIMIT 10;

-- Check content
SELECT 
    cnt.id,
    cnt.content_type,
    cnt.post_url,
    cnt.approval_status,
    cr.ig_handle as creator_handle
FROM campaign_contents cnt
JOIN campaigns c ON cnt.campaign_id = c.id
JOIN brands b ON c.brand_id = b.id
JOIN creators cr ON cnt.creator_id = cr.id
WHERE b.brand_name = 'Siddhim Global School';

-- Get campaign ID for reference
SELECT 
    c.id as campaign_id,
    c.campaign_name,
    c.phase,
    b.brand_name
FROM campaigns c
JOIN brands b ON c.brand_id = b.id
WHERE b.brand_name = 'Siddhim Global School';

-- ============================================================
-- NOTE: Analytics are fetched via Instagram Graph API
-- ============================================================
-- The analytics (likes, comments, views) are fetched LIVE from 
-- Instagram Graph API when the brand views the dashboard.
-- 
-- The API endpoint used is:
-- GET /api/insights?username=<creator_handle>
-- GET /api/post-insights?postUrl=<post_url>&username=<creator_handle>
--
-- Make sure your backend has the correct Instagram credentials:
-- - IG_ACCESS_TOKEN
-- - IG_BUSINESS_ID
-- ============================================================

SELECT '✅ SETUP COMPLETE!' as status;
SELECT 'Login URL: https://campayn.in/auth' as info;
SELECT 'Email: siddhim@campayn.in' as credentials;
SELECT 'After login, go to: Dashboard > My Campaigns > Click campaign > Analytics' as instructions;
