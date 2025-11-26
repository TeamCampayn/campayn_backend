-- Add Creator Recommendation System to Campaigns
-- This enables automated creator matching based on category, subcategory, and follower count

-- 1. Add target fields to campaigns table
ALTER TABLE campaigns 
ADD COLUMN IF NOT EXISTS target_category TEXT,
ADD COLUMN IF NOT EXISTS target_subcategory TEXT,
ADD COLUMN IF NOT EXISTS creator_type TEXT CHECK (creator_type IN ('micro', 'macro', 'mega'));

-- Add comments for documentation
COMMENT ON COLUMN campaigns.target_category IS 'Target creator category (e.g., Arts, Fashion, Tech)';
COMMENT ON COLUMN campaigns.target_subcategory IS 'Target subcategory within the main category';
COMMENT ON COLUMN campaigns.creator_type IS 'Target creator tier: micro (1K-10K), macro (10K-100K), mega (100K-2M)';

-- 2. Add external_id to creators table for CSV import tracking
ALTER TABLE creators
ADD COLUMN IF NOT EXISTS external_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS bio TEXT,
ADD COLUMN IF NOT EXISTS location TEXT,
ADD COLUMN IF NOT EXISTS languages TEXT[],
ADD COLUMN IF NOT EXISTS content_style TEXT,
ADD COLUMN IF NOT EXISTS avg_likes INTEGER,
ADD COLUMN IF NOT EXISTS avg_comments INTEGER,
ADD COLUMN IF NOT EXISTS avg_views INTEGER,
ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT FALSE;

-- 3. Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_creators_category ON creators(category);
CREATE INDEX IF NOT EXISTS idx_creators_subcategory ON creators(subcategory);
CREATE INDEX IF NOT EXISTS idx_creators_ig_followers ON creators(ig_followers);
CREATE INDEX IF NOT EXISTS idx_creators_composite ON creators(category, subcategory, ig_followers);
CREATE INDEX IF NOT EXISTS idx_creators_external_id ON creators(external_id);

-- 4. Create a function to classify creator type based on follower count
CREATE OR REPLACE FUNCTION get_creator_type(follower_count INTEGER)
RETURNS TEXT AS $$
BEGIN
  CASE 
    WHEN follower_count >= 1000 AND follower_count < 10000 THEN RETURN 'micro';
    WHEN follower_count >= 10000 AND follower_count < 100000 THEN RETURN 'macro';
    WHEN follower_count >= 100000 AND follower_count <= 2000000 THEN RETURN 'mega';
    ELSE RETURN 'other';
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 5. Create view for creators with their calculated type
CREATE OR REPLACE VIEW creators_classified AS
SELECT 
  *,
  get_creator_type(ig_followers) as calculated_type
FROM creators
WHERE ig_followers >= 1000 AND ig_followers <= 2000000;

-- 6. Create automated creator recommendation function
CREATE OR REPLACE FUNCTION recommend_creators(
  p_category TEXT,
  p_subcategory TEXT DEFAULT NULL,
  p_creator_type TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 15,
  p_min_engagement NUMERIC DEFAULT 0.5
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  ig_handle TEXT,
  ig_followers INTEGER,
  category TEXT,
  subcategory TEXT,
  engagement_rate NUMERIC,
  match_score INTEGER,
  creator_tier TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH follower_ranges AS (
    SELECT 
      c.*,
      get_creator_type(c.ig_followers) as calculated_type
    FROM creators c
    WHERE 
      c.ig_followers >= 1000 
      AND c.ig_followers <= 2000000
      AND c.category IS NOT NULL
  ),
  scored_creators AS (
    SELECT 
      fr.id,
      fr.name,
      fr.ig_handle,
      fr.ig_followers,
      fr.category,
      fr.subcategory,
      COALESCE(fr.engagement_rate, 1.5) as engagement_rate,
      fr.calculated_type,
      -- Calculate match score (0-100)
      (
        -- Category match (40 points)
        CASE WHEN fr.category = p_category THEN 40 ELSE 0 END +
        
        -- Subcategory match (30 points)
        CASE 
          WHEN p_subcategory IS NULL THEN 15  -- No preference = partial points
          WHEN fr.subcategory = p_subcategory THEN 30 
          ELSE 0 
        END +
        
        -- Creator type match (20 points)
        CASE 
          WHEN p_creator_type IS NULL THEN 10  -- No preference = partial points
          WHEN fr.calculated_type = p_creator_type THEN 20
          ELSE 0
        END +
        
        -- Engagement rate bonus (10 points)
        CASE 
          WHEN COALESCE(fr.engagement_rate, 0) >= 5 THEN 10
          WHEN COALESCE(fr.engagement_rate, 0) >= 3 THEN 7
          WHEN COALESCE(fr.engagement_rate, 0) >= 1 THEN 5
          ELSE 2
        END
      )::INTEGER as match_score
    FROM follower_ranges fr
    WHERE 
      fr.category = p_category
      AND (p_subcategory IS NULL OR fr.subcategory = p_subcategory OR fr.subcategory IS NULL)
      AND (p_creator_type IS NULL OR fr.calculated_type = p_creator_type)
      AND COALESCE(fr.engagement_rate, 1.5) >= p_min_engagement
  )
  SELECT 
    sc.id,
    sc.name,
    sc.ig_handle,
    sc.ig_followers,
    sc.category,
    sc.subcategory,
    sc.engagement_rate,
    sc.match_score,
    sc.calculated_type as creator_tier
  FROM scored_creators sc
  WHERE sc.match_score >= 40  -- At least category match required
  ORDER BY 
    sc.match_score DESC, 
    sc.engagement_rate DESC NULLS LAST, 
    sc.ig_followers DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- 7. Create a view to see available categories and subcategories
CREATE OR REPLACE VIEW creator_categories_summary AS
SELECT 
  category,
  COUNT(*) as creator_count,
  array_agg(DISTINCT subcategory ORDER BY subcategory) FILTER (WHERE subcategory IS NOT NULL) as subcategories,
  MIN(ig_followers) as min_followers,
  MAX(ig_followers) as max_followers,
  AVG(ig_followers)::INTEGER as avg_followers,
  COUNT(*) FILTER (WHERE ig_followers >= 1000 AND ig_followers < 10000) as micro_count,
  COUNT(*) FILTER (WHERE ig_followers >= 10000 AND ig_followers < 100000) as macro_count,
  COUNT(*) FILTER (WHERE ig_followers >= 100000 AND ig_followers <= 2000000) as mega_count
FROM creators
WHERE category IS NOT NULL AND ig_followers > 0
GROUP BY category
ORDER BY creator_count DESC;

-- 8. Test the recommendation function
-- SELECT * FROM recommend_creators('Arts', 'Acting, Pro (TV / Series)', 'mega', 10);

-- Success message
SELECT '✅ Creator Recommendation System Schema Created Successfully!' as status;
