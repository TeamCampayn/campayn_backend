-- ============================================================
-- SIDDHIM GLOBAL SCHOOL - Brand Setup Script
-- Run this in Supabase SQL Editor
-- ============================================================

-- Step 1: First, sign up the user through the auth UI with:
-- Email: siddhim@campayn.in (or their actual email)
-- Password: Siddhim@2024 (or your chosen password)

-- After signing up, run the following SQL to set up the brand and campaign:

-- ============================================================
-- STEP 2: Create the Brand Profile
-- ============================================================

-- First, get the user ID from auth.users (replace email if different)
DO $$
DECLARE
    v_user_id UUID;
    v_brand_id UUID;
    v_campaign_id UUID;
BEGIN
    -- Get the user ID (update email if different)
    SELECT id INTO v_user_id FROM auth.users WHERE email = 'siddhim@campayn.in' LIMIT 1;
    
    IF v_user_id IS NULL THEN
        RAISE NOTICE '❌ User not found. Please sign up first with email: siddhim@campayn.in';
        RETURN;
    END IF;
    
    RAISE NOTICE '✅ Found user: %', v_user_id;
    
    -- Create Brand Profile (using correct table schema)
    INSERT INTO brands (
        id,
        user_id,
        brand_name,
        brand_website,
        industry,
        brand_description,
        company_size,
        monthly_budget,
        experience_level,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        v_user_id,
        'Siddhim Global School',
        'https://siddhimglobalschool.com',
        'education',
        'Premium all-girls boarding school emphasizing values-based education rooted in Jain ethos. Where Your Daughter Blossoms. Rooted in Values, Ready for the World.',
        '51-200',
        '100k-500k',
        'intermediate',
        NOW(),
        NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
        brand_name = EXCLUDED.brand_name,
        brand_website = EXCLUDED.brand_website,
        industry = EXCLUDED.industry,
        brand_description = EXCLUDED.brand_description,
        updated_at = NOW()
    RETURNING id INTO v_brand_id;
    
    RAISE NOTICE '✅ Created/Updated brand: %', v_brand_id;
    
    -- Create the Campaign (using correct table schema)
    INSERT INTO campaigns (
        id,
        brand_id,
        campaign_name,
        description,
        budget,
        phase,
        status,
        target_category,
        target_subcategory,
        creator_type,
        start_date,
        end_date,
        created_at,
        updated_at
    ) VALUES (
        gen_random_uuid(),
        v_brand_id,
        'Siddhim Global School Launch Campaign',
        'Launch Siddhim Global School as a premium all-girls boarding school through a one-month high-impact digital visibility campaign, emphasizing values-based education rooted in Jain ethos. Target: 100-120 qualified parent leads, 1.5M+ digital impressions.',
        400000,
        'campaign_active',
        'active',
        'Education',
        'Jainism',
        'micro',
        '2024-12-01',
        '2024-12-31',
        NOW(),
        NOW()
    )
    RETURNING id INTO v_campaign_id;
    
    RAISE NOTICE '✅ Created campaign: %', v_campaign_id;
    
    -- Output the IDs for reference
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Brand ID: %', v_brand_id;
    RAISE NOTICE 'Campaign ID: %', v_campaign_id;
    RAISE NOTICE '========================================';
    
END $$;

-- ============================================================
-- STEP 3: Add Campaign Creators (Finalized List)
-- ============================================================

-- First, let's add the creators to the creators table if they don't exist
-- Then link them to the campaign

DO $$
DECLARE
    v_campaign_id UUID;
    v_creator_id BIGINT;
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
    -- Get the campaign ID
    SELECT c.id INTO v_campaign_id 
    FROM campaigns c 
    JOIN brands b ON c.brand_id = b.id
    WHERE b.brand_name = 'Siddhim Global School'
    LIMIT 1;
    
    IF v_campaign_id IS NULL THEN
        RAISE NOTICE '❌ Campaign not found. Run the campaign creation script first.';
        RETURN;
    END IF;
    
    RAISE NOTICE '✅ Found campaign: %', v_campaign_id;
    
    -- Loop through creators and add them
    FOREACH handle IN ARRAY creator_handles
    LOOP
        -- Check if creator exists
        SELECT id INTO v_creator_id FROM creators WHERE ig_handle = handle OR ig_handle = '@' || handle LIMIT 1;
        
        IF v_creator_id IS NULL THEN
            -- Insert creator if doesn't exist (using correct table schema)
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
            
            RAISE NOTICE '  Created creator: % (ID: %)', handle, v_creator_id;
        ELSE
            RAISE NOTICE '  Found existing creator: % (ID: %)', handle, v_creator_id;
        END IF;
        
        -- Link creator to campaign
        INSERT INTO campaign_creators (
            campaign_id,
            creator_id,
            status,
            created_at,
            updated_at
        ) VALUES (
            v_campaign_id,
            v_creator_id,
            'approved',
            NOW(),
            NOW()
        )
        ON CONFLICT (campaign_id, creator_id) DO UPDATE SET
            status = 'approved',
            updated_at = NOW();
            
    END LOOP;
    
    RAISE NOTICE '✅ Linked all creators to campaign!';
    
END $$;

-- ============================================================
-- STEP 4: Add the Live Reel Content
-- ============================================================

DO $$
DECLARE
    v_campaign_id UUID;
    v_creator_id BIGINT;
BEGIN
    -- Get campaign ID
    SELECT c.id INTO v_campaign_id 
    FROM campaigns c 
    JOIN brands b ON c.brand_id = b.id
    WHERE b.brand_name = 'Siddhim Global School'
    LIMIT 1;
    
    -- For the live reel, we need to identify which creator posted it
    -- Based on the URL pattern, you'll need to update the creator handle
    -- For now, we'll use a placeholder - UPDATE THIS with actual creator handle
    
    SELECT id INTO v_creator_id FROM creators 
    WHERE ig_handle LIKE '%jainism%' 
    LIMIT 1;
    
    IF v_creator_id IS NOT NULL AND v_campaign_id IS NOT NULL THEN
        -- Add the live content
        INSERT INTO campaign_contents (
            id,
            campaign_id,
            creator_id,
            content_type,
            content_url,
            post_url,
            approval_status,
            posted_at,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            v_campaign_id,
            v_creator_id,
            'reel',
            'https://www.instagram.com/reel/DT5K5RvkwUH/',
            'https://www.instagram.com/reel/DT5K5RvkwUH/?igsh=ZTNoZGh4dXExdmd3',
            'approved',
            NOW(),
            NOW(),
            NOW()
        )
        ON CONFLICT DO NOTHING;
        
        RAISE NOTICE '✅ Added live reel content!';
    ELSE
        RAISE NOTICE '❌ Could not add content - campaign or creator not found';
    END IF;
    
END $$;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================

-- Check the brand was created
SELECT 'Brand:' as type, id, brand_name, industry FROM brands WHERE brand_name = 'Siddhim Global School';

-- Check the campaign was created
SELECT 'Campaign:' as type, c.id, c.campaign_name, c.budget, c.phase, c.status 
FROM campaigns c 
JOIN brands b ON c.brand_id = b.id 
WHERE b.brand_name = 'Siddhim Global School';

-- Check creators linked to campaign
SELECT 'Creators Count:' as info, COUNT(*) as total_creators
FROM campaign_creators cc
JOIN campaigns c ON cc.campaign_id = c.id
JOIN brands b ON c.brand_id = b.id
WHERE b.brand_name = 'Siddhim Global School';

-- Check live content
SELECT 'Live Content:' as type, cc.content_type, cc.post_url, cc.approval_status
FROM campaign_contents cc
JOIN campaigns c ON cc.campaign_id = c.id
JOIN brands b ON c.brand_id = b.id
WHERE b.brand_name = 'Siddhim Global School';

-- ============================================================
-- LOGIN CREDENTIALS
-- ============================================================
-- Email: siddhim@campayn.in
-- Password: (the password you set during signup)
-- Dashboard URL: https://campayn.in/dashboard
-- ============================================================
