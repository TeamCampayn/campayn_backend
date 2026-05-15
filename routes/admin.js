const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Admin: Launch Campaign
router.post('/admin/launch-campaign', async (req, res) => {
  const { campaignId, cpvRate, platformFee } = req.body;

  if (!campaignId) {
    return res.status(400).json({ error: 'Campaign ID is required' });
  }

  try {
    // 1. Update Campaign in Supabase
    const { data: campaign, error: updateError } = await supabase
      .from('campaigns')
      .update({
        status: 'campaign_active',
        phase: 'campaign_active',
        cpv_rate: cpvRate || 2.0,
        platform_fee_percent: platformFee || 20,
        campaign_started_at: new Date().toISOString()
      })
      .eq('id', campaignId)
      .select('*, brands(*)')
      .single();

    if (updateError) throw updateError;

    // 2. Fetch selected creators
    const { data: creators, error: creatorsError } = await supabase
      .from('campaign_creators')
      .select('*, creators(*)')
      .eq('campaign_id', campaignId)
      .eq('selection_status', 'selected');

    if (creatorsError) throw creatorsError;

    // 3. Mock Instagram DM Sending
    // In production, this would use the Facebook Messenger API for Instagram
    console.log(`[ADMIN HQ] Launching Campaign: ${campaign.campaign_name}`);
    for (const entry of creators) {
      console.log(`[IG DM] To: @${entry.creators.ig_handle} | Message: Hey! Your campaign for ${campaign.campaign_name} is LIVE. Check your Campayn Dashboard for details. CPV: ₹${cpvRate}`);
    }

    // 4. Notify Brand and Creators via Socket.IO
    if (req.io) {
      req.io.to(`brand_${campaign.brand_id}`).emit('campaign_launched', {
        campaignId,
        message: `Your campaign "${campaign.campaign_name}" has been launched by Admin!`
      });

      // Notify individual creators (if we have their room/id)
      creators.forEach(entry => {
        req.io.emit('creator_notification', {
          creatorId: entry.creator_id,
          message: `New Campaign LIVE: ${campaign.campaign_name}`,
          campaignId
        });
      });
    }

    res.json({ 
      success: true, 
      message: 'Campaign launched successfully!',
      campaign 
    });

  } catch (error) {
    console.error('Error launching campaign:', error);
    res.status(500).json({ error: 'Failed to launch campaign' });
  }
});

module.exports = router;
