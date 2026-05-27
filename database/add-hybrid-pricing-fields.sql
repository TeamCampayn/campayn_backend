-- Migration: Add Hybrid Pricing Fields
-- Adds min_guarantee_per_creator and max_payout_per_creator to support hybrid performance-based CPV pricing model.

-- 1. Alter campaigns table
ALTER TABLE campaigns 
ADD COLUMN IF NOT EXISTS min_guarantee_per_creator INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_payout_per_creator INTEGER DEFAULT 0;

COMMENT ON COLUMN campaigns.min_guarantee_per_creator IS 'Minimum guaranteed payout to creator regardless of views';
COMMENT ON COLUMN campaigns.max_payout_per_creator IS 'Maximum payout cap to creator to prevent brand budget overrun';

-- 2. Alter legacy_campaigns table (to support dual-sync inserts/queries)
ALTER TABLE legacy_campaigns 
ADD COLUMN IF NOT EXISTS min_guarantee_per_creator INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_payout_per_creator INTEGER DEFAULT 0;

COMMENT ON COLUMN legacy_campaigns.min_guarantee_per_creator IS 'Minimum guaranteed payout to creator regardless of views';
COMMENT ON COLUMN legacy_campaigns.max_payout_per_creator IS 'Maximum payout cap to creator to prevent brand budget overrun';

SELECT '✅ Hybrid pricing database columns added successfully!' as status;
