-- Fix recommend_creators function to match actual creators table ID type
-- The creators table uses INTEGER/BIGINT for ID, not UUID

DROP FUNCTION IF EXISTS recommend_creators(TEXT, TEXT, TEXT, INTEGER, NUMERIC);

CREATE OR REPLACE FUNCTION recommend_creators(
  p_category TEXT,
  p_subcategory TEXT DEFAULT NULL,
  p_creator_type TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 15,
  p_min_engagement NUMERIC DEFAULT 0.5
)
RETURNS TABLE (
  id BIGINT,  -- Changed from UUID to BIGINT to match creators table
  name TEXT,
  ig_handle TEXT,
  ig_followers INTEGER,
  category TEXT,
  subcategory TEXT,
  engagement_rate DOUBLE PRECISION,  -- Changed from NUMERIC to DOUBLE PRECISION
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

-- Test the function
SELECT * FROM recommend_creators('Entertainment', 'Feel-Good News / Stories', 'macro', 10);

SELECT '✅ recommend_creators function fixed!' as status;
