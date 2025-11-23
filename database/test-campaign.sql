-- Create a test brand and campaign for multi-phase system testing

-- Insert a test brand if it doesn't exist
INSERT INTO brands (id, brand_name, brand_website, industry, brand_description, company_size, monthly_budget, experience_level)
VALUES 
  (gen_random_uuid(), 'Acme Fashion Co.', 'https://acmefashion.com', 'Fashion', 'Trendy fashion brand for young professionals', 'Medium (50-200 employees)', '₹50,000 - ₹1,00,000', 'Intermediate')
ON CONFLICT (brand_name) DO NOTHING;

-- Insert a test campaign
INSERT INTO campaigns (
  id, 
  brand_id, 
  campaign_name, 
  description, 
  budget, 
  phase, 
  status,
  start_date,
  end_date,
  campaign_objectives,
  requirements,
  deliverables
) 
SELECT 
  gen_random_uuid(),
  b.id,
  'Summer Collection Launch 2024',
  'Launch our new summer collection targeting young fashion enthusiasts',
  75000.00,
  'creator_selection',
  'active',
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '30 days',
  ARRAY['Brand Awareness', 'Product Marketing', 'Engagement'],
  'Must feature summer clothing, professional photography required',
  '{"reel": 2, "post": 3, "story": 5}'::jsonb
FROM brands b 
WHERE b.brand_name = 'Acme Fashion Co.'
ON CONFLICT DO NOTHING;

-- Success message
SELECT '✅ Test campaign created successfully!' as status,
       'You can now test the multi-phase campaign system' as note;