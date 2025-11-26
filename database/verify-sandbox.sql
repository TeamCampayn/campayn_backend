-- ============================================================
-- SANDBOX MODE VERIFICATION SCRIPT
-- Run this to verify your sandbox environment is configured correctly
-- ============================================================

SELECT '🔍 CHECKING SANDBOX CONFIGURATION...' as status;

-- Check 1: Payment Config Table Exists
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_config')
    THEN '✅ Payment config table exists'
    ELSE '❌ Payment config table missing - run demo-sandbox-setup.sql'
  END as "Check 1: Payment Config Table";

-- Check 2: Sandbox Mode Enabled
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM payment_config 
      WHERE config_key = 'sandbox_mode' 
      AND config_value->>'enabled' = 'true'
    )
    THEN '✅ Sandbox mode is ENABLED'
    ELSE '❌ Sandbox mode is DISABLED or not configured'
  END as "Check 2: Sandbox Mode Status";

-- Check 3: Demo User Exists
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM auth.users WHERE email = 'demo@campayn.com')
    THEN '✅ Demo user exists (demo@campayn.com)'
    ELSE '❌ Demo user not found - create in Supabase Auth'
  END as "Check 3: Demo User";

-- Check 4: Demo Brand Exists
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM brands 
      WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'demo@campayn.com')
    )
    THEN '✅ Demo brand exists'
    ELSE '❌ Demo brand not found - run demo-sandbox-setup.sql'
  END as "Check 4: Demo Brand";

-- Check 5: Demo Campaigns
SELECT 
  CASE 
    WHEN (
      SELECT COUNT(*) FROM campaigns 
      WHERE brand_id IN (
        SELECT id FROM brands 
        WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'demo@campayn.com')
      )
    ) >= 4
    THEN '✅ All 4 demo campaigns exist'
    WHEN (
      SELECT COUNT(*) FROM campaigns 
      WHERE brand_id IN (
        SELECT id FROM brands 
        WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'demo@campayn.com')
      )
    ) > 0
    THEN '⚠️  Some campaigns exist but not all 4'
    ELSE '❌ No demo campaigns found - run demo-sandbox-setup.sql'
  END as "Check 5: Demo Campaigns";

-- Check 6: Demo Creators
SELECT 
  CASE 
    WHEN (SELECT COUNT(*) FROM creators WHERE external_id LIKE 'demo_cr_%') >= 20
    THEN '✅ Demo creators loaded (' || (SELECT COUNT(*) FROM creators WHERE external_id LIKE 'demo_cr_%') || ' creators)'
    WHEN (SELECT COUNT(*) FROM creators WHERE external_id LIKE 'demo_cr_%') > 0
    THEN '⚠️  Some demo creators exist (' || (SELECT COUNT(*) FROM creators WHERE external_id LIKE 'demo_cr_%') || ' creators)'
    ELSE '❌ No demo creators found - run demo-sandbox-setup.sql'
  END as "Check 6: Demo Creators";

-- Check 7: Sandbox Payments
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM payments 
      WHERE metadata->>'sandbox_mode' = 'true'
    )
    THEN '✅ Sandbox payments exist (' || 
         (SELECT COUNT(*) FROM payments WHERE metadata->>'sandbox_mode' = 'true') || 
         ' payments)'
    ELSE '⚠️  No sandbox payments yet (will be created during testing)'
  END as "Check 7: Sandbox Payments";

-- Check 8: Payment Pending Campaign
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM campaigns 
      WHERE phase = 'payment_pending'
      AND brand_id IN (
        SELECT id FROM brands 
        WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'demo@campayn.com')
      )
    )
    THEN '✅ Payment pending campaign ready for testing'
    ELSE '⚠️  No payment pending campaign found'
  END as "Check 8: Payment Test Campaign";

-- Detailed Status Report
SELECT '📊 DETAILED STATUS REPORT' as "═══════════════════════════════════";

-- Sandbox Configuration
SELECT 
  '💳 Sandbox Configuration' as "Section",
  config_key as "Config",
  config_value as "Value"
FROM payment_config
WHERE config_key IN ('sandbox_mode', 'sandbox_payment_methods');

-- Demo Campaigns Summary
SELECT 
  '📋 Demo Campaigns' as "Section",
  c.campaign_name as "Campaign",
  c.phase as "Phase",
  c.payment_status as "Payment Status",
  c.budget as "Budget",
  CASE 
    WHEN c.phase = 'creator_selection' THEN '👥 Review creators'
    WHEN c.phase = 'payment_pending' THEN '💳 TEST PAYMENT'
    WHEN c.phase = 'content_approval' THEN '📝 Review content'
    WHEN c.phase = 'campaign_complete' THEN '✅ View analytics'
    ELSE c.phase
  END as "Action Required"
FROM campaigns c
JOIN brands b ON c.brand_id = b.id
JOIN auth.users u ON b.user_id = u.id
WHERE u.email = 'demo@campayn.com'
ORDER BY c.created_at;

-- Creator Statistics
SELECT 
  '👥 Demo Creators' as "Section",
  CASE 
    WHEN followers_count < 10000 THEN 'Micro (5K-10K)'
    WHEN followers_count < 100000 THEN 'Macro (10K-100K)'
    ELSE 'Mega (100K+)'
  END as "Tier",
  COUNT(*) as "Count",
  ROUND(AVG(engagement_rate), 2) || '%' as "Avg Engagement"
FROM creators
WHERE external_id LIKE 'demo_cr_%'
GROUP BY 
  CASE 
    WHEN followers_count < 10000 THEN 'Micro (5K-10K)'
    WHEN followers_count < 100000 THEN 'Macro (10K-100K)'
    ELSE 'Mega (100K+)'
  END
ORDER BY MIN(followers_count);

-- Payment Summary
SELECT 
  '💰 Sandbox Payments' as "Section",
  COUNT(*) as "Total Payments",
  COALESCE(SUM(amount), 0) as "Total Amount (INR)",
  COUNT(*) FILTER (WHERE status = 'paid') as "Completed",
  COUNT(*) FILTER (WHERE metadata->>'sandbox_mode' = 'true') as "Sandbox Payments"
FROM payments p
JOIN campaigns c ON p.campaign_id = c.id
JOIN brands b ON c.brand_id = b.id
JOIN auth.users u ON b.user_id = u.id
WHERE u.email = 'demo@campayn.com';

-- Final Verdict
SELECT 
  '═══════════════════════════════════' as "═══════════════════════════════════",
  CASE 
    WHEN EXISTS (SELECT 1 FROM payment_config WHERE config_key = 'sandbox_mode' AND config_value->>'enabled' = 'true')
      AND EXISTS (SELECT 1 FROM auth.users WHERE email = 'demo@campayn.com')
      AND EXISTS (SELECT 1 FROM brands WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'demo@campayn.com'))
      AND (SELECT COUNT(*) FROM campaigns WHERE brand_id IN (SELECT id FROM brands WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'demo@campayn.com'))) >= 4
      AND (SELECT COUNT(*) FROM creators WHERE external_id LIKE 'demo_cr_%') >= 20
    THEN '✅ ALL CHECKS PASSED - Sandbox is ready!'
    ELSE '⚠️  Some issues detected - review checks above'
  END as "Final Status";

-- Next Steps
SELECT 
  '🎯 NEXT STEPS' as "═══════════════════════════════════",
  CASE 
    WHEN NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'demo@campayn.com')
    THEN '1️⃣  Create demo user in Supabase Auth (demo@campayn.com)'
    WHEN NOT EXISTS (SELECT 1 FROM brands WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'demo@campayn.com'))
    THEN '2️⃣  Run demo-sandbox-setup.sql to create demo data'
    WHEN NOT EXISTS (SELECT 1 FROM campaigns WHERE phase = 'payment_pending' AND brand_id IN (SELECT id FROM brands WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'demo@campayn.com')))
    THEN '3️⃣  Check Campaign 2 for payment testing'
    ELSE '4️⃣  Login as demo@campayn.com and start testing!'
  END as "Action";

SELECT 
  '🚀 Ready to Test Payment Flow' as "Status",
  'Login: demo@campayn.com' as "Step 1",
  'Go to: Festive Season Campaign' as "Step 2",
  'Click: Proceed to Payment' as "Step 3",
  'Test: Sandbox payment (no real charges)' as "Step 4";
