const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Helper to guarantee a legacy campaign exists and is in sync
async function ensureLegacyCampaignExists(campaign, cpvPaise, status = 'active') {
  try {
    const { data: existingLegacy } = await supabase
      .from('legacy_campaigns')
      .select('id')
      .eq('id', campaign.id)
      .maybeSingle();

    if (!existingLegacy) {
      const { data: brand } = await supabase
        .from('brands')
        .select('brand_name, user_id')
        .eq('id', campaign.brand_id)
        .maybeSingle();

      const brandName = brand?.brand_name || 'Brand';
      const parsedDeliverables = campaign.deliverables?.content_type 
        ? [campaign.deliverables.content_type] 
        : ['30 seconds Reel'];
      
      const dos = [];
      const donts = [];
      if (campaign.requirements) {
        dos.push(campaign.requirements);
      }

      const { error: insertError } = await supabase
        .from('legacy_campaigns')
        .insert({
          id: campaign.id,
          brand_name: brandName,
          title: campaign.campaign_name,
          tagline: `Promote ${campaign.deliverables?.product_name || 'Product'}`,
          brief: campaign.description || campaign.campaign_description || '',
          deliverables: parsedDeliverables,
          do_dont: { do: dos, dont: donts },
          platform: 'instagram',
          target_niches: campaign.target_category ? [campaign.target_category] : [],
          target_tiers: campaign.creator_type === 'micro' ? ['nano'] : campaign.creator_type === 'macro' ? ['micro'] : ['mid', 'macro'],
          cpv_paise: cpvPaise,
          budget_inr: campaign.budget || 0,
          min_guarantee_per_creator: campaign.min_guarantee_per_creator || 0,
          max_payout_per_creator: campaign.max_payout_per_creator || 0,
          slots_total: campaign.target_creators_count || 1,
          slots_filled: 0,
          requires_script: true,
          deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          status: status,
          created_by: campaign.created_by || brand?.user_id || 'brand',
          payout_window_days: 7,
          key_messages: [],
          hashtags: []
        });

      if (insertError) {
        console.error('[ADMIN sync] Failed to insert missing legacy campaign:', insertError);
      }
    } else {
      const { error: updateError } = await supabase
        .from('legacy_campaigns')
        .update({
          status: status,
          cpv_paise: cpvPaise
        })
        .eq('id', campaign.id);

      if (updateError) {
        console.error('[ADMIN sync] Failed to update existing legacy campaign:', updateError);
      }
    }
  } catch (err) {
    console.error('[ADMIN sync] Error in ensureLegacyCampaignExists:', err);
  }
}

// Admin: Approve Campaign (Initial Review)
router.post('/admin/approve-campaign', async (req, res) => {
  const { campaignId, adminId, notes, cpvRate } = req.body;

  if (!campaignId) {
    return res.status(400).json({ error: 'Campaign ID is required' });
  }

  try {
    const assignedCpv = parseFloat(cpvRate) || 2.0;

    // 1. Update main campaigns table
    const { data: campaign, error: updateError } = await supabase
      .from('campaigns')
      .update({
        phase: 'approved_pending_funds',
        status: 'active',
        cpv_rate: assignedCpv,
        admin_notes: notes || `Campaign details approved. CPV assigned: ₹${assignedCpv.toFixed(2)}. Waiting for funds.`
      })
      .eq('id', campaignId)
      .select()
      .single();

    if (updateError) throw updateError;

    // 2. Dual-sync to legacy_campaigns to publish to creators
    const cpvPaise = Math.round(assignedCpv * 100);
    await ensureLegacyCampaignExists(campaign, cpvPaise, 'active');

    // Log activity
    await supabase.from('campaign_activities').insert({
      campaign_id: campaignId,
      user_id: adminId || 'admin',
      user_type: 'admin',
      activity_type: 'campaign_approved',
      description: `Campaign approved by admin. CPV set to ₹${assignedCpv.toFixed(2)}`,
      metadata: { notes, cpvRate: assignedCpv }
    });

    // Notify Brand
    if (req.io) {
      req.io.to(`brand_${campaign.brand_id}`).emit('campaign_approved', {
        campaignId,
        message: `Your campaign "${campaign.campaign_name}" has been approved! Please fund your wallet to proceed.`
      });
    }

    res.json({ success: true, campaign });
  } catch (error) {
    console.error('Error approving campaign:', error);
    res.status(500).json({ error: 'Failed to approve campaign', details: error.message });
  }
});

// Admin: Launch Campaign
router.post('/admin/launch-campaign', async (req, res) => {
  const { campaignId, cpvRate, platformFee } = req.body;

  if (!campaignId) {
    return res.status(400).json({ error: 'Campaign ID is required' });
  }

  try {
    const assignedCpv = parseFloat(cpvRate) || 2.0;

    // 1. Update Campaign in Supabase
    const { data: campaign, error: updateError } = await supabase
      .from('campaigns')
      .update({
        status: 'active',
        phase: 'campaign_active',
        cpv_rate: assignedCpv,
        platform_fee_percent: platformFee || 20,
        campaign_started_at: new Date().toISOString()
      })
      .eq('id', campaignId)
      .select('*, brands(*)')
      .single();

    if (updateError) throw updateError;
    // 2. Dual-sync to legacy_campaigns
    const cpvPaise = Math.round(assignedCpv * 100);
    await ensureLegacyCampaignExists(campaign, cpvPaise, 'active');

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

// Admin: Send Creator Invitations (Manual or Auto)
router.post('/admin/send-invitations', async (req, res) => {
  const { campaignId, creatorIds, adminId } = req.body;

  if (!campaignId || !creatorIds || creatorIds.length === 0) {
    return res.status(400).json({ error: 'Campaign ID and Creator IDs are required' });
  }

  try {
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('campaign_name, budget, description')
      .eq('id', campaignId)
      .single();

    const inviteResults = [];

    for (const creatorId of creatorIds) {
      // 1. Generate unique token
      const inviteToken = crypto.randomBytes(16).toString('hex');
      
      // 2. Prepare teaser data (less details)
      const teaserData = {
        campaign_name: campaign.campaign_name,
        brand_id: campaign.brand_id,
        category: campaign.creator_category,
        estimated_payout: 'TBD', // Logic for payout calculation
      };

      // 3. Store invite
      const { data: invite, error: inviteError } = await supabase
        .from('creator_invites')
        .insert({
          campaign_id: campaignId,
          creator_id: creatorId,
          invite_token: inviteToken,
          teaser_data: teaserData,
          status: 'pending'
        })
        .select()
        .single();

      if (inviteError) {
        console.error(`Error inviting creator ${creatorId}:`, inviteError);
        continue;
      }

      // 4. Prepare Teaser Text for Admin to Copy
      const deepLink = `https://campayn.in/invite/${inviteToken}`;
      const teaserText = `Hey! 🌟 You've been selected for a new campaign: "${campaign.campaign_name}". Check out the details and claim your spot here: ${deepLink}`;

      inviteResults.push({
        creatorId,
        inviteToken,
        teaserText,
        deepLink
      });
    }

    res.json({ success: true, invites: inviteResults });
  } catch (error) {
    console.error('Error sending invitations:', error);
    res.status(500).json({ error: 'Failed to send invitations', details: error.message });
  }
});

module.exports = router;
