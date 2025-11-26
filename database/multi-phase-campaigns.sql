-- Multi-Phase Campaign System Database Schema

-- 1. Create enhanced campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID REFERENCES brands(id) ON DELETE CASCADE,
  campaign_name TEXT NOT NULL,
  description TEXT,
  phase TEXT DEFAULT 'creator_selection' CHECK (
    phase IN ('creator_selection', 'payment_pending', 'content_approval', 'campaign_active', 'campaign_complete')
  ),
  payment_status TEXT DEFAULT 'pending' CHECK (
    payment_status IN ('pending', 'paid', 'refunded')
  ),
  budget DECIMAL(12,2),
  start_date DATE,
  end_date DATE,
  campaign_objectives TEXT[],
  target_metrics JSONB DEFAULT '{}',
  actual_metrics JSONB DEFAULT '{}',
  requirements TEXT,
  deliverables JSONB DEFAULT '{}',
  admin_notes TEXT,
  brand_notes TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled', 'completed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  payment_confirmed_at TIMESTAMP WITH TIME ZONE,
  campaign_started_at TIMESTAMP WITH TIME ZONE,
  campaign_completed_at TIMESTAMP WITH TIME ZONE
);

-- 2. Create campaign_creators junction table
CREATE TABLE IF NOT EXISTS campaign_creators (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  creator_id BIGINT REFERENCES creators(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (
    status IN ('recommended', 'pending', 'approved', 'rejected', 'requested_more', 'contracted', 'delivered')
  ),
  recommended_by_admin BOOLEAN DEFAULT FALSE,
  brand_response TEXT,
  brand_response_at TIMESTAMP WITH TIME ZONE,
  admin_notes TEXT,
  negotiated_rate DECIMAL(10,2),
  deliverables_count INTEGER DEFAULT 1,
  deliverables_completed INTEGER DEFAULT 0,
  performance_bonus DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(campaign_id, creator_id)
);

-- 3. Create contents table for content approval phase
CREATE TABLE IF NOT EXISTS campaign_contents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  creator_id BIGINT REFERENCES creators(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (
    content_type IN ('reel', 'post', 'story', 'igtv', 'carousel')
  ),
  content_url TEXT,
  thumbnail_url TEXT,
  caption TEXT,
  hashtags TEXT[],
  approval_status TEXT DEFAULT 'pending' CHECK (
    approval_status IN ('pending', 'approved', 'rejected', 'needs_revision')
  ),
  brand_feedback TEXT,
  admin_feedback TEXT,
  revision_count INTEGER DEFAULT 0,
  max_revisions INTEGER DEFAULT 3,
  scheduled_post_time TIMESTAMP WITH TIME ZONE,
  posted_at TIMESTAMP WITH TIME ZONE,
  post_url TEXT,
  performance_metrics JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  approved_at TIMESTAMP WITH TIME ZONE,
  posted_by TEXT -- 'creator' or 'admin'
);

-- 4. Create campaign_payments table for payment tracking
CREATE TABLE IF NOT EXISTS campaign_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  payment_type TEXT NOT NULL CHECK (
    payment_type IN ('campaign_fee', 'creator_payment', 'platform_commission', 'refund')
  ),
  amount DECIMAL(12,2) NOT NULL,
  currency TEXT DEFAULT 'INR',
  payment_method TEXT,
  transaction_id TEXT,
  payment_status TEXT DEFAULT 'pending' CHECK (
    payment_status IN ('pending', 'processing', 'completed', 'failed', 'refunded')
  ),
  paid_to UUID, -- Reference to brand, creator, or admin
  paid_by UUID,
  payment_gateway_response JSONB,
  admin_confirmed BOOLEAN DEFAULT FALSE,
  admin_confirmed_by UUID,
  admin_confirmed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Create campaign_activities table for audit trail
CREATE TABLE IF NOT EXISTS campaign_activities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_type TEXT NOT NULL CHECK (user_type IN ('brand', 'admin', 'creator')),
  activity_type TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Create performance tracking table
CREATE TABLE IF NOT EXISTS campaign_performance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  creator_id BIGINT REFERENCES creators(id),
  content_id UUID REFERENCES campaign_contents(id),
  metric_type TEXT NOT NULL, -- 'reach', 'impressions', 'engagement', 'clicks', etc.
  metric_value DECIMAL(15,2) NOT NULL,
  measurement_date DATE NOT NULL,
  data_source TEXT DEFAULT 'instagram_api',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(campaign_id, creator_id, content_id, metric_type, measurement_date)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_campaigns_brand_id ON campaigns(brand_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_phase ON campaigns(phase);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaign_creators_campaign_id ON campaign_creators(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_creators_status ON campaign_creators(status);
CREATE INDEX IF NOT EXISTS idx_campaign_contents_campaign_id ON campaign_contents(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_contents_approval_status ON campaign_contents(approval_status);
CREATE INDEX IF NOT EXISTS idx_campaign_activities_campaign_id ON campaign_activities(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_performance_campaign_id ON campaign_performance(campaign_id);

-- Create updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_campaigns_updated_at ON campaigns;
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_campaign_creators_updated_at ON campaign_creators;
CREATE TRIGGER update_campaign_creators_updated_at BEFORE UPDATE ON campaign_creators 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_campaign_contents_updated_at ON campaign_contents;
CREATE TRIGGER update_campaign_contents_updated_at BEFORE UPDATE ON campaign_contents 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create views for easier querying (FIXED - using actual brands table columns)
DROP VIEW IF EXISTS campaign_overview;
CREATE VIEW campaign_overview AS
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
  SUM(cp.amount) FILTER (WHERE cp.payment_status = 'completed' AND cp.payment_type = 'campaign_fee') as total_paid,
  perf.total_reach,
  perf.total_impressions,
  perf.total_engagement,
  perf.total_clicks,
  perf.avg_engagement_rate
FROM campaigns c
LEFT JOIN brands b ON c.brand_id = b.id
LEFT JOIN campaign_creators cc ON c.id = cc.campaign_id
LEFT JOIN campaign_contents cnt ON c.id = cnt.campaign_id
LEFT JOIN campaign_payments cp ON c.id = cp.campaign_id
LEFT JOIN (
  SELECT 
    campaign_id,
    SUM(metric_value) FILTER (WHERE metric_type = 'reach') AS total_reach,
    SUM(metric_value) FILTER (WHERE metric_type = 'impressions') AS total_impressions,
    SUM(metric_value) FILTER (WHERE metric_type = 'engagement') AS total_engagement,
    SUM(metric_value) FILTER (WHERE metric_type = 'clicks') AS total_clicks,
    CASE 
      WHEN SUM(metric_value) FILTER (WHERE metric_type = 'impressions') > 0 THEN
        (SUM(metric_value) FILTER (WHERE metric_type = 'engagement') / 
         SUM(metric_value) FILTER (WHERE metric_type = 'impressions')) * 100
      ELSE NULL
    END AS avg_engagement_rate
  FROM campaign_performance
  GROUP BY campaign_id
) perf ON c.id = perf.campaign_id
GROUP BY c.id, b.brand_name, b.brand_website, b.industry,
         perf.total_reach,
         perf.total_impressions,
         perf.total_engagement,
         perf.total_clicks,
         perf.avg_engagement_rate;

-- Insert sample campaign phases for testing (only if brands exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM brands LIMIT 1) THEN
    INSERT INTO campaigns (campaign_name, brand_id, description, budget, phase) 
    SELECT 
      'Sample Campaign ' || generate_series(1,3),
      b.id,
      'Test campaign for multi-phase system',
      50000.00,
      (ARRAY['creator_selection', 'payment_pending', 'content_approval'])[ceil(random()*3)]
    FROM brands b 
    LIMIT 3
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Success message
SELECT '✅ Multi-Phase Campaign Database Schema Created Successfully!' as status;