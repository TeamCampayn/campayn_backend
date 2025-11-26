-- Update Existing Campaigns with Pricing Data
-- This script adds pricing information to campaigns that were created before the pricing system

-- Step 1: Update campaigns with creator_type = 'micro' (Nano creators)
UPDATE campaigns
SET 
  estimated_cost_per_creator = 3900,
  max_affordable_creators = FLOOR(budget / 3900),
  actual_creators_selected = COALESCE(actual_creators_selected, 0)
WHERE creator_type = 'micro'
  AND (estimated_cost_per_creator IS NULL OR estimated_cost_per_creator = 0);

-- Step 2: Update campaigns with creator_type = 'macro' (Micro creators)
UPDATE campaigns
SET 
  estimated_cost_per_creator = 7400,
  max_affordable_creators = FLOOR(budget / 7400),
  actual_creators_selected = COALESCE(actual_creators_selected, 0)
WHERE creator_type = 'macro'
  AND (estimated_cost_per_creator IS NULL OR estimated_cost_per_creator = 0);

-- Step 3: Update campaigns with creator_type = 'mega' (Macro creators)
UPDATE campaigns
SET 
  estimated_cost_per_creator = 14200,
  max_affordable_creators = FLOOR(budget / 14200),
  actual_creators_selected = COALESCE(actual_creators_selected, 0)
WHERE creator_type = 'mega'
  AND (estimated_cost_per_creator IS NULL OR estimated_cost_per_creator = 0);

-- Step 4: For campaigns without creator_type, use a default (micro tier)
UPDATE campaigns
SET 
  creator_type = 'micro',
  estimated_cost_per_creator = 3900,
  max_affordable_creators = FLOOR(budget / 3900),
  actual_creators_selected = COALESCE(actual_creators_selected, 0)
WHERE (creator_type IS NULL OR creator_type = '')
  AND (estimated_cost_per_creator IS NULL OR estimated_cost_per_creator = 0);

-- Step 5: Update actual_creators_selected count based on approved creators
UPDATE campaigns c
SET actual_creators_selected = (
  SELECT COUNT(*)
  FROM campaign_creators cc
  WHERE cc.campaign_id = c.id
    AND cc.status = 'approved'
)
WHERE phase = 'creator_selection';

-- Step 6: Verify the updates
SELECT 
  id,
  campaign_name,
  budget,
  creator_type,
  estimated_cost_per_creator,
  max_affordable_creators,
  actual_creators_selected,
  target_creators_count,
  phase
FROM campaigns
WHERE phase = 'creator_selection'
ORDER BY created_at DESC
LIMIT 10;

-- Success message
SELECT '✅ Existing campaigns updated with pricing data!' as status;
SELECT '   Updated campaigns with proper creator tier pricing' as info;
SELECT '   Calculated max_affordable_creators based on budget' as info;
SELECT '   Updated actual_creators_selected count' as info;
