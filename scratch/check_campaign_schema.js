const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function checkCampaignSchema() {
  // Check campaigns table
  const { data: campaignSample, error: campaignError } = await supabase
    .from('campaigns')
    .select('*')
    .limit(1);

  console.log('Campaigns Table Structure:', campaignSample ? Object.keys(campaignSample[0]) : 'No records');

  // Check campaign_creators table
  const { data: inviteSample, error: inviteError } = await supabase
    .from('campaign_creators')
    .select('*')
    .limit(1);

  console.log('Campaign Creators Table Structure:', inviteSample ? Object.keys(inviteSample[0]) : 'No records');
}

checkCampaignSchema();
