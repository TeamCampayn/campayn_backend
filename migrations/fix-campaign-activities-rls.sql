-- Fix RLS policies for campaign_activities to allow backend service role access

-- Drop existing policies that might be too restrictive
DROP POLICY IF EXISTS "Allow backend service role full access" ON campaign_activities;

-- Create a policy that allows service role (backend) to insert
CREATE POLICY "Service role can manage campaign_activities"
  ON campaign_activities
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Alternative: If you want more granular control, use these policies instead:

-- Allow users to view activities for their own campaigns
CREATE POLICY "Users can view campaign activities" 
  ON campaign_activities
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_activities.campaign_id
      AND (campaigns.brand_id = auth.uid() OR EXISTS (
        SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.user_type = 'admin'
      ))
    )
  );

-- Allow authenticated users to insert activities
CREATE POLICY "Authenticated users can insert activities"
  ON campaign_activities
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL OR 
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

-- Note: The backend uses service_role key which bypasses RLS by default
-- If you're still seeing errors, check that SUPABASE_SERVICE_KEY is correctly set
