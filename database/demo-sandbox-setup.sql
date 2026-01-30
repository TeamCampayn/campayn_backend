-- ============================================================
-- FRESH DEMO SANDBOX ENVIRONMENT
-- Complete end-to-end demo with SANDBOX payment simulation
-- ============================================================
-- This script creates a clean demo environment where:
-- 1. A demo user can test the full campaign workflow
-- 2. Payment flow is simulated (no real transactions)
-- 3. All phases of campaign lifecycle are demonstrated
-- 4. Real creator data with content and analytics
-- ============================================================

-- ============================================================
-- STEP 1: CLEAN SLATE - Remove existing demo data
-- ============================================================

-- Delete existing demo activities first (foreign key dependencies)
DELETE FROM campaign_activities WHERE campaign_id IN (
  SELECT id FROM campaigns WHERE brand_id IN (
    SELECT id FROM brands WHERE user_id IN (
      SELECT id FROM auth.users WHERE email = 'demo@campayn.com'
    )
  )
);

-- Delete campaign performance data
DELETE FROM campaign_performance WHERE campaign_id IN (
  SELECT id FROM campaigns WHERE brand_id IN (
    SELECT id FROM brands WHERE user_id IN (
      SELECT id FROM auth.users WHERE email = 'demo@campayn.com'
    )
  )
);

-- Delete campaign contents
DELETE FROM campaign_contents WHERE campaign_id IN (
  SELECT id FROM campaigns WHERE brand_id IN (
    SELECT id FROM brands WHERE user_id IN (
      SELECT id FROM auth.users WHERE email = 'demo@campayn.com'
    )
  )
);

-- Delete campaign creators
DELETE FROM campaign_creators WHERE campaign_id IN (
  SELECT id FROM campaigns WHERE brand_id IN (
    SELECT id FROM brands WHERE user_id IN (
      SELECT id FROM auth.users WHERE email = 'demo@campayn.com'
    )
  )
);

-- Delete payments
DELETE FROM payments WHERE campaign_id IN (
  SELECT id FROM campaigns WHERE brand_id IN (
    SELECT id FROM brands WHERE user_id IN (
      SELECT id FROM auth.users WHERE email = 'demo@campayn.com'
    )
  )
);

-- Delete campaigns
DELETE FROM campaigns WHERE brand_id IN (
  SELECT id FROM brands WHERE user_id IN (
    SELECT id FROM auth.users WHERE email = 'demo@campayn.com'
  )
);

-- Delete brands
DELETE FROM brands WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = 'demo@campayn.com'
);

-- Note: We don't delete the auth.users entry as it should be managed by Supabase Auth

SELECT '✅ Cleaned existing demo data' as status;

-- ============================================================
-- STEP 2: PAYMENT SANDBOX CONFIGURATION
-- ============================================================

-- Create payment configuration table for sandbox mode
CREATE TABLE IF NOT EXISTS payment_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  config_key TEXT UNIQUE NOT NULL,
  config_value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable sandbox mode globally
INSERT INTO payment_config (config_key, config_value, description)
VALUES (
  'sandbox_mode',
  '{"enabled": true, "auto_approve_payments": true, "simulate_delay_seconds": 2}'::jsonb,
  'Global sandbox mode - simulates payments without real transactions'
)
ON CONFLICT (config_key) DO UPDATE SET
  config_value = EXCLUDED.config_value,
  updated_at = NOW();

-- Sandbox payment methods available
INSERT INTO payment_config (config_key, config_value, description)
VALUES (
  'sandbox_payment_methods',
  '["test_upi", "test_card", "test_netbanking", "test_wallet"]'::jsonb,
  'Available payment methods in sandbox mode'
)
ON CONFLICT (config_key) DO UPDATE SET
  config_value = EXCLUDED.config_value,
  updated_at = NOW();

SELECT '✅ Payment sandbox mode enabled' as status;

-- ============================================================
-- STEP 3: CREATE DEMO BRAND CONTEXT
-- ============================================================

DROP TABLE IF EXISTS demo_context;
CREATE TEMP TABLE demo_context (
  demo_user_id UUID NOT NULL,
  demo_brand_id UUID NOT NULL,
  admin_user_id UUID NOT NULL
);

DO $$
DECLARE
  v_demo_user_id UUID;
  v_demo_brand_id UUID;
  v_admin_user_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID;
BEGIN
  -- Get or verify demo user exists
  SELECT id INTO v_demo_user_id 
  FROM auth.users 
  WHERE email = 'demo@campayn.com' 
  LIMIT 1;

  IF v_demo_user_id IS NULL THEN
    RAISE EXCEPTION 'Demo user demo@campayn.com not found. Please create it via Supabase Auth → Users first.';
  END IF;

  -- Generate new brand ID for fresh setup
  v_demo_brand_id := gen_random_uuid();

  INSERT INTO demo_context (demo_user_id, demo_brand_id, admin_user_id)
  VALUES (v_demo_user_id, v_demo_brand_id, v_admin_user_id);

  RAISE NOTICE 'Demo context created: user_id=%, brand_id=%', v_demo_user_id, v_demo_brand_id;
END $$;

SELECT '✅ Demo context initialized' as status;

-- ============================================================
-- STEP 4: CREATE DEMO CREATOR POOL
-- ============================================================

DROP TABLE IF EXISTS demo_creators_seed;
CREATE TEMP TABLE demo_creators_seed (
  external_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ig_handle TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  followers_count INTEGER NOT NULL,
  engagement_rate NUMERIC(5,2) NOT NULL,
  location TEXT,
  tier TEXT NOT NULL,
  description TEXT
);

INSERT INTO demo_creators_seed (external_id, name, ig_handle, category, subcategory, followers_count, engagement_rate, location, tier, description) VALUES
-- Micro Influencers (Campaign 1)
('demo_cr_001', 'Ananya Ray', 'ananya.ray', 'Fashion', 'Sustainable Fashion', 8900, 4.8, 'Mumbai', 'micro', 'Eco-conscious fashion blogger with authentic styling tips'),
('demo_cr_002', 'Prisha Mehta', 'prisha.styles', 'Fashion', 'Lifestyle Fashion', 9200, 4.5, 'Bangalore', 'micro', 'Vibrant lifestyle content creator with daily outfit inspiration'),
('demo_cr_003', 'Kavya Nair', 'kavya.nair', 'Fashion', 'Smart Fabrics', 7800, 4.9, 'Hyderabad', 'micro', 'Tech-fashion enthusiast exploring smart textiles'),
('demo_cr_004', 'Tania Malik', 'tania.malik', 'Fashion', 'Accessories', 8500, 4.6, 'Delhi', 'micro', 'Accessory styling expert with minimalist aesthetics'),
('demo_cr_005', 'Rhea Bose', 'rhea.ecochic', 'Fashion', 'Sustainable Fashion', 9800, 4.3, 'Mumbai', 'micro', 'Zero-waste fashion advocate with DIY content'),
('demo_cr_006', 'Siya Chopra', 'siya.chopra', 'Lifestyle', 'City Lifestyle', 7200, 4.7, 'Pune', 'micro', 'Urban lifestyle blogger sharing practical fashion'),
('demo_cr_007', 'Isha Menon', 'isha.menon', 'Fashion', 'Minimal Fashion', 9500, 4.4, 'Bangalore', 'micro', 'Minimalist wardrobe curator and slow fashion supporter'),
('demo_cr_008', 'Mira Jain', 'mira.jain', 'Fashion', 'Travel & Style', 8200, 4.5, 'Delhi', 'micro', 'Travel fashion vlogger with adventure stories'),

-- Macro Influencers (Campaign 2)
('demo_cr_009', 'Rishika Adani', 'rishika.adani', 'Lifestyle', 'Festive Fashion', 42000, 3.2, 'Mumbai', 'macro', 'Festive fashion specialist with traditional modern fusion'),
('demo_cr_010', 'Mohini Basu', 'mohini.basu', 'Fashion', 'Beauty & Fashion', 38000, 3.5, 'Delhi', 'macro', 'Beauty and fashion hybrid content with makeup tutorials'),
('demo_cr_011', 'Eshita Rao', 'eshita.rao', 'Lifestyle', 'Family Lifestyle', 56000, 2.9, 'Hyderabad', 'macro', 'Family-focused lifestyle content with shopping guides'),
('demo_cr_012', 'Aniket Vora', 'aniket.vora', 'Fashion', 'Mens Fashion', 47000, 2.8, 'Pune', 'macro', 'Mens fashion and grooming expert'),
('demo_cr_013', 'Tanvi Wadhwa', 'tanvi.wadhwa', 'Fashion', 'Ethnic Fusion', 52000, 3.1, 'Mumbai', 'macro', 'Ethnic wear styling with contemporary twists'),
('demo_cr_014', 'Armaan Saluja', 'armaan.saluja', 'Lifestyle', 'Shopping Hauls', 65000, 2.6, 'Delhi', 'macro', 'Shopping haul expert with honest product reviews'),
('demo_cr_015', 'Sanya Pillai', 'sanya.pillai', 'Lifestyle', 'Home & Lifestyle', 35000, 3.3, 'Bangalore', 'macro', 'Home decor and lifestyle content creator'),
('demo_cr_016', 'Priyanka Deshmukh', 'priyanka.desh', 'Fashion', 'Budget Fashion', 29000, 3.6, 'Mumbai', 'macro', 'Affordable fashion finds and styling hacks'),

-- Mega Influencers (Campaign 3)
('demo_cr_017', 'Advait Khanna', 'advait.khanna', 'Tech', 'Wearables', 340000, 2.4, 'Bangalore', 'mega', 'Tech reviewer specializing in wearable technology'),
('demo_cr_018', 'Mehul Sarkar', 'mehul.tech', 'Tech', 'Product Reviews', 420000, 2.2, 'Mumbai', 'mega', 'Comprehensive gadget reviewer with detailed analysis'),
('demo_cr_019', 'Sanjana Patel', 'sanj.techstyle', 'Tech', 'Lifestyle Tech', 680000, 2.0, 'Delhi', 'mega', 'Tech lifestyle influencer blending fashion and gadgets'),
('demo_cr_020', 'Viraj Narain', 'viraj.gadgets', 'Tech', 'Smart Accessories', 520000, 1.9, 'Hyderabad', 'mega', 'Smart accessories expert with unboxing content'),
('demo_cr_021', 'Trisha Godbole', 'trisha.smartfit', 'Fitness', 'Wearable Fitness', 880000, 1.8, 'Mumbai', 'mega', 'Fitness influencer focusing on smart fitness tracking'),
('demo_cr_022', 'Rohit Suresh', 'rohitbytes', 'Tech', 'Productivity', 260000, 2.6, 'Chennai', 'mega', 'Productivity tech reviewer for professionals'),
('demo_cr_023', 'Kritika Dutta', 'kritika.future', 'Tech', 'Innovation', 310000, 2.3, 'Pune', 'mega', 'Tech innovation explorer with futuristic content'),
('demo_cr_024', 'Varun Sahni', 'varunwired', 'Tech', 'Deep Tech', 1500000, 1.7, 'Delhi', 'mega', 'Deep tech analysis and detailed product comparisons');

-- Insert creators into main table
WITH upserted_creators AS (
  INSERT INTO creators (
    external_id,
    name,
    ig_handle,
    category,
    subcategory,
    followers_count,
    ig_followers,
    engagement_rate,
    location,
    bio,
    content_style,
    account_status,
    verified,
    avg_likes,
    avg_comments,
    avg_views
  )
  SELECT
    s.external_id,
    s.name,
    s.ig_handle,
    s.category,
    s.subcategory,
    s.followers_count,
    s.followers_count,
    s.engagement_rate,
    s.location,
    s.description,
    COALESCE(s.subcategory, s.category),
    'active',
    CASE WHEN s.followers_count >= 100000 THEN TRUE ELSE FALSE END,
    ROUND(s.followers_count * (s.engagement_rate / 100))::INT,
    ROUND(s.followers_count * (s.engagement_rate / 100) * 0.08)::INT,
    ROUND(s.followers_count * 0.35)::INT
  FROM demo_creators_seed s
  ON CONFLICT (external_id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    subcategory = EXCLUDED.subcategory,
    followers_count = EXCLUDED.followers_count,
    ig_followers = EXCLUDED.ig_followers,
    engagement_rate = EXCLUDED.engagement_rate,
    location = EXCLUDED.location,
    bio = EXCLUDED.bio,
    account_status = 'active'
  RETURNING id, external_id
)
SELECT COUNT(*) || ' demo creators seeded' as status FROM upserted_creators;

SELECT '✅ Demo creators seeded' as status;

-- ============================================================
-- STEP 5: CREATE DEMO BRAND
-- ============================================================

WITH ctx AS (SELECT demo_user_id, demo_brand_id FROM demo_context)
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
  created_at
)
SELECT
  ctx.demo_brand_id,
  ctx.demo_user_id,
  'TechStyle Fashion Demo',
  'https://techstyle-demo.campayn.com',
  'fashion',
  'Modern fashion brand combining technology and style. This is a demo brand for testing the complete campaign workflow with sandbox payments.',
  '11-50',
  '50k-100k',
  'intermediate',
  NOW() - INTERVAL '90 days'
FROM ctx
ON CONFLICT (id) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  brand_name = EXCLUDED.brand_name,
  updated_at = NOW();

SELECT '✅ Demo brand created' as status;

-- ============================================================
-- STEP 6: CAMPAIGN 1 - Creator Selection Phase
-- ============================================================

BEGIN;

WITH ctx AS (SELECT demo_brand_id FROM demo_context)
INSERT INTO campaigns (
  id,
  brand_id,
  campaign_name,
  description,
  budget,
  start_date,
  end_date,
  campaign_objectives,
  requirements,
  deliverables,
  status,
  phase,
  estimated_cost_per_creator,
  max_affordable_creators,
  actual_creators_selected,
  creators_approved_count,
  payment_initiated,
  payment_status,
  created_at,
  updated_at
)
SELECT
  'c1111111-1111-1111-1111-111111111111'::UUID,
  ctx.demo_brand_id,
  '🌟 Summer Collection Launch 2025',
  'Launch our new sustainable summer collection featuring eco-friendly fabrics and smart technology. Target young professionals (22-35) interested in sustainable fashion. Platforms: Instagram Reels, Stories, Posts.',
  75000.00,
  CURRENT_DATE + INTERVAL '5 days',
  CURRENT_DATE + INTERVAL '45 days',
  ARRAY['Brand Awareness', 'Product Marketing', 'Engagement'],
  'Showcase sustainable fabrics in outdoor natural settings. Include product close-ups, styling tips, and sustainability message. Professional photography required. Creator Tier: Micro (5K-15K followers).',
  '{"reel": 3, "post": 4, "story": 8}'::jsonb,
  'active',
  'creator_selection',
  3500,
  21,
  0,
  0,
  FALSE,
  'pending',
  NOW() - INTERVAL '3 days',
  NOW() - INTERVAL '1 hour'
FROM ctx;

-- Add recommended creators for Campaign 1
WITH ctx AS (SELECT demo_brand_id FROM demo_context),
     creator_ids AS (
       SELECT c.id, s.external_id, s.name, s.followers_count,
              ROW_NUMBER() OVER (ORDER BY s.followers_count DESC) as rn
       FROM creators c
       JOIN demo_creators_seed s ON c.external_id = s.external_id
       WHERE s.tier = 'micro'
     )
INSERT INTO campaign_creators (
  id,
  campaign_id,
  creator_id,
  status,
  recommended_by_admin,
  admin_notes,
  negotiated_rate,
  created_at
)
SELECT
  gen_random_uuid(),
  'c1111111-1111-1111-1111-111111111111'::UUID,
  ci.id,
  'recommended',
  TRUE,
  'Perfect fit for sustainable summer collection. High engagement rate (' || 
    CASE WHEN ci.rn <= 4 THEN '4.8%' WHEN ci.rn <= 6 THEN '4.5%' ELSE '4.3%' END || 
    ') with authentic audience.',
  3500,
  NOW() - INTERVAL '2 days' + (ci.rn || ' hours')::INTERVAL
FROM creator_ids ci;

-- Activity log
WITH ctx AS (SELECT demo_brand_id, demo_user_id, admin_user_id FROM demo_context)
INSERT INTO campaign_activities (campaign_id, user_id, user_type, activity_type, description, metadata, created_at)
SELECT * FROM (
  SELECT 'c1111111-1111-1111-1111-111111111111'::UUID, ctx.demo_user_id, 'brand', 'campaign_created', 
         'Campaign created for summer collection launch', '{"sandbox_mode": true}'::jsonb, NOW() - INTERVAL '3 days' FROM ctx
  UNION ALL
  SELECT 'c1111111-1111-1111-1111-111111111111', ctx.admin_user_id, 'admin', 'campaign_approved',
         'Campaign approved and ready for creator matching', '{}'::jsonb, NOW() - INTERVAL '2.5 days' FROM ctx
  UNION ALL
  SELECT 'c1111111-1111-1111-1111-111111111111', ctx.admin_user_id, 'admin', 'creators_recommended',
         '8 micro creators recommended based on category and engagement', '{"auto_matched": true}'::jsonb, NOW() - INTERVAL '2 days' FROM ctx
) rows;

COMMIT;

SELECT '✅ Campaign 1 (Creator Selection) created' as status;

-- ============================================================
-- STEP 7: CAMPAIGN 2 - Payment Pending Phase (SANDBOX)
-- ============================================================

BEGIN;

WITH ctx AS (SELECT demo_brand_id FROM demo_context)
INSERT INTO campaigns (
  id,
  brand_id,
  campaign_name,
  description,
  budget,
  start_date,
  end_date,
  campaign_objectives,
  requirements,
  deliverables,
  status,
  phase,
  estimated_cost_per_creator,
  max_affordable_creators,
  actual_creators_selected,
  creators_approved_count,
  payment_initiated,
  payment_status,
  created_at,
  updated_at
)
SELECT
  'c2222222-2222-2222-2222-222222222222'::UUID,
  ctx.demo_brand_id,
  '🎉 Festive Season Campaign',
  'Drive festive season sales with influencer shoutouts and product reviews. Focus on discount codes and limited-time offers. Platforms: Instagram Reels, Carousels, Stories.',
  120000.00,
  CURRENT_DATE - INTERVAL '5 days',
  CURRENT_DATE + INTERVAL '25 days',
  ARRAY['Sales Conversion', 'Engagement'],
  'Highlight festive discount codes. Include product close-ups and clear CTAs. Focus on family-friendly content. Creator Tier: Macro (25K-75K followers).',
  '{"reel": 4, "post": 3, "story": 10, "carousel": 2}'::jsonb,
  'active',
  'payment_pending',
  7500,
  16,
  8,
  8,
  FALSE,
  'pending',
  NOW() - INTERVAL '8 days',
  NOW() - INTERVAL '30 minutes'
FROM ctx;

-- Add approved creators for Campaign 2
WITH ctx AS (SELECT demo_brand_id FROM demo_context),
     creator_ids AS (
       SELECT c.id, s.external_id, s.name, s.followers_count,
              ROW_NUMBER() OVER (ORDER BY s.followers_count DESC) as rn
       FROM creators c
       JOIN demo_creators_seed s ON c.external_id = s.external_id
       WHERE s.tier = 'macro'
       LIMIT 8
     )
INSERT INTO campaign_creators (
  id,
  campaign_id,
  creator_id,
  status,
  recommended_by_admin,
  admin_notes,
  negotiated_rate,
  created_at
)
SELECT
  gen_random_uuid(),
  'c2222222-2222-2222-2222-222222222222'::UUID,
  ci.id,
  'approved',
  TRUE,
  'Excellent for festive campaign. Strong family-focused audience. Match score: ' ||
    CASE WHEN ci.rn <= 4 THEN '92%' ELSE '88%' END,
  7500 + (ci.rn * 200),
  NOW() - INTERVAL '7 days' + (ci.rn || ' hours')::INTERVAL
FROM creator_ids ci;

-- Activity log
WITH ctx AS (SELECT demo_brand_id, demo_user_id, admin_user_id FROM demo_context)
INSERT INTO campaign_activities (campaign_id, user_id, user_type, activity_type, description, metadata, created_at)
SELECT * FROM (
  SELECT 'c2222222-2222-2222-2222-222222222222'::UUID, ctx.demo_user_id, 'brand', 'campaign_created',
         'Festive campaign created', '{"sandbox_mode": true}'::jsonb, NOW() - INTERVAL '8 days' FROM ctx
  UNION ALL
  SELECT 'c2222222-2222-2222-2222-222222222222', ctx.admin_user_id, 'admin', 'creators_recommended',
         '10 macro creators recommended', '{}'::jsonb, NOW() - INTERVAL '7 days' FROM ctx
  UNION ALL
  SELECT 'c2222222-2222-2222-2222-222222222222', ctx.demo_user_id, 'brand', 'creators_approved',
         '8 creators approved by brand', '{"approved_count": 8}'::jsonb, NOW() - INTERVAL '6 days' FROM ctx
  UNION ALL
  SELECT 'c2222222-2222-2222-2222-222222222222', ctx.demo_user_id, 'brand', 'phase_updated',
         'Campaign moved to payment pending phase', '{"from_phase": "creator_selection", "to_phase": "payment_pending"}'::jsonb, NOW() - INTERVAL '6 days' FROM ctx
) rows;

COMMIT;

SELECT '✅ Campaign 2 (Payment Pending - SANDBOX READY) created' as status;

-- ============================================================
-- STEP 8: CAMPAIGN 3 - Content Approval Phase (SANDBOX PAID)
-- ============================================================

BEGIN;

WITH ctx AS (SELECT demo_brand_id FROM demo_context)
INSERT INTO campaigns (
  id,
  brand_id,
  campaign_name,
  description,
  budget,
  start_date,
  end_date,
  campaign_objectives,
  requirements,
  deliverables,
  status,
  phase,
  estimated_cost_per_creator,
  max_affordable_creators,
  actual_creators_selected,
  creators_approved_count,
  payment_initiated,
  payment_initiated_at,
  payment_status,
  payment_completed_at,
  created_at,
  updated_at
)
SELECT
  'c3333333-3333-3333-3333-333333333333'::UUID,
  ctx.demo_brand_id,
  '🚀 Smart Accessories Launch',
  'Launch our new line of smart accessories including smartwatches, fitness bands, and tech bags. Target tech-savvy professionals (25-45). Platforms: Instagram, YouTube.',
  200000.00,
  CURRENT_DATE - INTERVAL '20 days',
  CURRENT_DATE + INTERVAL '10 days',
  ARRAY['Product Marketing', 'Brand Awareness', 'Sales Conversion'],
  'Demonstrate product features and tech capabilities. Show real-life use cases. Include unboxing and detailed reviews. Creator Tier: Mega (100K-2M followers).',
  '{"reel": 5, "post": 6, "story": 12, "igtv": 3}'::jsonb,
  'active',
  'content_approval',
  25000,
  8,
  6,
  6,
  TRUE,
  NOW() - INTERVAL '18 days',
  'paid',
  NOW() - INTERVAL '17 days',
  NOW() - INTERVAL '22 days',
  NOW() - INTERVAL '15 days'
FROM ctx;

-- Add creators for Campaign 3
WITH ctx AS (SELECT demo_brand_id FROM demo_context),
     creator_ids AS (
       SELECT c.id, s.external_id, s.name, s.followers_count,
              ROW_NUMBER() OVER (ORDER BY s.followers_count DESC) as rn
       FROM creators c
       JOIN demo_creators_seed s ON c.external_id = s.external_id
       WHERE s.tier = 'mega'
       LIMIT 6
     )
INSERT INTO campaign_creators (
  id,
  campaign_id,
  creator_id,
  status,
  recommended_by_admin,
  admin_notes,
  negotiated_rate,
  created_at
)
SELECT
  gen_random_uuid(),
  'c3333333-3333-3333-3333-333333333333'::UUID,
  ci.id,
  'contracted',
  TRUE,
  'Top tech influencer. Perfect for smart accessories. Match score: ' ||
    CASE WHEN ci.rn <= 3 THEN '96%' ELSE '93%' END,
  25000 + (ci.rn * 2000),
  NOW() - INTERVAL '20 days' + (ci.rn || ' hours')::INTERVAL
FROM creator_ids ci;

-- Add sample content submissions
WITH creator_ids AS (
  SELECT cc.creator_id, c.name, c.followers_count,
         ROW_NUMBER() OVER (ORDER BY RANDOM()) as rn
  FROM campaign_creators cc
  JOIN creators c ON c.id = cc.creator_id
  WHERE cc.campaign_id = 'c3333333-3333-3333-3333-333333333333'::UUID
)
INSERT INTO campaign_contents (
  id,
  campaign_id,
  creator_id,
  content_type,
  content_url,
  thumbnail_url,
  caption,
  hashtags,
  approval_status,
  admin_feedback,
  brand_feedback,
  scheduled_post_time,
  created_at
)
SELECT
  gen_random_uuid(),
  'c3333333-3333-3333-3333-333333333333'::UUID,
  ci.creator_id,
  CASE (ci.rn % 3)
    WHEN 0 THEN 'reel'
    WHEN 1 THEN 'post'
    ELSE 'igtv'
  END,
  CASE (ci.rn % 3)
    WHEN 0 THEN 'https://images.unsplash.com/photo-1434493789847-2f02dc6ca35d?w=800'
    WHEN 1 THEN 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800'
    ELSE 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=800'
  END,
  CASE (ci.rn % 6)
    WHEN 0 THEN 'https://images.unsplash.com/photo-1434493789847-2f02dc6ca35d?w=400'
    WHEN 1 THEN 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400'
    WHEN 2 THEN 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=400'
    WHEN 3 THEN 'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=400'
    WHEN 4 THEN 'https://images.unsplash.com/photo-1544117519-31a4b719223d?w=400'
    ELSE 'https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=400'
  END,
  'Just got my hands on the new @TechStyleFashion smartwatch! 🚀⌚ ' ||
  'The health tracking features are incredible. Perfect for my active lifestyle! ' ||
  'Check out my review and use code SMART20 for 20% off. #TechStyle #SmartWatch #FitnessGoals',
  ARRAY['#TechStyle', '#SmartWatch', '#FitnessGoals', '#WearableTech'],
  CASE
    WHEN ci.rn <= 3 THEN 'approved'
    WHEN ci.rn <= 5 THEN 'pending'
    ELSE 'needs_revision'
  END,
  CASE
    WHEN ci.rn > 5 THEN 'Please add more product close-ups showing the display features.'
    WHEN ci.rn <= 3 THEN 'Excellent content! Approved for publishing.'
    ELSE NULL
  END,
  CASE
    WHEN ci.rn <= 3 THEN 'Love the energy and product showcase. Approved!'
    WHEN ci.rn <= 5 THEN 'Looking good, awaiting admin review.'
    ELSE 'Need better lighting for the unboxing segment.'
  END,
  NOW() + INTERVAL '2 days' + (ci.rn || ' hours')::INTERVAL,
  NOW() - INTERVAL '5 days' + (ci.rn || ' days')::INTERVAL
FROM creator_ids ci;

-- Add SANDBOX payment record
WITH ctx AS (SELECT demo_brand_id FROM demo_context)
INSERT INTO payments (
  id,
  campaign_id,
  amount,
  currency,
  razorpay_order_id,
  razorpay_payment_id,
  status,
  payment_method,
  payment_details,
  created_at,
  payment_verified_at
)
SELECT
  gen_random_uuid(),
  'c3333333-3333-3333-3333-333333333333'::UUID,
  150000.00,
  'INR',
  'sandbox_order_' || substr(md5(random()::text), 1, 16),
  'sandbox_pay_' || substr(md5(random()::text), 1, 16),
  'paid',
  'test_upi',
  '{"sandbox_mode": true, "auto_approved": true, "test_payment": true, "note": "This is a simulated payment for demo purposes"}'::jsonb,
  NOW() - INTERVAL '18 days',
  NOW() - INTERVAL '17 days'
FROM ctx;

-- Activity log
WITH ctx AS (SELECT demo_brand_id, demo_user_id, admin_user_id FROM demo_context)
INSERT INTO campaign_activities (campaign_id, user_id, user_type, activity_type, description, metadata, created_at)
SELECT * FROM (
  SELECT 'c3333333-3333-3333-3333-333333333333'::UUID, ctx.demo_user_id, 'brand', 'campaign_created',
         'Smart accessories campaign created', '{"sandbox_mode": true}'::jsonb, NOW() - INTERVAL '22 days' FROM ctx
  UNION ALL
  SELECT 'c3333333-3333-3333-3333-333333333333', ctx.admin_user_id, 'admin', 'creators_recommended',
         '8 mega tech influencers recommended', '{}'::jsonb, NOW() - INTERVAL '20 days' FROM ctx
  UNION ALL
  SELECT 'c3333333-3333-3333-3333-333333333333', ctx.demo_user_id, 'brand', 'creators_approved',
         '6 creators selected and approved', '{"approved_count": 6}'::jsonb, NOW() - INTERVAL '19 days' FROM ctx
  UNION ALL
  SELECT 'c3333333-3333-3333-3333-333333333333', ctx.demo_user_id, 'brand', 'payment_initiated',
         'Sandbox payment initiated (₹1,50,000)', '{"sandbox_mode": true, "amount": 150000}'::jsonb, NOW() - INTERVAL '18 days' FROM ctx
  UNION ALL
  SELECT 'c3333333-3333-3333-3333-333333333333', ctx.admin_user_id, 'admin', 'payment_completed',
         'Sandbox payment completed successfully', '{"sandbox_mode": true, "auto_approved": true}'::jsonb, NOW() - INTERVAL '17 days' FROM ctx
  UNION ALL
  SELECT 'c3333333-3333-3333-3333-333333333333', ctx.admin_user_id, 'admin', 'content_submitted',
         'Creators started submitting content', '{}'::jsonb, NOW() - INTERVAL '10 days' FROM ctx
  UNION ALL
  SELECT 'c3333333-3333-3333-3333-333333333333', ctx.demo_user_id, 'brand', 'content_under_review',
         'Reviewing submitted content for approval', '{"total_submitted": 6}'::jsonb, NOW() - INTERVAL '5 days' FROM ctx
) rows;

COMMIT;

SELECT '✅ Campaign 3 (Content Approval with SANDBOX payment) created' as status;

-- ============================================================
-- STEP 9: CAMPAIGN 4 - Completed Campaign with Analytics
-- ============================================================

BEGIN;

WITH ctx AS (SELECT demo_brand_id FROM demo_context)
INSERT INTO campaigns (
  id,
  brand_id,
  campaign_name,
  description,
  budget,
  start_date,
  end_date,
  campaign_objectives,
  requirements,
  deliverables,
  status,
  phase,
  estimated_cost_per_creator,
  max_affordable_creators,
  actual_creators_selected,
  creators_approved_count,
  payment_initiated,
  payment_initiated_at,
  payment_status,
  payment_completed_at,
  campaign_started_at,
  campaign_completed_at,
  created_at,
  updated_at
)
SELECT
  'c4444444-4444-4444-4444-444444444444'::UUID,
  ctx.demo_brand_id,
  '✨ Winter Collection 2024',
  'Winter fashion collection launch with focus on warmth and style. Successfully completed campaign with excellent results.',
  90000.00,
  CURRENT_DATE - INTERVAL '60 days',
  CURRENT_DATE - INTERVAL '10 days',
  ARRAY['Brand Awareness', 'Product Marketing', 'Engagement'],
  'Showcase winter collection in cozy settings. Highlight fabric warmth and comfort.',
  '{"reel": 4, "post": 5, "story": 10}'::jsonb,
  'completed',
  'campaign_complete',
  4500,
  20,
  5,
  5,
  TRUE,
  NOW() - INTERVAL '58 days',
  'paid',
  NOW() - INTERVAL '57 days',
  NOW() - INTERVAL '55 days',
  NOW() - INTERVAL '10 days',
  NOW() - INTERVAL '62 days',
  NOW() - INTERVAL '10 days'
FROM ctx;

-- Add creators for completed campaign
WITH ctx AS (SELECT demo_brand_id FROM demo_context),
     creator_ids AS (
       SELECT c.id, s.external_id, s.name, s.followers_count,
              ROW_NUMBER() OVER (ORDER BY RANDOM()) as rn
       FROM creators c
       JOIN demo_creators_seed s ON c.external_id = s.external_id
       WHERE s.tier = 'micro'
       LIMIT 5
     )
INSERT INTO campaign_creators (
  id,
  campaign_id,
  creator_id,
  status,
  recommended_by_admin,
  admin_notes,
  negotiated_rate,
  deliverables_count,
  deliverables_completed,
  created_at
)
SELECT
  gen_random_uuid(),
  'c4444444-4444-4444-4444-444444444444'::UUID,
  ci.id,
  'delivered',
  TRUE,
  'Completed all deliverables successfully. Excellent performance.',
  4500,
  4,
  4,
  NOW() - INTERVAL '60 days'
FROM creator_ids ci;

-- Add published content (multiple pieces per creator for comprehensive results)
WITH creator_data AS (
  SELECT cc.creator_id, c.followers_count, c.name, c.ig_handle,
         ROW_NUMBER() OVER (ORDER BY c.followers_count DESC) as rn
  FROM campaign_creators cc
  JOIN creators c ON c.id = cc.creator_id
  WHERE cc.campaign_id = 'c4444444-4444-4444-4444-444444444444'::UUID
)
INSERT INTO campaign_contents (
  id,
  campaign_id,
  creator_id,
  content_type,
  content_url,
  thumbnail_url,
  caption,
  hashtags,
  approval_status,
  scheduled_post_time,
  posted_at,
  post_url,
  performance_metrics,
  created_at,
  approved_at
)
SELECT
  gen_random_uuid(),
  'c4444444-4444-4444-4444-444444444444'::UUID,
  cd.creator_id,
  content_types.content_type,
  CASE ((cd.rn + content_types.content_num) % 8)
    WHEN 0 THEN 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=800'
    WHEN 1 THEN 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800'
    WHEN 2 THEN 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800'
    WHEN 3 THEN 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=800'
    WHEN 4 THEN 'https://images.unsplash.com/photo-1544923246-77307dd628b5?w=800'
    WHEN 5 THEN 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800'
    WHEN 6 THEN 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=800'
    ELSE 'https://images.unsplash.com/photo-1495385794356-15371f348c31?w=800'
  END,
  CASE ((cd.rn + content_types.content_num) % 8)
    WHEN 0 THEN 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=400'
    WHEN 1 THEN 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400'
    WHEN 2 THEN 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400'
    WHEN 3 THEN 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=400'
    WHEN 4 THEN 'https://images.unsplash.com/photo-1544923246-77307dd628b5?w=400'
    WHEN 5 THEN 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400'
    WHEN 6 THEN 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=400'
    ELSE 'https://images.unsplash.com/photo-1495385794356-15371f348c31?w=400'
  END,
  CASE content_types.content_num
    WHEN 1 THEN '🧥❄️ Winter is HERE and I''m obsessed with @TechStyleFashion new collection! The perfect blend of warmth and style. Swipe to see my faves! #WinterFashion #CozyVibes #TechStyle'
    WHEN 2 THEN '☕ Cozy mornings call for cozy outfits! This @TechStyleFashion sweater is literally the softest thing I own. Use code WINTER20 for 20% off! #WinterStyle #OOTD'
    WHEN 3 THEN '✨ Holiday party ready! @TechStyleFashion winter collection has THE best pieces for every occasion. Link in bio! #HolidayFashion #WinterCollection'
    ELSE '❄️ Bundled up and feeling fabulous! @TechStyleFashion keeping me stylish all winter long. What''s your go-to winter look? 👇 #WinterWardrobe #StyleInspo'
  END,
  ARRAY['#WinterFashion', '#CozyVibes', '#TechStyle', '#WinterStyle', '#OOTD', '#HolidayFashion'],
  'approved',
  NOW() - INTERVAL '50 days' + (content_types.content_num || ' days')::INTERVAL,
  NOW() - INTERVAL '48 days' + (content_types.content_num || ' days')::INTERVAL + (cd.rn || ' hours')::INTERVAL,
  'https://instagram.com/p/' || substr(md5(random()::text || cd.rn || content_types.content_num), 1, 11),
  jsonb_build_object(
    'reach', (cd.followers_count * (0.55 + random() * 0.35))::INT,
    'impressions', (cd.followers_count * (1.15 + random() * 0.65))::INT,
    'views', (cd.followers_count * (0.75 + random() * 0.45))::INT,
    'likes', (cd.followers_count * (0.058 + random() * 0.032))::INT,
    'comments', (cd.followers_count * (0.006 + random() * 0.004))::INT,
    'saves', (cd.followers_count * (0.018 + random() * 0.012))::INT,
    'shares', (cd.followers_count * (0.012 + random() * 0.008))::INT,
    'link_clicks', (cd.followers_count * (0.008 + random() * 0.006))::INT,
    'profile_visits', (cd.followers_count * (0.004 + random() * 0.003))::INT
  ),
  NOW() - INTERVAL '52 days' + (content_types.content_num || ' days')::INTERVAL,
  NOW() - INTERVAL '50 days' + (content_types.content_num || ' days')::INTERVAL
FROM creator_data cd
CROSS JOIN (
  SELECT 1 as content_num, 'reel' as content_type UNION ALL
  SELECT 2, 'post' UNION ALL
  SELECT 3, 'carousel' UNION ALL
  SELECT 4, 'story'
) content_types;

-- Add comprehensive performance data with multi-day tracking
WITH creator_content AS (
  SELECT 
    cc.creator_id,
    cnt.id as content_id,
    c.followers_count,
    ROW_NUMBER() OVER (ORDER BY cnt.posted_at ASC) as rn
  FROM campaign_creators cc
  JOIN creators c ON c.id = cc.creator_id
  JOIN campaign_contents cnt ON cnt.creator_id = cc.creator_id
  WHERE cc.campaign_id = 'c4444444-4444-4444-4444-444444444444'::UUID
    AND cnt.campaign_id = 'c4444444-4444-4444-4444-444444444444'::UUID
)
INSERT INTO campaign_performance (
  id,
  campaign_id,
  creator_id,
  content_id,
  metric_type,
  metric_value,
  measurement_date,
  data_source,
  created_at
)
SELECT
  gen_random_uuid(),
  'c4444444-4444-4444-4444-444444444444'::UUID,
  cc.creator_id,
  cc.content_id,
  metric.metric_type,
  metric.metric_value,
  metric.measurement_date,
  'instagram_api',
  metric.measurement_date + TIME '12:00:00'
FROM creator_content cc
CROSS JOIN LATERAL (
  VALUES
    -- Week 1 metrics (early performance)
    ('reach', (cc.followers_count * (0.25 + random() * 0.15))::NUMERIC(15,2), (NOW() - INTERVAL '45 days')::date),
    ('impressions', (cc.followers_count * (0.45 + random() * 0.25))::NUMERIC(15,2), (NOW() - INTERVAL '45 days')::date),
    ('views', (cc.followers_count * (0.32 + random() * 0.18))::NUMERIC(15,2), (NOW() - INTERVAL '45 days')::date),
    ('engagement', (cc.followers_count * (0.022 + random() * 0.012))::NUMERIC(15,2), (NOW() - INTERVAL '45 days')::date),
    ('clicks', (cc.followers_count * (0.004 + random() * 0.003))::NUMERIC(15,2), (NOW() - INTERVAL '45 days')::date),
    
    -- Week 2 metrics (growing momentum)
    ('reach', (cc.followers_count * (0.42 + random() * 0.22))::NUMERIC(15,2), (NOW() - INTERVAL '38 days')::date),
    ('impressions', (cc.followers_count * (0.78 + random() * 0.38))::NUMERIC(15,2), (NOW() - INTERVAL '38 days')::date),
    ('views', (cc.followers_count * (0.55 + random() * 0.28))::NUMERIC(15,2), (NOW() - INTERVAL '38 days')::date),
    ('engagement', (cc.followers_count * (0.038 + random() * 0.018))::NUMERIC(15,2), (NOW() - INTERVAL '38 days')::date),
    ('clicks', (cc.followers_count * (0.007 + random() * 0.005))::NUMERIC(15,2), (NOW() - INTERVAL '38 days')::date),
    ('saves', (cc.followers_count * (0.008 + random() * 0.006))::NUMERIC(15,2), (NOW() - INTERVAL '38 days')::date),
    
    -- Week 3 metrics (peak performance)
    ('reach', (cc.followers_count * (0.58 + random() * 0.28))::NUMERIC(15,2), (NOW() - INTERVAL '31 days')::date),
    ('impressions', (cc.followers_count * (1.05 + random() * 0.55))::NUMERIC(15,2), (NOW() - INTERVAL '31 days')::date),
    ('views', (cc.followers_count * (0.72 + random() * 0.38))::NUMERIC(15,2), (NOW() - INTERVAL '31 days')::date),
    ('engagement', (cc.followers_count * (0.052 + random() * 0.025))::NUMERIC(15,2), (NOW() - INTERVAL '31 days')::date),
    ('clicks', (cc.followers_count * (0.012 + random() * 0.008))::NUMERIC(15,2), (NOW() - INTERVAL '31 days')::date),
    ('saves', (cc.followers_count * (0.015 + random() * 0.010))::NUMERIC(15,2), (NOW() - INTERVAL '31 days')::date),
    ('shares', (cc.followers_count * (0.010 + random() * 0.007))::NUMERIC(15,2), (NOW() - INTERVAL '31 days')::date),
    
    -- Week 4 metrics (sustained engagement)
    ('reach', (cc.followers_count * (0.65 + random() * 0.32))::NUMERIC(15,2), (NOW() - INTERVAL '24 days')::date),
    ('impressions', (cc.followers_count * (1.25 + random() * 0.65))::NUMERIC(15,2), (NOW() - INTERVAL '24 days')::date),
    ('views', (cc.followers_count * (0.85 + random() * 0.42))::NUMERIC(15,2), (NOW() - INTERVAL '24 days')::date),
    ('engagement', (cc.followers_count * (0.058 + random() * 0.028))::NUMERIC(15,2), (NOW() - INTERVAL '24 days')::date),
    ('clicks', (cc.followers_count * (0.015 + random() * 0.010))::NUMERIC(15,2), (NOW() - INTERVAL '24 days')::date),
    ('saves', (cc.followers_count * (0.018 + random() * 0.012))::NUMERIC(15,2), (NOW() - INTERVAL '24 days')::date),
    ('shares', (cc.followers_count * (0.012 + random() * 0.008))::NUMERIC(15,2), (NOW() - INTERVAL '24 days')::date),
    ('conversions', (cc.followers_count * (0.003 + random() * 0.002))::NUMERIC(15,2), (NOW() - INTERVAL '24 days')::date),
    
    -- Final metrics (campaign end - consolidated totals)
    ('reach', (cc.followers_count * (0.72 + random() * 0.38))::NUMERIC(15,2), (NOW() - INTERVAL '12 days')::date),
    ('impressions', (cc.followers_count * (1.45 + random() * 0.75))::NUMERIC(15,2), (NOW() - INTERVAL '12 days')::date),
    ('views', (cc.followers_count * (0.95 + random() * 0.48))::NUMERIC(15,2), (NOW() - INTERVAL '12 days')::date),
    ('engagement', (cc.followers_count * (0.065 + random() * 0.032))::NUMERIC(15,2), (NOW() - INTERVAL '12 days')::date),
    ('clicks', (cc.followers_count * (0.018 + random() * 0.012))::NUMERIC(15,2), (NOW() - INTERVAL '12 days')::date),
    ('saves', (cc.followers_count * (0.022 + random() * 0.014))::NUMERIC(15,2), (NOW() - INTERVAL '12 days')::date),
    ('shares', (cc.followers_count * (0.015 + random() * 0.010))::NUMERIC(15,2), (NOW() - INTERVAL '12 days')::date),
    ('conversions', (cc.followers_count * (0.005 + random() * 0.003))::NUMERIC(15,2), (NOW() - INTERVAL '12 days')::date),
    ('roi_contribution', (cc.followers_count * (0.008 + random() * 0.004))::NUMERIC(15,2), (NOW() - INTERVAL '12 days')::date)
) AS metric(metric_type, metric_value, measurement_date)
WHERE cc.rn <= 20;

-- Add sandbox payment record
INSERT INTO payments (
  id,
  campaign_id,
  amount,
  currency,
  razorpay_order_id,
  razorpay_payment_id,
  status,
  payment_method,
  payment_details,
  created_at,
  payment_verified_at
)
VALUES (
  gen_random_uuid(),
  'c4444444-4444-4444-4444-444444444444'::UUID,
  22500.00,
  'INR',
  'sandbox_order_' || substr(md5(random()::text), 1, 16),
  'sandbox_pay_' || substr(md5(random()::text), 1, 16),
  'paid',
  'test_card',
  '{"sandbox_mode": true, "auto_approved": true, "test_payment": true}'::jsonb,
  NOW() - INTERVAL '58 days',
  NOW() - INTERVAL '57 days'
);

-- Activity log for completed campaign with detailed results
WITH ctx AS (SELECT demo_brand_id, demo_user_id, admin_user_id FROM demo_context)
INSERT INTO campaign_activities (campaign_id, user_id, user_type, activity_type, description, metadata, created_at)
SELECT * FROM (
  SELECT 'c4444444-4444-4444-4444-444444444444'::UUID, ctx.demo_user_id, 'brand', 'campaign_created',
         'Winter collection campaign created', '{"sandbox_mode": true}'::jsonb, NOW() - INTERVAL '62 days' FROM ctx
  UNION ALL
  SELECT 'c4444444-4444-4444-4444-444444444444', ctx.admin_user_id, 'admin', 'creators_recommended',
         '8 micro creators recommended for winter collection', '{"creator_count": 8, "tier": "micro"}'::jsonb, NOW() - INTERVAL '60 days' FROM ctx
  UNION ALL
  SELECT 'c4444444-4444-4444-4444-444444444444', ctx.demo_user_id, 'brand', 'creators_approved',
         '5 creators selected and approved', '{"approved_count": 5}'::jsonb, NOW() - INTERVAL '59 days' FROM ctx
  UNION ALL
  SELECT 'c4444444-4444-4444-4444-444444444444', ctx.admin_user_id, 'admin', 'payment_completed',
         'Sandbox payment completed (₹22,500)', '{"sandbox_mode": true, "amount": 22500}'::jsonb, NOW() - INTERVAL '57 days' FROM ctx
  UNION ALL
  SELECT 'c4444444-4444-4444-4444-444444444444', ctx.admin_user_id, 'admin', 'content_approved',
         '20 content pieces approved for posting', '{"approved_count": 20, "content_types": {"reel": 5, "post": 5, "carousel": 5, "story": 5}}'::jsonb, NOW() - INTERVAL '52 days' FROM ctx
  UNION ALL
  SELECT 'c4444444-4444-4444-4444-444444444444', ctx.admin_user_id, 'admin', 'campaign_started',
         'Campaign is now LIVE! Content posting started', '{"phase": "campaign_active"}'::jsonb, NOW() - INTERVAL '48 days' FROM ctx
  UNION ALL
  SELECT 'c4444444-4444-4444-4444-444444444444', ctx.admin_user_id, 'admin', 'content_published',
         'All content published successfully', '{"total_published": 20}'::jsonb, NOW() - INTERVAL '40 days' FROM ctx
  UNION ALL
  SELECT 'c4444444-4444-4444-4444-444444444444', ctx.admin_user_id, 'admin', 'analytics_update',
         'Week 2: Campaign exceeding engagement targets', '{"reach": 28500, "engagement_rate": "4.8%", "trending": "up"}'::jsonb, NOW() - INTERVAL '38 days' FROM ctx
  UNION ALL
  SELECT 'c4444444-4444-4444-4444-444444444444', ctx.admin_user_id, 'admin', 'analytics_update',
         'Week 3: Peak performance achieved', '{"total_reach": 52000, "total_impressions": 95000, "total_views": 68000, "engagement_rate": "5.2%"}'::jsonb, NOW() - INTERVAL '31 days' FROM ctx
  UNION ALL
  SELECT 'c4444444-4444-4444-4444-444444444444', ctx.admin_user_id, 'admin', 'analytics_update',
         'Week 4: Strong sustained engagement', '{"total_reach": 78000, "total_clicks": 1450, "conversion_rate": "2.8%"}'::jsonb, NOW() - INTERVAL '24 days' FROM ctx
  UNION ALL
  SELECT 'c4444444-4444-4444-4444-444444444444', ctx.admin_user_id, 'admin', 'analytics_collected',
         'Final performance analytics collected', '{"total_reach": 89500, "total_impressions": 165000, "total_views": 112000, "total_engagement": 5850, "avg_engagement_rate": "6.5%"}'::jsonb, NOW() - INTERVAL '12 days' FROM ctx
  UNION ALL
  SELECT 'c4444444-4444-4444-4444-444444444444', ctx.admin_user_id, 'admin', 'campaign_completed',
         'Campaign completed with EXCELLENT results! 🎉', '{"final_results": {"total_reach": 89500, "total_impressions": 165000, "total_views": 112000, "total_engagement": 5850, "total_clicks": 2150, "total_saves": 1820, "total_shares": 980, "conversions": 285, "roi": "3.2x", "cost_per_engagement": "₹3.85", "cost_per_click": "₹10.47"}, "performance_rating": "excellent", "exceeded_targets": true}'::jsonb, NOW() - INTERVAL '10 days' FROM ctx
) rows;

COMMIT;

SELECT '✅ Campaign 4 (Completed with Analytics) created' as status;

-- ============================================================
-- STEP 10: CAMPAIGN 5 - Campaign Active Phase with LIVE Analytics
-- ============================================================

BEGIN;

WITH ctx AS (SELECT demo_brand_id FROM demo_context)
INSERT INTO campaigns (
  id,
  brand_id,
  campaign_name,
  description,
  budget,
  start_date,
  end_date,
  campaign_objectives,
  requirements,
  deliverables,
  status,
  phase,
  estimated_cost_per_creator,
  max_affordable_creators,
  actual_creators_selected,
  creators_approved_count,
  payment_initiated,
  payment_initiated_at,
  payment_status,
  payment_completed_at,
  campaign_started_at,
  created_at,
  updated_at
)
SELECT
  'c5555555-5555-5555-5555-555555555555'::UUID,
  ctx.demo_brand_id,
  '📊 Diwali Flash Sale - LIVE',
  'High-intensity Diwali flash sale campaign currently running. All content is live and generating real-time engagement. Monitor live analytics dashboard for performance tracking.',
  180000.00,
  CURRENT_DATE - INTERVAL '7 days',
  CURRENT_DATE + INTERVAL '7 days',
  ARRAY['Sales Conversion', 'Brand Awareness', 'Engagement', 'Website Traffic'],
  'Promote Diwali flash sale with discount codes. Create urgency with limited-time offers. Include swipe-up links and clear CTAs.',
  '{"reel": 6, "post": 8, "story": 15, "carousel": 4}'::jsonb,
  'active',
  'campaign_active',
  9000,
  20,
  7,
  7,
  TRUE,
  NOW() - INTERVAL '10 days',
  'paid',
  NOW() - INTERVAL '9 days',
  NOW() - INTERVAL '7 days',
  NOW() - INTERVAL '12 days',
  NOW() - INTERVAL '2 hours'
FROM ctx;

-- Add creators for active campaign (mix of macro and mega)
WITH ctx AS (SELECT demo_brand_id FROM demo_context),
     creator_ids AS (
       SELECT c.id, s.external_id, s.name, s.followers_count, s.tier,
              ROW_NUMBER() OVER (ORDER BY s.followers_count DESC) as rn
       FROM creators c
       JOIN demo_creators_seed s ON c.external_id = s.external_id
       WHERE s.tier IN ('macro', 'mega')
       ORDER BY s.followers_count DESC
       LIMIT 7
     )
INSERT INTO campaign_creators (
  id,
  campaign_id,
  creator_id,
  status,
  recommended_by_admin,
  admin_notes,
  negotiated_rate,
  deliverables_count,
  deliverables_completed,
  created_at
)
SELECT
  gen_random_uuid(),
  'c5555555-5555-5555-5555-555555555555'::UUID,
  ci.id,
  'contracted',
  TRUE,
  'Live campaign creator. Currently posting content. Performance: ' ||
    CASE WHEN ci.rn <= 3 THEN 'Excellent - exceeding targets' ELSE 'Good - on track' END,
  9000 + (ci.rn * 500),
  CASE WHEN ci.tier = 'mega' THEN 5 ELSE 4 END,
  CASE WHEN ci.rn <= 4 THEN 3 ELSE 2 END,
  NOW() - INTERVAL '10 days'
FROM creator_ids ci;

-- Add LIVE published content with recent posting times
WITH creator_data AS (
  SELECT cc.creator_id, c.followers_count, c.name, c.ig_handle,
         ROW_NUMBER() OVER (ORDER BY c.followers_count DESC) as rn
  FROM campaign_creators cc
  JOIN creators c ON c.id = cc.creator_id
  WHERE cc.campaign_id = 'c5555555-5555-5555-5555-555555555555'::UUID
)
INSERT INTO campaign_contents (
  id,
  campaign_id,
  creator_id,
  content_type,
  content_url,
  thumbnail_url,
  caption,
  hashtags,
  approval_status,
  scheduled_post_time,
  posted_at,
  post_url,
  performance_metrics,
  created_at,
  approved_at
)
SELECT
  gen_random_uuid(),
  'c5555555-5555-5555-5555-555555555555'::UUID,
  cd.creator_id,
  content_types.content_type,
  CASE ((cd.rn + content_types.content_num) % 6)
    WHEN 0 THEN 'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=800'
    WHEN 1 THEN 'https://images.unsplash.com/photo-1574484284002-952d92456975?w=800'
    WHEN 2 THEN 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=800'
    WHEN 3 THEN 'https://images.unsplash.com/photo-1514222709107-a180c68d72b4?w=800'
    WHEN 4 THEN 'https://images.unsplash.com/photo-1607083206968-13611e3d76db?w=800'
    ELSE 'https://images.unsplash.com/photo-1603228254119-e6a4d095dc59?w=800'
  END,
  CASE ((cd.rn + content_types.content_num) % 8)
    WHEN 0 THEN 'https://images.unsplash.com/photo-1604719312566-8912e9227c6a?w=400'
    WHEN 1 THEN 'https://images.unsplash.com/photo-1574484284002-952d92456975?w=400'
    WHEN 2 THEN 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=400'
    WHEN 3 THEN 'https://images.unsplash.com/photo-1514222709107-a180c68d72b4?w=400'
    WHEN 4 THEN 'https://images.unsplash.com/photo-1607083206968-13611e3d76db?w=400'
    WHEN 5 THEN 'https://images.unsplash.com/photo-1603228254119-e6a4d095dc59?w=400'
    WHEN 6 THEN 'https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?w=400'
    ELSE 'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=400'
  END,
  CASE content_types.content_num
    WHEN 1 THEN '🪔✨ DIWALI FLASH SALE IS HERE! Up to 60% OFF on @TechStyleFashion! Limited time only - don''t miss out! Use code DIWALI60 🎉 #DiwaliSale #FlashSale #TechStyle'
    WHEN 2 THEN '🛍️ My top picks from the @TechStyleFashion Diwali collection! Which one''s your fave? Comment below 👇 #DiwaliVibes #FestiveFashion #TechStyle'
    ELSE '⚡ LAST 48 HOURS! The biggest sale of the year ends soon. Grab your favorites before they''re gone! @TechStyleFashion #DiwaliDeals #ShopNow'
  END,
  ARRAY['#DiwaliSale', '#FlashSale', '#TechStyle', '#FestiveFashion', '#DiwaliVibes'],
  'approved',
  NOW() - INTERVAL '8 days' + (content_types.content_num || ' days')::INTERVAL,
  NOW() - INTERVAL '7 days' + (content_types.content_num || ' days')::INTERVAL + (cd.rn || ' hours')::INTERVAL,
  'https://instagram.com/p/' || substr(md5(random()::text || cd.rn || content_types.content_num), 1, 11),
  jsonb_build_object(
    'reach', (cd.followers_count * (0.35 + random() * 0.25))::INT,
    'impressions', (cd.followers_count * (0.75 + random() * 0.45))::INT,
    'views', (cd.followers_count * (0.55 + random() * 0.35))::INT,
    'likes', (cd.followers_count * (0.038 + random() * 0.022))::INT,
    'comments', (cd.followers_count * (0.003 + random() * 0.002))::INT,
    'saves', (cd.followers_count * (0.008 + random() * 0.007))::INT,
    'shares', (cd.followers_count * (0.006 + random() * 0.004))::INT,
    'link_clicks', (cd.followers_count * (0.012 + random() * 0.008))::INT,
    'profile_visits', (cd.followers_count * (0.005 + random() * 0.003))::INT
  ),
  NOW() - INTERVAL '9 days' + (content_types.content_num || ' days')::INTERVAL,
  NOW() - INTERVAL '8 days' + (content_types.content_num || ' days')::INTERVAL
FROM creator_data cd
CROSS JOIN (
  SELECT 1 as content_num, 'reel' as content_type UNION ALL
  SELECT 2, 'post' UNION ALL
  SELECT 3, 'story'
) content_types
WHERE cd.rn <= 5 OR content_types.content_num <= 2;

-- Add LIVE real-time performance metrics (multiple data points for trending)
WITH live_content AS (
  SELECT 
    cc.creator_id,
    cnt.id as content_id,
    c.followers_count,
    ROW_NUMBER() OVER (ORDER BY cnt.posted_at DESC) as content_rn
  FROM campaign_creators cc
  JOIN creators c ON c.id = cc.creator_id
  JOIN campaign_contents cnt ON cnt.creator_id = cc.creator_id
  WHERE cc.campaign_id = 'c5555555-5555-5555-5555-555555555555'::UUID
    AND cnt.campaign_id = 'c5555555-5555-5555-5555-555555555555'::UUID
    AND cnt.posted_at IS NOT NULL
)
INSERT INTO campaign_performance (
  id,
  campaign_id,
  creator_id,
  content_id,
  metric_type,
  metric_value,
  measurement_date,
  data_source,
  created_at
)
SELECT
  gen_random_uuid(),
  'c5555555-5555-5555-5555-555555555555'::UUID,
  lc.creator_id,
  lc.content_id,
  metric.metric_type,
  metric.metric_value,
  metric.measurement_date,
  'instagram_api',
  metric.measurement_date + TIME '10:00:00'
FROM live_content lc
CROSS JOIN LATERAL (
  VALUES
    -- Day 1 metrics (lower, just posted)
    ('reach', (lc.followers_count * (0.15 + random() * 0.10))::NUMERIC(15,2), (CURRENT_DATE - INTERVAL '6 days')::date),
    ('impressions', (lc.followers_count * (0.25 + random() * 0.15))::NUMERIC(15,2), (CURRENT_DATE - INTERVAL '6 days')::date),
    ('views', (lc.followers_count * (0.18 + random() * 0.12))::NUMERIC(15,2), (CURRENT_DATE - INTERVAL '6 days')::date),
    ('engagement', (lc.followers_count * (0.015 + random() * 0.010))::NUMERIC(15,2), (CURRENT_DATE - INTERVAL '6 days')::date),
    ('clicks', (lc.followers_count * (0.003 + random() * 0.002))::NUMERIC(15,2), (CURRENT_DATE - INTERVAL '6 days')::date),
    
    -- Day 3 metrics (growing)
    ('reach', (lc.followers_count * (0.28 + random() * 0.12))::NUMERIC(15,2), (CURRENT_DATE - INTERVAL '4 days')::date),
    ('impressions', (lc.followers_count * (0.55 + random() * 0.20))::NUMERIC(15,2), (CURRENT_DATE - INTERVAL '4 days')::date),
    ('views', (lc.followers_count * (0.38 + random() * 0.18))::NUMERIC(15,2), (CURRENT_DATE - INTERVAL '4 days')::date),
    ('engagement', (lc.followers_count * (0.028 + random() * 0.012))::NUMERIC(15,2), (CURRENT_DATE - INTERVAL '4 days')::date),
    ('clicks', (lc.followers_count * (0.008 + random() * 0.004))::NUMERIC(15,2), (CURRENT_DATE - INTERVAL '4 days')::date),
    
    -- Day 5 metrics (peak)
    ('reach', (lc.followers_count * (0.42 + random() * 0.18))::NUMERIC(15,2), (CURRENT_DATE - INTERVAL '2 days')::date),
    ('impressions', (lc.followers_count * (0.85 + random() * 0.35))::NUMERIC(15,2), (CURRENT_DATE - INTERVAL '2 days')::date),
    ('views', (lc.followers_count * (0.58 + random() * 0.28))::NUMERIC(15,2), (CURRENT_DATE - INTERVAL '2 days')::date),
    ('engagement', (lc.followers_count * (0.042 + random() * 0.018))::NUMERIC(15,2), (CURRENT_DATE - INTERVAL '2 days')::date),
    ('clicks', (lc.followers_count * (0.015 + random() * 0.008))::NUMERIC(15,2), (CURRENT_DATE - INTERVAL '2 days')::date),
    ('saves', (lc.followers_count * (0.012 + random() * 0.008))::NUMERIC(15,2), (CURRENT_DATE - INTERVAL '2 days')::date),
    ('shares', (lc.followers_count * (0.008 + random() * 0.005))::NUMERIC(15,2), (CURRENT_DATE - INTERVAL '2 days')::date),
    
    -- Today metrics (current/live)
    ('reach', (lc.followers_count * (0.52 + random() * 0.22))::NUMERIC(15,2), CURRENT_DATE),
    ('impressions', (lc.followers_count * (1.05 + random() * 0.45))::NUMERIC(15,2), CURRENT_DATE),
    ('views', (lc.followers_count * (0.72 + random() * 0.35))::NUMERIC(15,2), CURRENT_DATE),
    ('engagement', (lc.followers_count * (0.052 + random() * 0.023))::NUMERIC(15,2), CURRENT_DATE),
    ('clicks', (lc.followers_count * (0.022 + random() * 0.012))::NUMERIC(15,2), CURRENT_DATE),
    ('saves', (lc.followers_count * (0.018 + random() * 0.010))::NUMERIC(15,2), CURRENT_DATE),
    ('shares', (lc.followers_count * (0.012 + random() * 0.006))::NUMERIC(15,2), CURRENT_DATE),
    ('conversions', (lc.followers_count * (0.002 + random() * 0.001))::NUMERIC(15,2), CURRENT_DATE)
) AS metric(metric_type, metric_value, measurement_date)
WHERE lc.content_rn <= 12;

-- Add SANDBOX payment record for active campaign
INSERT INTO payments (
  id,
  campaign_id,
  amount,
  currency,
  razorpay_order_id,
  razorpay_payment_id,
  status,
  payment_method,
  payment_details,
  created_at,
  payment_verified_at
)
VALUES (
  gen_random_uuid(),
  'c5555555-5555-5555-5555-555555555555'::UUID,
  63000.00,
  'INR',
  'sandbox_order_' || substr(md5(random()::text), 1, 16),
  'sandbox_pay_' || substr(md5(random()::text), 1, 16),
  'paid',
  'test_upi',
  '{"sandbox_mode": true, "auto_approved": true, "test_payment": true, "campaign_type": "flash_sale"}'::jsonb,
  NOW() - INTERVAL '10 days',
  NOW() - INTERVAL '9 days'
);

-- Activity log for active campaign
WITH ctx AS (SELECT demo_brand_id, demo_user_id, admin_user_id FROM demo_context)
INSERT INTO campaign_activities (campaign_id, user_id, user_type, activity_type, description, metadata, created_at)
SELECT * FROM (
  SELECT 'c5555555-5555-5555-5555-555555555555'::UUID, ctx.demo_user_id, 'brand', 'campaign_created',
         'Diwali flash sale campaign created', '{"sandbox_mode": true, "priority": "high"}'::jsonb, NOW() - INTERVAL '12 days' FROM ctx
  UNION ALL
  SELECT 'c5555555-5555-5555-5555-555555555555', ctx.admin_user_id, 'admin', 'creators_recommended',
         '10 high-engagement creators recommended for flash sale', '{"urgency": "high"}'::jsonb, NOW() - INTERVAL '11 days' FROM ctx
  UNION ALL
  SELECT 'c5555555-5555-5555-5555-555555555555', ctx.demo_user_id, 'brand', 'creators_approved',
         '7 creators selected for campaign', '{"approved_count": 7}'::jsonb, NOW() - INTERVAL '10 days' FROM ctx
  UNION ALL
  SELECT 'c5555555-5555-5555-5555-555555555555', ctx.demo_user_id, 'brand', 'payment_initiated',
         'Sandbox payment initiated (₹63,000)', '{"sandbox_mode": true, "amount": 63000}'::jsonb, NOW() - INTERVAL '10 days' FROM ctx
  UNION ALL
  SELECT 'c5555555-5555-5555-5555-555555555555', ctx.admin_user_id, 'admin', 'payment_completed',
         'Payment verified and completed', '{"sandbox_mode": true}'::jsonb, NOW() - INTERVAL '9 days' FROM ctx
  UNION ALL
  SELECT 'c5555555-5555-5555-5555-555555555555', ctx.admin_user_id, 'admin', 'content_approved',
         'All content approved for posting', '{"approved_count": 15}'::jsonb, NOW() - INTERVAL '8 days' FROM ctx
  UNION ALL
  SELECT 'c5555555-5555-5555-5555-555555555555', ctx.admin_user_id, 'admin', 'campaign_started',
         'Campaign is now LIVE! Content posting started', '{"phase": "campaign_active"}'::jsonb, NOW() - INTERVAL '7 days' FROM ctx
  UNION ALL
  SELECT 'c5555555-5555-5555-5555-555555555555', ctx.admin_user_id, 'admin', 'analytics_update',
         'Day 3: Reach exceeding targets by 15%', '{"reach_target_pct": 115, "engagement_target_pct": 108}'::jsonb, NOW() - INTERVAL '4 days' FROM ctx
  UNION ALL
  SELECT 'c5555555-5555-5555-5555-555555555555', ctx.admin_user_id, 'admin', 'analytics_update',
         'Day 5: Campaign performing excellently. 2.3M total impressions', '{"total_impressions": 2300000, "total_clicks": 45000}'::jsonb, NOW() - INTERVAL '2 days' FROM ctx
  UNION ALL
  SELECT 'c5555555-5555-5555-5555-555555555555', ctx.admin_user_id, 'admin', 'analytics_update',
         'LIVE: Real-time tracking active. View dashboard for current metrics.', '{"live_tracking": true, "last_sync": "2 hours ago"}'::jsonb, NOW() - INTERVAL '2 hours' FROM ctx
) rows;

COMMIT;

SELECT '✅ Campaign 5 (Campaign Active with LIVE Analytics) created' as status;

-- ============================================================
-- FINAL SUMMARY
-- ============================================================

DO $$
DECLARE
  v_brand_count INTEGER;
  v_campaign_count INTEGER;
  v_creator_count INTEGER;
  v_content_count INTEGER;
  v_payment_count INTEGER;
  v_demo_user_email TEXT := 'demo@campayn.com';
BEGIN
  SELECT COUNT(*) INTO v_brand_count FROM brands WHERE user_id IN (SELECT id FROM auth.users WHERE email = v_demo_user_email);
  SELECT COUNT(*) INTO v_campaign_count FROM campaigns WHERE brand_id IN (SELECT id FROM brands WHERE user_id IN (SELECT id FROM auth.users WHERE email = v_demo_user_email));
  SELECT COUNT(*) INTO v_creator_count FROM creators WHERE external_id LIKE 'demo_cr_%';
  SELECT COUNT(*) INTO v_content_count FROM campaign_contents WHERE campaign_id IN (SELECT id FROM campaigns WHERE brand_id IN (SELECT id FROM brands WHERE user_id IN (SELECT id FROM auth.users WHERE email = v_demo_user_email)));
  SELECT COUNT(*) INTO v_payment_count FROM payments WHERE campaign_id IN (SELECT id FROM campaigns WHERE brand_id IN (SELECT id FROM brands WHERE user_id IN (SELECT id FROM auth.users WHERE email = v_demo_user_email)));

  RAISE NOTICE '';
  RAISE NOTICE '╔══════════════════════════════════════════════════════════╗';
  RAISE NOTICE '║   ✨ DEMO SANDBOX ENVIRONMENT - SETUP COMPLETE ✨        ║';
  RAISE NOTICE '╚══════════════════════════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE '📧 Demo Account: %', v_demo_user_email;
  RAISE NOTICE '🏢 Brands Created: %', v_brand_count;
  RAISE NOTICE '📋 Campaigns Created: %', v_campaign_count;
  RAISE NOTICE '👥 Demo Creators: %', v_creator_count;
  RAISE NOTICE '📄 Content Items: %', v_content_count;
  RAISE NOTICE '💳 Sandbox Payments: %', v_payment_count;
  RAISE NOTICE '';
  RAISE NOTICE '🎯 CAMPAIGN BREAKDOWN:';
  RAISE NOTICE '   Campaign 1: Creator Selection Phase (Ready to approve creators)';
  RAISE NOTICE '   Campaign 2: Payment Pending Phase (⚡ SANDBOX PAYMENT READY)';
  RAISE NOTICE '   Campaign 3: Content Approval Phase (Review submitted content)';
  RAISE NOTICE '   Campaign 4: Completed Campaign (Final analytics & reports)';
  RAISE NOTICE '   Campaign 5: Campaign Active Phase (📊 LIVE ANALYTICS DASHBOARD)';
  RAISE NOTICE '';
  RAISE NOTICE '💳 SANDBOX PAYMENT MODE: ✅ ENABLED';
  RAISE NOTICE '   • No real transactions will be processed';
  RAISE NOTICE '   • Payment flow is fully simulated';
  RAISE NOTICE '   • Use test payment methods: test_upi, test_card, test_netbanking';
  RAISE NOTICE '   • Auto-approval enabled for testing';
  RAISE NOTICE '';
  RAISE NOTICE '🚀 NEXT STEPS:';
  RAISE NOTICE '   1. Login as: %', v_demo_user_email;
  RAISE NOTICE '   2. Navigate to Campaign 2 (Festive Season Campaign)';
  RAISE NOTICE '   3. Click "Proceed to Payment" button';
  RAISE NOTICE '   4. Experience the sandbox payment flow';
  RAISE NOTICE '   5. Payment will auto-complete (simulated)';
  RAISE NOTICE '   6. Move to content submission phase';
  RAISE NOTICE '';
  RAISE NOTICE '📊 ANALYTICS DEMO:';
  RAISE NOTICE '   • Campaign 5 (Diwali Flash Sale) has LIVE analytics';
  RAISE NOTICE '   • View real-time reach, impressions, engagement metrics';
  RAISE NOTICE '   • See trending performance data over 7 days';
  RAISE NOTICE '   • Content posted by 7 creators with performance tracking';
  RAISE NOTICE '';
  RAISE NOTICE '✅ Demo environment is ready for testing!';
  RAISE NOTICE '';
END $$;

-- Clean up temp tables
DROP TABLE IF EXISTS demo_context;
DROP TABLE IF EXISTS demo_creators_seed;

SELECT 
  '🎉 SANDBOX DEMO ENVIRONMENT READY!' as "Status",
  'Login as demo@campayn.com to start testing' as "Next Step",
  'Campaign 5 has LIVE analytics dashboard' as "Analytics Demo",
  'Campaign 2 is ready for sandbox payment testing' as "Payment Demo",
  '✅ No real payments will be processed' as "Important";
