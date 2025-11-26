-- Add Creator Selection Tracking and Payment System
-- This enables budget-based creator selection limits and payment workflow

-- 1. Add pricing and selection tracking to campaigns table
ALTER TABLE campaigns 
ADD COLUMN IF NOT EXISTS estimated_cost_per_creator INTEGER,
ADD COLUMN IF NOT EXISTS max_affordable_creators INTEGER,
ADD COLUMN IF NOT EXISTS actual_creators_selected INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS creators_approved_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS payment_initiated BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS payment_initiated_at TIMESTAMP WITH TIME ZONE;

-- Add comments for documentation
COMMENT ON COLUMN campaigns.estimated_cost_per_creator IS 'Estimated cost per creator based on tier (Nano: 3900, Macro: 7400, Mega: 14200)';
COMMENT ON COLUMN campaigns.max_affordable_creators IS 'Maximum number of creators that can be afforded within budget';
COMMENT ON COLUMN campaigns.actual_creators_selected IS 'Number of creators actually selected/approved by brand';
COMMENT ON COLUMN campaigns.creators_approved_count IS 'Count of creators with approved status';
COMMENT ON COLUMN campaigns.payment_initiated IS 'Whether payment process has been initiated';
COMMENT ON COLUMN campaigns.payment_initiated_at IS 'Timestamp when payment was initiated';

-- 2. Add selection_status to campaign_creators table
ALTER TABLE campaign_creators
ADD COLUMN IF NOT EXISTS selection_status TEXT DEFAULT 'pending' 
  CHECK (selection_status IN ('pending', 'selected', 'approved', 'rejected', 'paid'));

-- Update existing 'approved' status to 'selected' to track the flow better
COMMENT ON COLUMN campaign_creators.selection_status IS 'Selection status: pending (recommended), selected (brand approved), approved (admin confirmed), rejected, paid (payment completed)';

-- 3. Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_campaign_creators_selection_status ON campaign_creators(selection_status);
CREATE INDEX IF NOT EXISTS idx_campaign_creators_campaign_selection ON campaign_creators(campaign_id, selection_status);
CREATE INDEX IF NOT EXISTS idx_campaigns_payment_initiated ON campaigns(payment_initiated);

-- 4. Create function to count selected creators
CREATE OR REPLACE FUNCTION count_selected_creators(p_campaign_id UUID)
RETURNS INTEGER AS $$
DECLARE
  selected_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO selected_count
  FROM campaign_creators
  WHERE campaign_id = p_campaign_id 
    AND status = 'approved'
    AND (selection_status IN ('selected', 'approved', 'paid') OR selection_status IS NULL);
  
  RETURN COALESCE(selected_count, 0);
END;
$$ LANGUAGE plpgsql;

-- 5. Create function to validate creator selection within budget
CREATE OR REPLACE FUNCTION validate_creator_selection(
  p_campaign_id UUID,
  p_creator_id BIGINT
)
RETURNS TABLE (
  is_valid BOOLEAN,
  current_selected INTEGER,
  max_allowed INTEGER,
  message TEXT
) AS $$
DECLARE
  v_current_selected INTEGER;
  v_max_allowed INTEGER;
  v_already_selected BOOLEAN;
BEGIN
  -- Get current selection count and max allowed
  SELECT 
    COALESCE(c.actual_creators_selected, count_selected_creators(c.id)),
    COALESCE(c.max_affordable_creators, c.target_creators_count, 15)
  INTO v_current_selected, v_max_allowed
  FROM campaigns c
  WHERE c.id = p_campaign_id;

  -- Check if creator is already selected
  SELECT EXISTS(
    SELECT 1 
    FROM campaign_creators 
    WHERE campaign_id = p_campaign_id 
      AND creator_id = p_creator_id 
      AND status = 'approved'
  ) INTO v_already_selected;

  -- Return validation result
  IF v_already_selected THEN
    RETURN QUERY SELECT 
      FALSE,
      v_current_selected,
      v_max_allowed,
      'Creator already selected'::TEXT;
  ELSIF v_current_selected >= v_max_allowed THEN
    RETURN QUERY SELECT 
      FALSE,
      v_current_selected,
      v_max_allowed,
      'Selection limit reached. Maximum ' || v_max_allowed || ' creators allowed.'::TEXT;
  ELSE
    RETURN QUERY SELECT 
      TRUE,
      v_current_selected,
      v_max_allowed,
      'Selection valid'::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 6. Create function to update selection count
CREATE OR REPLACE FUNCTION update_selection_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Update actual_creators_selected count when status changes to 'approved'
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    UPDATE campaigns
    SET 
      actual_creators_selected = count_selected_creators(NEW.campaign_id),
      creators_approved_count = count_selected_creators(NEW.campaign_id),
      updated_at = NOW()
    WHERE id = NEW.campaign_id;
  END IF;

  -- Update count when status changes from 'approved' to something else
  IF OLD.status = 'approved' AND NEW.status != 'approved' THEN
    UPDATE campaigns
    SET 
      actual_creators_selected = count_selected_creators(NEW.campaign_id),
      creators_approved_count = count_selected_creators(NEW.campaign_id),
      updated_at = NOW()
    WHERE id = NEW.campaign_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Create trigger to automatically update selection count
DROP TRIGGER IF EXISTS trigger_update_selection_count ON campaign_creators;
CREATE TRIGGER trigger_update_selection_count
  AFTER INSERT OR UPDATE OF status ON campaign_creators
  FOR EACH ROW
  EXECUTE FUNCTION update_selection_count();

-- 8. Create function to prepare campaign for payment
CREATE OR REPLACE FUNCTION prepare_campaign_payment(
  p_campaign_id UUID,
  p_total_cost INTEGER
)
RETURNS TABLE (
  success BOOLEAN,
  selected_count INTEGER,
  estimated_cost INTEGER,
  message TEXT
) AS $$
DECLARE
  v_selected_count INTEGER;
  v_estimated_cost INTEGER;
  v_max_allowed INTEGER;
BEGIN
  -- Get campaign details
  SELECT 
    count_selected_creators(id),
    COALESCE(estimated_cost_per_creator, 0),
    COALESCE(max_affordable_creators, target_creators_count, 15)
  INTO v_selected_count, v_estimated_cost, v_max_allowed
  FROM campaigns
  WHERE id = p_campaign_id;

  -- Validate selection
  IF v_selected_count = 0 THEN
    RETURN QUERY SELECT 
      FALSE,
      v_selected_count,
      0,
      'No creators selected for payment'::TEXT;
    RETURN;
  END IF;

  IF v_selected_count > v_max_allowed THEN
    RETURN QUERY SELECT 
      FALSE,
      v_selected_count,
      0,
      'Selection exceeds budget limit'::TEXT;
    RETURN;
  END IF;

  -- Update campaign status for payment
  UPDATE campaigns
  SET 
    payment_initiated = TRUE,
    payment_initiated_at = NOW(),
    phase = 'payment',
    updated_at = NOW()
  WHERE id = p_campaign_id;

  -- Update creator selection status
  UPDATE campaign_creators
  SET 
    selection_status = 'selected',
    updated_at = NOW()
  WHERE campaign_id = p_campaign_id 
    AND status = 'approved'
    AND (selection_status IS NULL OR selection_status = 'pending');

  -- Calculate total cost
  v_estimated_cost := v_selected_count * COALESCE(v_estimated_cost, 0);

  RETURN QUERY SELECT 
    TRUE,
    v_selected_count,
    v_estimated_cost,
    'Campaign prepared for payment'::TEXT;
END;
$$ LANGUAGE plpgsql;

-- 9. Create view for campaign payment summary
CREATE OR REPLACE VIEW campaign_payment_summary AS
SELECT 
  c.id as campaign_id,
  c.campaign_name,
  c.brand_id,
  c.budget,
  c.estimated_cost_per_creator,
  c.max_affordable_creators,
  c.actual_creators_selected,
  c.creators_approved_count,
  c.payment_initiated,
  c.payment_initiated_at,
  c.payment_status,
  (c.actual_creators_selected * COALESCE(c.estimated_cost_per_creator, 0)) as estimated_total_cost,
  (c.budget - (c.actual_creators_selected * COALESCE(c.estimated_cost_per_creator, 0))) as remaining_budget,
  CASE 
    WHEN c.max_affordable_creators > 0 THEN 
      ROUND((c.actual_creators_selected::NUMERIC / c.max_affordable_creators::NUMERIC) * 100, 2)
    ELSE 0
  END as selection_percentage,
  COUNT(cc.id) FILTER (WHERE cc.status = 'approved') as approved_creators,
  COUNT(cc.id) FILTER (WHERE cc.selection_status = 'selected') as selected_for_payment,
  COUNT(cc.id) FILTER (WHERE cc.selection_status = 'paid') as paid_creators
FROM campaigns c
LEFT JOIN campaign_creators cc ON c.id = cc.campaign_id
GROUP BY 
  c.id, c.campaign_name, c.brand_id, c.budget, 
  c.estimated_cost_per_creator, c.max_affordable_creators,
  c.actual_creators_selected, c.creators_approved_count,
  c.payment_initiated, c.payment_initiated_at, c.payment_status;

-- 10. Test queries (commented out)
-- SELECT * FROM validate_creator_selection('your-campaign-id', 12345);
-- SELECT * FROM prepare_campaign_payment('your-campaign-id', 50000);
-- SELECT * FROM campaign_payment_summary WHERE campaign_id = 'your-campaign-id';

-- Success message
SELECT '✅ Creator Selection Tracking and Payment System Schema Created Successfully!' as status;
SELECT '   - Added pricing columns to campaigns table' as info;
SELECT '   - Added selection_status to campaign_creators table' as info;
SELECT '   - Created validation functions for budget limits' as info;
SELECT '   - Created payment preparation workflow' as info;
SELECT '   - Created automated selection count triggers' as info;
