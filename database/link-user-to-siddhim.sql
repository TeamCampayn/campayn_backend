-- ============================================================
-- Link your user account to the Siddhim Global School brand
-- Run this in Supabase SQL Editor
-- ============================================================

-- First, find your user ID by email (change this to YOUR email)
SELECT id, email FROM auth.users ORDER BY created_at DESC LIMIT 10;

-- Then update the brand to use your user_id
-- Replace 'YOUR_EMAIL_HERE' with your actual login email
UPDATE brands
SET user_id = (SELECT id FROM auth.users WHERE email = 'dhairyaraniwal914@gmail.com' LIMIT 1)
WHERE brand_name = 'Siddhim Global School';

-- Verify the update
SELECT 
    b.id,
    b.brand_name,
    b.user_id,
    u.email
FROM brands b
LEFT JOIN auth.users u ON b.user_id = u.id
WHERE b.brand_name = 'Siddhim Global School';
