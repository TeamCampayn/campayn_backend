-- Multi-Phase Campaign System Database Schema - ROBUST VERSION
-- This version handles existing tables and missing columns gracefully

-- First, let's ensure all required columns exist in campaigns table
DO $$
BEGIN
    -- Add description column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'campaigns' AND column_name = 'description') THEN
        ALTER TABLE campaigns ADD COLUMN description TEXT;
    END IF;
    
    -- Add other potentially missing columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'campaigns' AND column_name = 'campaign_objectives') THEN
        ALTER TABLE campaigns ADD COLUMN campaign_objectives TEXT[];
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'campaigns' AND column_name = 'requirements') THEN
        ALTER TABLE campaigns ADD COLUMN requirements TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'campaigns' AND column_name = 'deliverables') THEN
        ALTER TABLE campaigns ADD COLUMN deliverables JSONB DEFAULT '{}';
    END IF;
END $$;

-- Create the fixed campaign overview view
CREATE OR REPLACE VIEW campaign_overview AS
SELECT 
  c.*,
  b.brand_name,
  b.brand_website,
  b.industry,
  COUNT(cc.id) as total_creators,
  COUNT(cc.id) FILTER (WHERE cc.status = 'approved') as approved_creators,
  COUNT(cc.id) FILTER (WHERE cc.status = 'pending') as pending_creators,
  COUNT(cc.id) FILTER (WHERE cc.status = 'rejected') as rejected_creators,
  COUNT(cnt.id) as total_contents,
  COUNT(cnt.id) FILTER (WHERE cnt.approval_status = 'approved') as approved_contents,
  COUNT(cnt.id) FILTER (WHERE cnt.approval_status = 'pending') as pending_contents,
  SUM(cp.amount) FILTER (WHERE cp.payment_status = 'completed' AND cp.payment_type = 'campaign_fee') as total_paid
FROM campaigns c
LEFT JOIN brands b ON c.brand_id = b.id
LEFT JOIN campaign_creators cc ON c.id = cc.campaign_id
LEFT JOIN campaign_contents cnt ON c.id = cnt.campaign_id
LEFT JOIN campaign_payments cp ON c.id = cp.campaign_id
GROUP BY c.id, b.brand_name, b.brand_website, b.industry;

-- Insert sample campaigns safely
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM brands LIMIT 1) THEN
    -- Check if campaigns already exist to avoid duplicates
    IF NOT EXISTS (SELECT 1 FROM campaigns WHERE campaign_name LIKE 'Sample Campaign%') THEN
      INSERT INTO campaigns (campaign_name, brand_id, description, budget, phase) 
      SELECT 
        'Sample Campaign ' || generate_series(1,3),
        b.id,
        'Test campaign for multi-phase system',
        50000.00,
        (ARRAY['creator_selection', 'payment_pending', 'content_approval'])[ceil(random()*3)]
      FROM brands b 
      LIMIT 3;
    END IF;
  END IF;
END $$;

-- Success message
SELECT '✅ Multi-Phase Campaign System Fixed Successfully!' as status,
       'All tables and views updated with proper column references' as note;