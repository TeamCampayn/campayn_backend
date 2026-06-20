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

// Admin: Add Creator manually
router.post('/admin/campaigns/:campaignId/creators/add', async (req, res) => {
  const { campaignId } = req.params;
  const { creatorId } = req.body;

  if (!campaignId || !creatorId) {
    return res.status(400).json({ error: 'Campaign ID and Creator ID are required' });
  }

  try {
    // 1. Get Campaign
    const { data: campaign, error: campaignErr } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (campaignErr || !campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // 2. Get Creator details
    const { data: creator, error: creatorErr } = await supabase
      .from('creators')
      .select('*')
      .eq('id', creatorId)
      .single();

    if (creatorErr || !creator) {
      return res.status(404).json({ error: 'Creator not found' });
    }

    // 3. Add to campaign_creators
    const { data: selection, error: selectionErr } = await supabase
      .from('campaign_creators')
      .upsert({
        campaign_id: campaignId,
        creator_id: creatorId,
        status: 'approved',
        selection_status: 'selected',
        brand_response: 'approved'
      }, { onConflict: 'campaign_id,creator_id' })
      .select()
      .single();

    if (selectionErr) throw selectionErr;

    // 4. Ensure legacy campaign exists so application can reference it
    const cpvRate = campaign.cpv_rate || 2.0;
    const cpvPaise = Math.round(cpvRate * 100);
    await ensureLegacyCampaignExists(campaign, cpvPaise, 'active');

    // 5. If creator has user_id, add/update row in applications
    if (creator.user_id) {
      const targetCreators = campaign.target_creators_count || 5;
      const budget = campaign.budget || 100000;
      const estEarning = Math.round(budget / targetCreators);

      const { error: appErr } = await supabase
        .from('applications')
        .upsert({
          user_id: creator.user_id,
          campaign_id: campaignId,
          status: 'approved',
          estimated_earning_inr: estEarning,
          is_flagged: false
        }, { onConflict: 'user_id,campaign_id' });

      if (appErr) {
        console.error('[ADMIN] Error syncing to applications table:', appErr);
      }
    }

    // Log Activity
    await supabase.from('campaign_activities').insert({
      campaign_id: campaignId,
      user_id: 'admin',
      user_type: 'admin',
      activity_type: 'creator_added_manually',
      description: `Creator ${creator.name || creator.ig_handle} added manually by admin`,
      metadata: { creator_id: creatorId }
    });

    res.json({ success: true, selection });

  } catch (error) {
    console.error('Error adding creator:', error);
    res.status(500).json({ error: 'Failed to add creator', details: error.message });
  }
});

// Admin: Remove Creator manually
router.post('/admin/campaigns/:campaignId/creators/remove', async (req, res) => {
  const { campaignId } = req.params;
  const { creatorId } = req.body;

  if (!campaignId || !creatorId) {
    return res.status(400).json({ error: 'Campaign ID and Creator ID are required' });
  }

  try {
    // 1. Get Creator to find user_id if present
    const { data: creator } = await supabase
      .from('creators')
      .select('user_id, name, ig_handle')
      .eq('id', creatorId)
      .maybeSingle();

    // 2. Delete from campaign_creators
    const { error: ccDeleteErr } = await supabase
      .from('campaign_creators')
      .delete()
      .eq('campaign_id', campaignId)
      .eq('creator_id', creatorId);

    if (ccDeleteErr) throw ccDeleteErr;

    // 3. Delete from applications if user_id is present
    if (creator?.user_id) {
      const { error: appDeleteErr } = await supabase
        .from('applications')
        .delete()
        .eq('campaign_id', campaignId)
        .eq('user_id', creator.user_id);

      if (appDeleteErr) {
        console.error('[ADMIN] Error deleting from applications table:', appDeleteErr);
      }
    }

    // Log Activity
    await supabase.from('campaign_activities').insert({
      campaign_id: campaignId,
      user_id: 'admin',
      user_type: 'admin',
      activity_type: 'creator_removed_manually',
      description: `Creator ${creator?.name || creator?.ig_handle || creatorId} removed manually by admin`,
      metadata: { creator_id: creatorId }
    });

    res.json({ success: true, message: 'Creator removed successfully' });

  } catch (error) {
    console.error('Error removing creator:', error);
    res.status(500).json({ error: 'Failed to remove creator', details: error.message });
  }
});

// Admin: Disburse Funds (Release Escrow Payout)
router.post('/admin/disburse-funds', async (req, res) => {
  const { applicationId } = req.body;

  if (!applicationId) {
    return res.status(400).json({ error: 'Application ID is required' });
  }

  try {
    // Call the Postgres RPC function
    const { error: rpcError } = await supabase.rpc('disburse_creator_payout', {
      p_application_id: applicationId
    });

    if (rpcError) {
      console.error('[ADMIN Payout] RPC Error:', rpcError);
      return res.status(400).json({ error: rpcError.message || 'Failed to disburse payout' });
    }

    // Payout was successful! Fetch application details to broadcast Socket.IO updates
    const { data: application, error: fetchErr } = await supabase
      .from('applications')
      .select('*, legacy_campaigns(created_by, title), profiles(display_name)')
      .eq('id', applicationId)
      .maybeSingle();

    if (fetchErr || !application) {
      console.error('[ADMIN Payout] Fetch application post-disbursement failed:', fetchErr);
    } else {
      const creatorUserId = application.user_id;
      const brandUserId = application.legacy_campaigns?.created_by;
      const amount = application.final_earning_inr;

      // Broadcast real-time Socket.IO updates to creator and brand
      if (req.io) {
        if (creatorUserId) {
          req.io.to(`user_${creatorUserId}`).emit('wallet_update', {
            type: 'payout_received',
            applicationId,
            amount,
            title: application.legacy_campaigns?.title
          });
        }
        if (brandUserId) {
          req.io.to(`brand_${brandUserId}`).emit('wallet_update', {
            type: 'payout_released',
            applicationId,
            amount,
            title: application.legacy_campaigns?.title
          });
        }
      }
    }

    res.json({ success: true, message: 'Payout released successfully' });

  } catch (error) {
    console.error('[ADMIN Payout] Connection error:', error);
    res.status(500).json({ error: 'Failed to disburse funds due to server error', details: error.message });
  }
});

// Admin: Process Creator Withdrawal (Paid, Processing, Failed)
router.post('/admin/process-withdrawal', async (req, res) => {
  const { withdrawalId, status, reference } = req.body;

  if (!withdrawalId || !status) {
    return res.status(400).json({ error: 'Withdrawal ID and Status are required' });
  }

  try {
    // Call the Postgres RPC function
    const { error: rpcError } = await supabase.rpc('process_creator_withdrawal', {
      p_withdrawal_id: withdrawalId,
      p_status: status,
      p_reference: reference || null
    });

    if (rpcError) {
      console.error('[ADMIN Payout] process_creator_withdrawal RPC Error:', rpcError);
      return res.status(400).json({ error: rpcError.message || 'Failed to process withdrawal' });
    }

    // Fetch withdrawal details to broadcast Socket.IO updates if needed
    const { data: withdrawal, error: fetchErr } = await supabase
      .from('withdrawals')
      .select('*, profiles(display_name)')
      .eq('id', withdrawalId)
      .maybeSingle();

    if (fetchErr || !withdrawal) {
      console.error('[ADMIN Payout] Fetch withdrawal post-processing failed:', fetchErr);
    } else {
      const creatorUserId = withdrawal.user_id;
      const amount = withdrawal.amount_inr;

      // Broadcast real-time Socket.IO updates to creator
      if (req.io && creatorUserId) {
        req.io.to(`user_${creatorUserId}`).emit('wallet_update', {
          type: 'withdrawal_status_updated',
          withdrawalId,
          amount,
          status: withdrawal.status,
          destination: withdrawal.destination_value
        });
      }
    }

    res.json({ success: true, message: `Withdrawal successfully marked as ${status}` });

  } catch (error) {
    console.error('[ADMIN Payout] Connection error:', error);
    res.status(500).json({ error: 'Failed to process withdrawal due to server error', details: error.message });
  }
});

module.exports = router;

