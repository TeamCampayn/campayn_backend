-- Final database enhancements for creator ranking and validation
-- Run this in Supabase SQL Editor

-- 1. Add missing columns for enhanced creator management
ALTER TABLE creators 
ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'unknown' CHECK (account_status IN ('active', 'inactive', 'not_found', 'private', 'unknown')),
ADD COLUMN IF NOT EXISTS last_checked TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS verification_status BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS priority_score DECIMAL(5,2) DEFAULT 0.0,
ADD COLUMN IF NOT EXISTS last_post_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS avg_comments DOUBLE PRECISION;

-- 2. Create performance indexes
CREATE INDEX IF NOT EXISTS idx_creators_account_status ON creators(account_status);
CREATE INDEX IF NOT EXISTS idx_creators_engagement_rate ON creators(engagement_rate DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_creators_priority_score ON creators(priority_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_creators_followers_count ON creators(followers_count DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_creators_last_checked ON creators(last_checked DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_creators_category ON creators(category);
CREATE INDEX IF NOT EXISTS idx_creators_subcategory ON creators(subcategory);
CREATE INDEX IF NOT EXISTS idx_creators_ig_handle ON creators(ig_handle);

-- 3. Create view for high-quality active creators
CREATE OR REPLACE VIEW top_creators AS
SELECT 
  *,
  CASE 
    WHEN engagement_rate >= 5 THEN 'Excellent'
    WHEN engagement_rate >= 3 THEN 'Good'
    WHEN engagement_rate >= 1 THEN 'Average'
    ELSE 'Low'
  END as engagement_tier,
  CASE 
    WHEN followers_count >= 1000000 THEN 'Mega'
    WHEN followers_count >= 100000 THEN 'Macro'
    WHEN followers_count >= 10000 THEN 'Micro'
    WHEN followers_count >= 1000 THEN 'Nano'
    ELSE 'Small'
  END as influencer_tier
FROM creators 
WHERE account_status = 'active' 
  AND engagement_rate IS NOT NULL 
  AND engagement_rate > 1.0
  AND followers_count > 1000
ORDER BY priority_score DESC, engagement_rate DESC;

-- 4. Create view for validation dashboard
CREATE OR REPLACE VIEW validation_stats AS
SELECT 
  COUNT(*) as total_creators,
  COUNT(*) FILTER (WHERE last_checked IS NOT NULL) as validated,
  COUNT(*) FILTER (WHERE last_checked IS NULL) as pending,
  COUNT(*) FILTER (WHERE account_status = 'active') as active,
  COUNT(*) FILTER (WHERE account_status = 'inactive') as inactive,
  COUNT(*) FILTER (WHERE account_status = 'not_found') as not_found,
  COUNT(*) FILTER (WHERE account_status = 'private') as private,
  COUNT(*) FILTER (WHERE account_status = 'unknown' OR account_status IS NULL) as unknown,
  ROUND(AVG(engagement_rate) FILTER (WHERE engagement_rate IS NOT NULL), 2) as avg_engagement,
  ROUND(AVG(followers_count) FILTER (WHERE followers_count IS NOT NULL), 0) as avg_followers
FROM creators 
WHERE ig_handle IS NOT NULL;

-- 5. Update existing creators with initial priority scores based on followers
UPDATE creators 
SET priority_score = CASE 
  WHEN followers_count >= 1000000 THEN 30.0
  WHEN followers_count >= 500000 THEN 25.0
  WHEN followers_count >= 100000 THEN 20.0
  WHEN followers_count >= 50000 THEN 15.0
  WHEN followers_count >= 10000 THEN 10.0
  WHEN followers_count >= 1000 THEN 5.0
  ELSE 1.0
END
WHERE priority_score = 0.0 AND followers_count IS NOT NULL;

-- 6. Show current database stats
SELECT 
  'Database Statistics' as report_section,
  total_creators,
  validated,
  pending,
  active,
  inactive,
  not_found,
  private,
  unknown,
  avg_engagement,
  avg_followers
FROM validation_stats;

-- 7. Show top categories
SELECT 
  'Top Categories' as report_section,
  category,
  COUNT(*) as creator_count,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM creators WHERE ig_handle IS NOT NULL), 1) as percentage
FROM creators 
WHERE category IS NOT NULL AND ig_handle IS NOT NULL
GROUP BY category
ORDER BY creator_count DESC
LIMIT 10;

-- 8. Show sample of high-quality creators
SELECT 
  'Sample High-Quality Creators' as report_section,
  name,
  ig_handle,
  category,
  followers_count,
  engagement_rate,
  priority_score,
  account_status
FROM creators 
WHERE account_status = 'active' 
  AND followers_count > 100000
ORDER BY priority_score DESC, engagement_rate DESC
LIMIT 10;

-- Success message
SELECT '✅ Database enhancement completed successfully!' as status;