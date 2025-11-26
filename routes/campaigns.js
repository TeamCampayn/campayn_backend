const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Utility function to log campaign activities
const logActivity = async (campaignId, userId, userType, activityType, description, metadata = {}) => {
  try {
    await supabase
      .from('campaign_activities')
      .insert({
        campaign_id: campaignId,
        user_id: userId,
        user_type: userType,
        activity_type: activityType,
        description: description,
        metadata: metadata
      });
  } catch (error) {
    console.error('Error logging activity:', error);
  }
};

// Get all campaigns with overview
router.get('/api/campaigns', async (req, res) => {
  try {
    const { phase, brand_id, status } = req.query;
    
    let query = supabase
      .from('campaign_overview')
      .select('*')
      .order('created_at', { ascending: false });

    if (phase) query = query.eq('phase', phase);
    if (brand_id) query = query.eq('brand_id', brand_id);
    if (status) query = query.eq('status', status);

    const { data: campaigns, error } = await query;
    
    if (error) throw error;

    res.json({
      success: true,
      campaigns,
      total: campaigns.length
    });

  } catch (error) {
    console.error('Error fetching campaigns:', error);
    res.status(500).json({
      error: 'Failed to fetch campaigns',
      details: error.message
    });
  }
});

// Get brand dashboard stats
router.get('/api/dashboard/stats/:brandId', async (req, res) => {
  try {
    const { brandId } = req.params;

    // Fetch all campaigns for this brand
    const { data: campaigns, error: campaignsError } = await supabase
      .from('campaigns')
      .select('id, campaign_name, status, phase, created_at, budget')
      .eq('brand_id', brandId)
      .order('created_at', { ascending: false });

    if (campaignsError) throw campaignsError;

    const campaignList = campaigns || [];
    const campaignIds = campaignList.map(c => c.id);

    let activeCreators = 0;
    let totalSpend = 0;
    let totalReach = 0;

    // Calculate total spend from active/completed campaigns
    const activeCampaigns = campaignList.filter(c => 
      c.phase === 'campaign_active' || 
      c.phase === 'content_creation' || 
      c.phase === 'completed' ||
      c.phase === 'campaign_complete' ||
      c.status === 'completed'
    );
    totalSpend = activeCampaigns.reduce((sum, c) => sum + (c.budget || 0), 0);

    if (campaignIds.length > 0) {
      // Get creator count
      const { count: creatorsCount } = await supabase
        .from('campaign_creators')
        .select('*', { count: 'exact', head: true })
        .in('campaign_id', campaignIds);
      
      activeCreators = creatorsCount || 0;

      // Get all creator IDs for reach calculation
      const { data: campaignCreators } = await supabase
        .from('campaign_creators')
        .select('creator_id')
        .in('campaign_id', campaignIds);

      if (campaignCreators && campaignCreators.length > 0) {
        const creatorIds = [...new Set(campaignCreators.map(cc => cc.creator_id))];
        
        // Fetch creator follower counts (using service role - bypasses RLS)
        const { data: creators } = await supabase
          .from('creators')
          .select('id, followers_count, ig_followers')
          .in('id', creatorIds);

        if (creators && creators.length > 0) {
          totalReach = creators.reduce((sum, c) => {
            const followers = c.followers_count || c.ig_followers || 0;
            return sum + Math.round(followers * 0.15); // 15% estimated reach
          }, 0);
        }
      }
    }

    // Calculate stats
    const stats = {
      totalCampaigns: campaignList.length,
      draftCampaigns: campaignList.filter(c => c.status === 'draft' || c.phase === 'quotation_pending').length,
      quotingCampaigns: campaignList.filter(c => 
        c.phase === 'quotation_sent' || 
        c.phase === 'quotation_accepted' || 
        c.phase === 'creator_selection' ||
        c.phase === 'payment_pending'
      ).length,
      liveCampaigns: campaignList.filter(c => 
        c.phase === 'campaign_active' || 
        c.phase === 'content_creation' ||
        c.phase === 'content_approval'
      ).length,
      completedCampaigns: campaignList.filter(c => 
        c.phase === 'completed' || 
        c.phase === 'campaign_complete' ||
        c.status === 'completed'
      ).length,
      activeCreators,
      totalSpend,
      totalReach
    };

    res.json({
      success: true,
      stats,
      recentCampaigns: campaignList.slice(0, 5)
    });

  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      error: 'Failed to fetch dashboard stats',
      details: error.message
    });
  }
});

// Create new campaign
router.post('/api/campaigns', async (req, res) => {
  try {
    const {
      campaign_name,
      brand_id,
      description,
      budget,
      start_date,
      end_date,
      campaign_objectives,
      requirements,
      deliverables,
      admin_notes
    } = req.body;

    const { data: campaign, error } = await supabase
      .from('campaigns')
      .insert({
        campaign_name,
        brand_id,
        description,
        budget,
        start_date,
        end_date,
        campaign_objectives,
        requirements,
        deliverables,
        admin_notes,
        phase: 'creator_selection'
      })
      .select()
      .single();

    if (error) throw error;

    // Log activity
    await logActivity(
      campaign.id,
      req.body.admin_id || 'system',
      'admin',
      'campaign_created',
      `Campaign "${campaign_name}" created`,
      { budget, phase: 'creator_selection' }
    );

    res.json({
      success: true,
      message: 'Campaign created successfully',
      campaign
    });

  } catch (error) {
    console.error('Error creating campaign:', error);
    res.status(500).json({
      error: 'Failed to create campaign',
      details: error.message
    });
  }
});

// Update campaign details (PATCH)
router.patch('/api/campaigns/:campaignId', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const updateData = req.body;

    // Remove any fields that shouldn't be updated directly
    const allowedFields = ['target_creators_count', 'campaign_name', 'description', 'budget', 'requirements', 'admin_notes'];
    const filteredData = {};
    
    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key)) {
        filteredData[key] = value;
      }
    }

    if (Object.keys(filteredData).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const { data: campaign, error } = await supabase
      .from('campaigns')
      .update(filteredData)
      .eq('id', campaignId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Campaign updated successfully',
      campaign
    });

  } catch (error) {
    console.error('Error updating campaign:', error);
    res.status(500).json({
      error: 'Failed to update campaign',
      details: error.message
    });
  }
});

// Get campaign details with creators and contents
router.get('/api/campaigns/:campaignId', async (req, res) => {
  try {
    const { campaignId } = req.params;

    // Get campaign details
    const { data: campaign, error: campaignError } = await supabase
      .from('campaign_overview')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (campaignError) throw campaignError;

    // Get campaign creators
    const { data: campaignCreators, error: creatorsError } = await supabase
      .from('campaign_creators')
      .select(`
        *,
        creators (
          id, name, ig_handle, category, subcategory,
          followers_count, engagement_rate, profile_picture_url
        )
      `)
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });

    if (creatorsError) throw creatorsError;

    // Get campaign contents
    const { data: contents, error: contentsError } = await supabase
      .from('campaign_contents')
      .select(`
        *,
        creators (
          id, name, ig_handle, profile_picture_url
        )
      `)
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });

    if (contentsError) throw contentsError;

    // Get recent activities
    const { data: activities, error: activitiesError } = await supabase
      .from('campaign_activities')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (activitiesError) throw activitiesError;

    res.json({
      success: true,
      campaign,
      creators: campaignCreators,
      contents,
      activities
    });

  } catch (error) {
    console.error('Error fetching campaign details:', error);
    res.status(500).json({
      error: 'Failed to fetch campaign details',
      details: error.message
    });
  }
});

// Phase 1: Recommend creators to brand
router.post('/api/campaigns/:campaignId/recommend-creators', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { creator_ids, admin_id, admin_notes } = req.body;

    if (!creator_ids || creator_ids.length === 0) {
      return res.status(400).json({ error: 'No creators selected' });
    }

    // Insert recommended creators
    const recommendations = creator_ids.map(creator_id => ({
      campaign_id: campaignId,
      creator_id,
      status: 'recommended',
      recommended_by_admin: true,
      admin_notes
    }));

    const { data: campaignCreators, error } = await supabase
      .from('campaign_creators')
      .upsert(recommendations, { 
        onConflict: 'campaign_id,creator_id',
        ignoreDuplicates: false 
      })
      .select(`
        *,
        creators (
          id, name, ig_handle, category, followers_count, engagement_rate
        )
      `);

    if (error) throw error;

    // Get campaign details for notification
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('campaign_name, brand_id')
      .eq('id', campaignId)
      .single();

    // Log activity
    await logActivity(
      campaignId,
      admin_id,
      'admin',
      'creators_recommended',
      `Recommended ${creator_ids.length} creators to brand`,
      { creator_ids, admin_notes }
    );

    // Emit Socket.IO event to notify brand
    req.io?.to(`brand_${campaign.brand_id}`).emit('creators_recommended', {
      campaign_id: campaignId,
      campaign_name: campaign.campaign_name,
      creators: campaignCreators,
      message: `${creator_ids.length} creators have been recommended for your campaign "${campaign.campaign_name}"`
    });

    res.json({
      success: true,
      message: 'Creators recommended successfully',
      recommended_creators: campaignCreators
    });

  } catch (error) {
    console.error('Error recommending creators:', error);
    res.status(500).json({
      error: 'Failed to recommend creators',
      details: error.message
    });
  }
});

// Phase 1: Brand response to creator recommendations
router.patch('/api/campaigns/:campaignId/creators/:creatorId/respond', async (req, res) => {
  try {
    const { campaignId, creatorId } = req.params;
    const { status, brand_response, brand_id } = req.body;

    // Validate status
    const validStatuses = ['approved', 'rejected', 'requested_more'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // If approving, validate against budget limits
    if (status === 'approved') {
      const { data: validationResult, error: validationError } = await supabase
        .rpc('validate_creator_selection', {
          p_campaign_id: campaignId,
          p_creator_id: creatorId
        });

      if (validationError) {
        console.error('Validation error:', validationError);
        // Continue without validation if function doesn't exist yet
      } else if (validationResult && validationResult.length > 0) {
        const validation = validationResult[0];
        if (!validation.is_valid) {
          return res.status(400).json({
            success: false,
            error: validation.message || 'Selection limit reached',
            currentSelected: validation.current_selected,
            maxAllowed: validation.max_allowed,
            validationFailed: true
          });
        }
      }
    }

    // Update creator status
    const { data: updatedCreator, error } = await supabase
      .from('campaign_creators')
      .update({
        status,
        brand_response,
        brand_response_at: new Date().toISOString()
      })
      .eq('campaign_id', campaignId)
      .eq('creator_id', creatorId)
      .select(`
        *,
        creators (
          id, name, ig_handle, profile_picture_url
        )
      `)
      .single();

    if (error) throw error;

    // If status is 'requested_more' and there's a brand_response, store it as the first conversation message
    if (status === 'requested_more' && brand_response && brand_response.trim()) {
      const { error: messageError } = await supabase
        .from('conversation_messages')
        .insert([{
          campaign_id: campaignId,
          creator_id: creatorId,
          sender_type: 'brand',
          message: brand_response,
          created_at: new Date().toISOString()
        }]);

      if (messageError) {
        console.error('Error storing initial conversation message:', messageError);
        // Don't fail the whole request for this
      }
    }

    // Check if we should move to next phase
    if (status === 'approved') {
      // Get campaign target and current creators
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('target_creators_count')
        .eq('id', campaignId)
        .single();

      const { data: allCampaignCreators } = await supabase
        .from('campaign_creators')
        .select('id, status')
        .eq('campaign_id', campaignId);

      const targetCount = campaign?.target_creators_count || 1;
      const approvedCreators = allCampaignCreators?.filter(c => c.status === 'approved') || [];
      const pendingCreators = allCampaignCreators?.filter(c => c.status === 'recommended') || [];

      // Move to payment pending immediately when target creators are approved
      if (approvedCreators.length >= targetCount) {
        await supabase
          .from('campaigns')
          .update({ phase: 'payment_pending' })
          .eq('id', campaignId);

        // If there are still pending creators, auto-reject them since target is reached
        if (pendingCreators.length > 0) {
          await supabase
            .from('campaign_creators')
            .update({ 
              status: 'rejected', 
              brand_response: 'Auto-rejected: Target creators reached',
              brand_response_at: new Date().toISOString()
            })
            .eq('campaign_id', campaignId)
            .eq('status', 'recommended');
        }

        // Log phase change
        await logActivity(
          campaignId,
          brand_id,
          'brand',
          'phase_changed',
          `Campaign moved to payment pending phase - Target reached: ${approvedCreators.length}/${targetCount} creators approved`,
          { 
            new_phase: 'payment_pending', 
            approved_creators: approvedCreators.length,
            target_creators: targetCount,
            target_reached: true,
            auto_rejected_pending: pendingCreators.length
          }
        );

        // Emit Socket.IO event for phase change
        req.io?.emit('campaign_phase_changed', {
          campaign_id: campaignId,
          new_phase: 'payment_pending',
          approved_creators: approvedCreators.length,
          target_creators: targetCount,
          message: `Campaign moved to payment processing - ${approvedCreators.length}/${targetCount} creators approved`
        });
      }
    }

    // Log activity
    await logActivity(
      campaignId,
      brand_id,
      'brand',
      'creator_response',
      `${status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : 'Requested more info for'} creator ${updatedCreator.creators.name}`,
      { creator_id: creatorId, status, brand_response }
    );

    // Emit Socket.IO event to notify admin
    req.io?.emit('creator_response_updated', {
      campaign_id: campaignId,
      creator: updatedCreator,
      status,
      brand_response,
      message: `Brand has ${status} creator ${updatedCreator.creators.name}`
    });

    res.json({
      success: true,
      message: 'Creator response updated successfully',
      creator: updatedCreator
    });

  } catch (error) {
    console.error('Error updating creator response:', error);
    res.status(500).json({
      error: 'Failed to update creator response',
      details: error.message
    });
  }
});

// Admin reply to brand response about a creator
router.post('/api/campaigns/:campaignId/creators/:creatorId/admin-reply', async (req, res) => {
  try {
    const { campaignId, creatorId } = req.params;
    const { admin_reply, admin_id } = req.body;

    if (!admin_reply || !admin_reply.trim()) {
      return res.status(400).json({ error: 'Admin reply is required' });
    }

    // Update campaign_creators with admin reply
    const { data: updatedCreator, error } = await supabase
      .from('campaign_creators')
      .update({
        admin_reply: admin_reply.trim(),
        admin_reply_at: new Date().toISOString()
      })
      .eq('campaign_id', campaignId)
      .eq('creator_id', creatorId)
      .select(`
        *,
        creators (
          id, name, ig_handle, profile_picture_url
        )
      `)
      .single();

    if (error) throw error;

    if (!updatedCreator) {
      return res.status(404).json({ error: 'Campaign creator not found' });
    }

    // Save to conversation history
    await supabase
      .from('conversation_messages')
      .insert({
        campaign_id: campaignId,
        creator_id: creatorId,
        sender_type: 'admin',
        sender_id: admin_id || 'admin',
        message: admin_reply.trim(),
        message_type: 'message'
      });

    // Log activity
    await logActivity(
      campaignId,
      admin_id || 'admin',
      'admin',
      'admin_reply',
      `Admin replied to brand about creator ${updatedCreator.creators.name}`,
      { creator_id: creatorId, admin_reply }
    );

    // Emit Socket.IO event to notify brand
    req.io?.emit('admin_reply_sent', {
      campaign_id: campaignId,
      creator: updatedCreator,
      admin_reply,
      message: `Admin replied about creator ${updatedCreator.creators.name}`
    });

    res.json({
      success: true,
      message: 'Admin reply sent successfully',
      creator: updatedCreator
    });

  } catch (error) {
    console.error('Error sending admin reply:', error);
    res.status(500).json({
      error: 'Failed to send admin reply',
      details: error.message
    });
  }
});

// Brand reply to admin about a creator (with optional final decision)
router.post('/api/campaigns/:campaignId/creators/:creatorId/brand-reply', async (req, res) => {
  try {
    const { campaignId, creatorId } = req.params;
    const { brand_reply, action_type, brand_id } = req.body;

    if (!brand_reply || !brand_reply.trim()) {
      return res.status(400).json({ error: 'Brand reply is required' });
    }

    if (!action_type || !['approved', 'rejected', 'continue_chat'].includes(action_type)) {
      return res.status(400).json({ error: 'Valid action type (approved/rejected/continue_chat) is required' });
    }

    // Prepare update object
    const updateData = {
      brand_reply: brand_reply.trim(),
      brand_reply_at: new Date().toISOString()
    };

    // Only update status if it's a final decision (not continue_chat)
    if (action_type === 'approved' || action_type === 'rejected') {
      updateData.status = action_type;
      updateData.brand_response_at = new Date().toISOString(); // Update response timestamp for final decision
    }

    // Update campaign_creators with brand reply
    const { data: updatedCreator, error } = await supabase
      .from('campaign_creators')
      .update(updateData)
      .eq('campaign_id', campaignId)
      .eq('creator_id', creatorId)
      .select(`
        *,
        creators (
          id, name, ig_handle, profile_picture_url
        )
      `)
      .single();

    if (error) throw error;

    if (!updatedCreator) {
      return res.status(404).json({ error: 'Campaign creator not found' });
    }

    // Save to conversation history
    await supabase
      .from('conversation_messages')
      .insert({
        campaign_id: campaignId,
        creator_id: creatorId,
        sender_type: 'brand',
        sender_id: brand_id || 'brand',
        message: brand_reply.trim(),
        message_type: action_type === 'continue_chat' ? 'message' : 'decision',
        decision_type: action_type === 'continue_chat' ? null : action_type
      });

    // Log activity based on action type
    let activityDescription = '';
    if (action_type === 'approved') {
      activityDescription = `Brand replied to admin and approved creator ${updatedCreator.creators.name}`;
    } else if (action_type === 'rejected') {
      activityDescription = `Brand replied to admin and rejected creator ${updatedCreator.creators.name}`;
    } else {
      activityDescription = `Brand sent message to admin about creator ${updatedCreator.creators.name}`;
    }

    await logActivity(
      campaignId,
      brand_id || 'brand',
      'brand',
      'brand_reply_to_admin',
      activityDescription,
      { creator_id: creatorId, brand_reply, action_type }
    );

    // Check if we've reached the target number of approved creators (only for approved status)
    if (action_type === 'approved') {
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('target_creators_count')
        .eq('id', campaignId)
        .single();

      const { data: approvedCreators } = await supabase
        .from('campaign_creators')
        .select('id')
        .eq('campaign_id', campaignId)
        .eq('status', 'approved');

      const targetCount = campaign?.target_creators_count || 0;
      
      if (approvedCreators && approvedCreators.length >= targetCount) {
        await supabase
          .from('campaigns')
          .update({ phase: 'payment_processing' })
          .eq('id', campaignId);

        // Auto-reject remaining creators
        await supabase
          .from('campaign_creators')
          .update({ 
            status: 'rejected',
            brand_response: 'Auto-rejected: Target creators reached',
            brand_response_at: new Date().toISOString()
          })
          .eq('campaign_id', campaignId)
          .eq('status', 'recommended');
      }
    }

    // Emit Socket.IO event to notify admin
    req.io?.emit('brand_reply_to_admin', {
      campaign_id: campaignId,
      creator: updatedCreator,
      brand_reply,
      action_type,
      message: activityDescription
    });

    res.json({
      success: true,
      message: 'Brand reply sent successfully',
      creator: updatedCreator
    });

  } catch (error) {
    console.error('Error sending brand reply:', error);
    res.status(500).json({
      error: 'Failed to send brand reply',
      details: error.message
    });
  }
});

// Get conversation history between brand and admin about a creator
router.get('/api/campaigns/:campaignId/creators/:creatorId/conversation', async (req, res) => {
  try {
    const { campaignId, creatorId } = req.params;

    const { data: messages, error } = await supabase
      .from('conversation_messages')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('creator_id', creatorId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    res.json({
      success: true,
      messages: messages || []
    });

  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({
      error: 'Failed to fetch conversation',
      details: error.message
    });
  }
});

// Phase 2: Confirm payment
router.patch('/api/campaigns/:campaignId/payment/confirm', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { admin_id, payment_method, transaction_id, amount } = req.body;

    // Update campaign payment status and phase
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .update({
        payment_status: 'paid',
        phase: 'content_approval',
        payment_confirmed_at: new Date().toISOString()
      })
      .eq('id', campaignId)
      .select()
      .single();

    if (campaignError) throw campaignError;

    // Record payment
    const { error: paymentError } = await supabase
      .from('campaign_payments')
      .insert({
        campaign_id: campaignId,
        payment_type: 'campaign_fee',
        amount: amount || campaign.budget,
        payment_method,
        transaction_id,
        payment_status: 'completed',
        admin_confirmed: true,
        admin_confirmed_by: admin_id,
        admin_confirmed_at: new Date().toISOString()
      });

    if (paymentError) throw paymentError;

    // Log activity
    await logActivity(
      campaignId,
      admin_id,
      'admin',
      'payment_confirmed',
      'Payment confirmed and campaign moved to content approval phase',
      { amount: amount || campaign.budget, payment_method, transaction_id }
    );

    // Emit Socket.IO event
    req.io?.to(`brand_${campaign.brand_id}`).emit('payment_confirmed', {
      campaign_id: campaignId,
      message: 'Payment confirmed! Your campaign is now in content approval phase.'
    });

    res.json({
      success: true,
      message: 'Payment confirmed successfully',
      campaign
    });

  } catch (error) {
    console.error('Error confirming payment:', error);
    res.status(500).json({
      error: 'Failed to confirm payment',
      details: error.message
    });
  }
});

// Phase 3: Upload content
router.post('/api/campaigns/:campaignId/contents', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const {
      creator_id,
      content_type,
      content_url,
      thumbnail_url,
      caption,
      hashtags,
      uploaded_by,
      scheduled_post_time
    } = req.body;

    const { data: content, error } = await supabase
      .from('campaign_contents')
      .insert({
        campaign_id: campaignId,
        creator_id,
        content_type,
        content_url,
        thumbnail_url,
        caption,
        hashtags,
        scheduled_post_time,
        approval_status: 'pending'
      })
      .select(`
        *,
        creators (
          id, name, ig_handle, profile_picture_url
        )
      `)
      .single();

    if (error) throw error;

    // Log activity
    await logActivity(
      campaignId,
      uploaded_by,
      'creator',
      'content_uploaded',
      `Uploaded ${content_type} content for approval`,
      { content_id: content.id, content_type }
    );

    // Get campaign brand for notification
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('brand_id, campaign_name')
      .eq('id', campaignId)
      .single();

    // Emit Socket.IO event to notify brand
    req.io?.to(`brand_${campaign.brand_id}`).emit('content_uploaded', {
      campaign_id: campaignId,
      content,
      message: `New ${content_type} content uploaded for "${campaign.campaign_name}" and awaiting approval`
    });

    res.json({
      success: true,
      message: 'Content uploaded successfully',
      content
    });

  } catch (error) {
    console.error('Error uploading content:', error);
    res.status(500).json({
      error: 'Failed to upload content',
      details: error.message
    });
  }
});

// Phase 3: Approve/Reject content
router.patch('/api/campaigns/:campaignId/contents/:contentId/approve', async (req, res) => {
  try {
    const { campaignId, contentId } = req.params;
    const { approval_status, brand_feedback, brand_id } = req.body;

    // Validate approval status
    const validStatuses = ['approved', 'rejected', 'needs_revision'];
    if (!validStatuses.includes(approval_status)) {
      return res.status(400).json({ error: 'Invalid approval status' });
    }

    // Update content approval (without raw SQL expressions)
    const baseUpdate = {
      approval_status,
      brand_feedback,
      approved_at: approval_status === 'approved' ? new Date().toISOString() : null,
    };

    let { data: content, error } = await supabase
      .from('campaign_contents')
      .update(baseUpdate)
      .eq('id', contentId)
      .select(`
        *,
        creators (
          id, name, ig_handle, profile_picture_url
        )
      `)
      .single();
    if (error) throw error;

    // If requesting revision, increment revision_count safely in a second step
    if (approval_status === 'needs_revision') {
      const currentCount = (content?.revision_count ?? 0) + 1;
      const { data: incremented, error: incErr } = await supabase
        .from('campaign_contents')
        .update({ revision_count: currentCount })
        .eq('id', contentId)
        .select(`
          *,
          creators (
            id, name, ig_handle, profile_picture_url
          )
        `)
        .single();
      if (incErr) throw incErr;
      content = incremented;
    }

    // Check if all content is approved to move to next phase
    if (approval_status === 'approved') {
      const { data: allContents, error: allErr } = await supabase
        .from('campaign_contents')
        .select('approval_status')
        .eq('campaign_id', campaignId);
      if (allErr) throw allErr;
      const allApproved = (allContents || []).length > 0 && allContents.every(c => c.approval_status === 'approved');
      
      if (allApproved && allContents.length > 0) {
        await supabase
          .from('campaigns')
          .update({ 
            phase: 'campaign_active',
            campaign_started_at: new Date().toISOString()
          })
          .eq('id', campaignId);

        // Log phase change
        await logActivity(
          campaignId,
          brand_id,
          'brand',
          'phase_changed',
          'All content approved! Campaign is now active.',
          { new_phase: 'campaign_active' }
        );
      }
    }

    // Log activity
    await logActivity(
      campaignId,
      brand_id,
      'brand',
      'content_reviewed',
      `${approval_status === 'approved' ? 'Approved' : approval_status === 'rejected' ? 'Rejected' : 'Requested revision for'} content by ${content.creators.name}`,
      { content_id: contentId, approval_status, brand_feedback }
    );

    // Emit Socket.IO event
    req.io?.emit('content_approval_updated', {
      campaign_id: campaignId,
      content,
      approval_status,
      brand_feedback,
      message: `Content ${approval_status} for ${content.creators.name}`
    });

    res.json({
      success: true,
      message: 'Content approval updated successfully',
      content
    });

  } catch (error) {
    console.error('Error updating content approval:', error);
    res.status(500).json({
      error: 'Failed to update content approval',
      details: error.message
    });
  }
});

// Finalize request from admin
router.post('/api/campaigns/:campaignId/finalize-request', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { admin_id } = req.body;

    // Optional: Check all content approved
    const { data: allContents, error: contErr } = await supabase
      .from('campaign_contents')
      .select('approval_status')
      .eq('campaign_id', campaignId);
    if (contErr) throw contErr;
    const allApproved = (allContents || []).length > 0 && allContents.every(c => c.approval_status === 'approved');

    await logActivity(
      campaignId,
      admin_id,
      'admin',
      'finalize_requested',
      allApproved ? 'Admin requested campaign finalization (all content approved)' : 'Admin requested campaign finalization',
      { all_approved: allApproved }
    );

    // Get campaign brand for notify
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('brand_id, campaign_name, phase')
      .eq('id', campaignId)
      .single();

    // Notify brand room
    req.io?.to(`brand_${campaign.brand_id}`).emit('finalize_requested', {
      campaign_id: campaignId,
      message: `Admin requested to finalize content for "${campaign.campaign_name}"`,
      all_approved: allApproved
    });

    res.json({ success: true, message: 'Finalize requested', allApproved });
  } catch (error) {
    console.error('Error requesting finalize:', error);
    res.status(500).json({ error: 'Failed to request finalize', details: error.message });
  }
});

// Check finalize status
router.get('/api/campaigns/:campaignId/finalize-status', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { data: campaign, error: campErr } = await supabase
      .from('campaigns')
      .select('id, phase')
      .eq('id', campaignId)
      .single();
    if (campErr) throw campErr;

    const { data: acts, error: actsErr } = await supabase
      .from('campaign_activities')
      .select('activity_type, created_at')
      .eq('campaign_id', campaignId)
      .in('activity_type', ['finalize_requested', 'finalize_confirmed'])
      .order('created_at', { ascending: false });
    if (actsErr) throw actsErr;

    const requested = acts?.find(a => a.activity_type === 'finalize_requested');
    const confirmed = acts?.find(a => a.activity_type === 'finalize_confirmed');

    res.json({
      success: true,
      phase: campaign.phase,
      finalize_requested_at: requested?.created_at || null,
      finalize_confirmed_at: confirmed?.created_at || null
    });
  } catch (error) {
    console.error('Error fetching finalize status:', error);
    res.status(500).json({ error: 'Failed to fetch finalize status', details: error.message });
  }
});

// Finalize confirm by brand -> move to campaign_active
router.post('/api/campaigns/:campaignId/finalize-confirm', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { brand_id } = req.body;

    const { data: updated, error: updErr } = await supabase
      .from('campaigns')
      .update({ phase: 'campaign_active', campaign_started_at: new Date().toISOString() })
      .eq('id', campaignId)
      .select('id, brand_id, campaign_name, phase')
      .single();
    if (updErr) throw updErr;

    await logActivity(
      campaignId,
      brand_id,
      'brand',
      'finalize_confirmed',
      'Brand confirmed finalization. Campaign moved to active.',
      { new_phase: 'campaign_active' }
    );

    // Notify both rooms
    req.io?.to(`brand_${updated.brand_id}`).emit('finalize_confirmed', {
      campaign_id: campaignId,
      message: `Campaign "${updated.campaign_name}" is now active.`,
    });
    req.io?.emit('phase_changed', { campaign_id: campaignId, phase: 'campaign_active' });

    res.json({ success: true, message: 'Campaign moved to active', campaign: updated });
  } catch (error) {
    console.error('Error confirming finalize:', error);
    res.status(500).json({ error: 'Failed to confirm finalize', details: error.message });
  }
});

// Mark content as posted with link
router.patch('/api/campaigns/:campaignId/contents/:contentId/post', async (req, res) => {
  try {
    const { campaignId, contentId } = req.params;
    const { post_url, posted_at, posted_by } = req.body;
    if (!post_url) return res.status(400).json({ error: 'post_url is required' });

    // Normalize and extract shortcode for robust analytics matching later
    const normalizePath = (u) => {
      try { const parsed = new URL(u); return parsed.pathname.replace(/\/+$/, ''); } catch { return (u || '').replace(/^https?:\/\//, '').replace(/^[^/]+/, '').split('?')[0].split('#')[0].replace(/\/+$/, ''); }
    };
    const extractShortcode = (u) => {
      const m = normalizePath(u).match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
      return m ? m[1] : null;
    };
    const permalinkPath = normalizePath(post_url);
    const shortcode = extractShortcode(post_url);

    // Merge into performance_metrics
    const { data: existingRow } = await supabase
      .from('campaign_contents')
      .select('id, performance_metrics')
      .eq('id', contentId)
      .single();
    const existingMetrics = existingRow?.performance_metrics || {};
    const mergedMetrics = {
      ...existingMetrics,
      ig_permalink_path: permalinkPath,
      ig_shortcode: shortcode,
      ig_permalink_saved_at: new Date().toISOString(),
    };

    const { data: content, error } = await supabase
      .from('campaign_contents')
      .update({ 
        post_url, 
        posted_at: posted_at || new Date().toISOString(), 
        posted_by: posted_by || 'admin',
        performance_metrics: mergedMetrics
      })
      .eq('id', contentId)
      .select(`*, creators (id, name, ig_handle, profile_picture_url)`).single();
    if (error) throw error;

    await logActivity(
      campaignId,
      posted_by || 'admin',
      'admin',
      'content_posted',
      `Content posted for ${content.creators?.name}`,
      { content_id: contentId, post_url }
    );

    req.io?.emit('content_posted', { campaign_id: campaignId, content });
    res.json({ success: true, message: 'Content marked as posted', content });
  } catch (error) {
    console.error('Error marking content posted:', error);
    res.status(500).json({ error: 'Failed to mark content posted', details: error.message });
  }
});

// Update content performance metrics
router.patch('/api/campaigns/:campaignId/contents/:contentId/metrics', async (req, res) => {
  try {
    const { campaignId, contentId } = req.params;
    const { performance_metrics } = req.body;
    if (!performance_metrics || typeof performance_metrics !== 'object') {
      return res.status(400).json({ error: 'performance_metrics object required' });
    }

    const { data: content, error } = await supabase
      .from('campaign_contents')
      .update({ performance_metrics })
      .eq('id', contentId)
      .select(`*, creators (id, name, ig_handle, profile_picture_url)`).single();
    if (error) throw error;

    await logActivity(
      campaignId,
      null,
      'admin',
      'content_metrics_updated',
      'Updated content performance metrics',
      { content_id: contentId }
    );

    req.io?.emit('content_metrics_updated', { campaign_id: campaignId, content });
    res.json({ success: true, message: 'Metrics updated', content });
  } catch (error) {
    console.error('Error updating content metrics:', error);
    res.status(500).json({ error: 'Failed to update metrics', details: error.message });
  }
});

// Phase 4: Mark campaign as complete
router.patch('/api/campaigns/:campaignId/complete', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { admin_id, completion_notes } = req.body;

    const { data: campaign, error } = await supabase
      .from('campaigns')
      .update({
        phase: 'campaign_complete',
        status: 'completed',
        campaign_completed_at: new Date().toISOString(),
        admin_notes: completion_notes
      })
      .eq('id', campaignId)
      .select()
      .single();

    if (error) throw error;

    // Log activity
    await logActivity(
      campaignId,
      admin_id,
      'admin',
      'campaign_completed',
      'Campaign marked as complete',
      { completion_notes }
    );

    // Emit Socket.IO event
    req.io?.to(`brand_${campaign.brand_id}`).emit('campaign_completed', {
      campaign_id: campaignId,
      message: 'Your campaign has been completed successfully!'
    });

    res.json({
      success: true,
      message: 'Campaign completed successfully',
      campaign
    });

  } catch (error) {
    console.error('Error completing campaign:', error);
    res.status(500).json({
      error: 'Failed to complete campaign',
      details: error.message
    });
  }
});

// Get campaign activities/timeline
router.get('/api/campaigns/:campaignId/activities', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { limit = 50 } = req.query;

    const { data: activities, error } = await supabase
      .from('campaign_activities')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (error) throw error;

    res.json({
      success: true,
      activities
    });

  } catch (error) {
    console.error('Error fetching campaign activities:', error);
    res.status(500).json({
      error: 'Failed to fetch campaign activities',
      details: error.message
    });
  }
});

// PAYMENT SYSTEM ENDPOINTS

// Send payment request (Admin action)
router.post('/api/campaigns/:campaignId/payment-request', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { upi_id, qr_code_url, payment_instructions, admin_id } = req.body;

    // Get campaign details
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (campaignError) throw campaignError;

    if (campaign.phase !== 'payment_pending') {
      return res.status(400).json({
        success: false,
        error: 'Campaign is not in payment pending phase'
      });
    }

    // Update campaign with payment details
    const { data: updatedCampaign, error: updateError } = await supabase
      .from('campaigns')
      .update({
        upi_id,
        qr_code_url,
        payment_instructions,
        payment_request_sent_at: new Date().toISOString()
      })
      .eq('id', campaignId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Log activity
    await logActivity(
      campaignId,
      admin_id,
      'admin',
      'payment_request_sent',
      `Payment request sent with UPI ID: ${upi_id}`,
      { upi_id, payment_amount: updatedCampaign.payment_amount }
    );

    // Emit real-time updates
    try {
      // Broadcast to everyone (admin dashboards) and to specific rooms
      req.io?.emit('payment_updated', { campaign_id: campaignId, action: 'request_sent' });
      req.io?.to(campaignId).emit('payment_updated', { campaign_id: campaignId, action: 'request_sent' });
      if (updatedCampaign?.brand_id) {
        req.io?.to(`brand_${updatedCampaign.brand_id}`).emit('payment_updated', { campaign_id: campaignId, action: 'request_sent' });
      }
    } catch (e) {
      console.warn('Socket emit failed (payment_request):', e?.message);
    }

    res.json({
      success: true,
      message: 'Payment request sent successfully',
      campaign: updatedCampaign
    });

  } catch (error) {
    console.error('Error sending payment request:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send payment request',
      details: error.message
    });
  }
});

// Submit payment proof (Brand action)
router.post('/api/campaigns/:campaignId/payment-proof', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { 
      upi_transaction_id, 
      upi_ref_number, 
      payment_screenshot_url, 
      brand_payment_notes,
      brand_id 
    } = req.body;

    // Validate required fields
    if (!upi_transaction_id) {
      return res.status(400).json({
        success: false,
        error: 'UPI transaction ID is required'
      });
    }

    // Get campaign details
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (campaignError) throw campaignError;

    if (campaign.phase !== 'payment_pending') {
      return res.status(400).json({
        success: false,
        error: 'Campaign is not in payment pending phase'
      });
    }

    // Check if payment proof already exists
    const { data: existingPayment } = await supabase
      .from('campaign_payments')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('payment_type', 'campaign_fee')
      .single();

    if (existingPayment) {
      // Update existing payment record
      const { data: updatedPayment, error: updateError } = await supabase
        .from('campaign_payments')
        .update({
          upi_transaction_id,
          upi_ref_number,
          payment_screenshot_url,
          brand_payment_notes,
          payment_status: 'processing',
          updated_at: new Date().toISOString()
        })
        .eq('id', existingPayment.id)
        .select()
        .single();

      if (updateError) throw updateError;

      // Log activity
      await logActivity(
        campaignId,
        brand_id,
        'brand',
        'payment_proof_updated',
        `Payment proof updated - Transaction ID: ${upi_transaction_id}`,
        { upi_transaction_id, upi_ref_number }
      );

      // Real-time update
      try {
        req.io?.emit('payment_updated', { campaign_id: campaignId, action: 'proof_updated' });
        req.io?.to(campaignId).emit('payment_updated', { campaign_id: campaignId, action: 'proof_updated' });
      } catch (e) {
        console.warn('Socket emit failed (payment_proof_updated):', e?.message);
      }

      res.json({
        success: true,
        message: 'Payment proof updated successfully',
        payment: updatedPayment
      });

    } else {
      // Create new payment record
      const { data: newPayment, error: insertError } = await supabase
        .from('campaign_payments')
        .insert({
          campaign_id: campaignId,
          payment_type: 'campaign_fee',
          amount: campaign.payment_amount,
          payment_method: 'upi',
          upi_transaction_id,
          upi_ref_number,
          payment_screenshot_url,
          brand_payment_notes,
          payment_status: 'processing'
        })
        .select()
        .single();

  if (insertError) throw insertError;

      // Log activity
      await logActivity(
        campaignId,
        brand_id,
        'brand',
        'payment_proof_submitted',
        `Payment proof submitted - Transaction ID: ${upi_transaction_id}`,
        { upi_transaction_id, upi_ref_number, amount: campaign.payment_amount }
      );

      // Real-time update
      try {
        req.io?.emit('payment_updated', { campaign_id: campaignId, action: 'proof_submitted' });
        req.io?.to(campaignId).emit('payment_updated', { campaign_id: campaignId, action: 'proof_submitted' });
      } catch (e) {
        console.warn('Socket emit failed (payment_proof_submitted):', e?.message);
      }

      res.json({
        success: true,
        message: 'Payment proof submitted successfully',
        payment: newPayment
      });
    }

  } catch (error) {
    console.error('Error submitting payment proof:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit payment proof',
      details: error.message
    });
  }
});

// Verify payment (Admin action)
router.post('/api/campaigns/:campaignId/verify-payment', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { 
      verified, 
      admin_verification_notes, 
      admin_id 
    } = req.body;

    // Get payment record
    const { data: payment, error: paymentError } = await supabase
      .from('campaign_payments')
      .select('*')
      .eq('campaign_id', campaignId)
      .eq('payment_type', 'campaign_fee')
      .single();

    if (paymentError) throw paymentError;

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment record not found'
      });
    }

    const newPaymentStatus = verified ? 'completed' : 'failed';
    const newCampaignStatus = verified ? 'paid' : 'pending';
    const newCampaignPhase = verified ? 'content_approval' : 'payment_pending';

    // Update payment record
    const { data: updatedPayment, error: updatePaymentError } = await supabase
      .from('campaign_payments')
      .update({
        payment_status: newPaymentStatus,
        admin_verified_by: admin_id,
        admin_verified_at: new Date().toISOString(),
        admin_verification_notes
      })
      .eq('id', payment.id)
      .select()
      .single();

    if (updatePaymentError) throw updatePaymentError;

    // Update campaign status and phase
    const { data: updatedCampaign, error: updateCampaignError } = await supabase
      .from('campaigns')
      .update({
        payment_status: newCampaignStatus,
        phase: newCampaignPhase,
        payment_confirmed_at: verified ? new Date().toISOString() : null
      })
      .eq('id', campaignId)
      .select()
      .single();

    if (updateCampaignError) throw updateCampaignError;

    // Log activity
    await logActivity(
      campaignId,
      admin_id,
      'admin',
      verified ? 'payment_verified' : 'payment_rejected',
      verified 
        ? `Payment verified and campaign moved to content approval phase`
        : `Payment rejected: ${admin_verification_notes}`,
      { 
        payment_id: payment.id,
        upi_transaction_id: payment.upi_transaction_id,
        verification_notes: admin_verification_notes
      }
    );

    // Real-time update
    try {
      const action = verified ? 'verified' : 'rejected';
      req.io?.emit('payment_updated', { campaign_id: campaignId, action });
      req.io?.to(campaignId).emit('payment_updated', { campaign_id: campaignId, action });
      if (updatedCampaign?.brand_id) {
        req.io?.to(`brand_${updatedCampaign.brand_id}`).emit('payment_updated', { campaign_id: campaignId, action });
      }
    } catch (e) {
      console.warn('Socket emit failed (verify_payment):', e?.message);
    }

    res.json({
      success: true,
      message: verified ? 'Payment verified successfully' : 'Payment rejected',
      payment: updatedPayment,
      campaign: updatedCampaign
    });

  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify payment',
      details: error.message
    });
  }
});

// Get payment details for a campaign
router.get('/api/campaigns/:campaignId/payment', async (req, res) => {
  try {
    const { campaignId } = req.params;

    // Get basic campaign info first
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select(`
        id, campaign_name, brand_id, budget, payment_status, 
        payment_amount, payment_request_sent_at, payment_due_date,
        upi_id, qr_code_url, payment_instructions, phase
      `)
      .eq('id', campaignId)
      .single();

    if (campaignError) throw campaignError;

    // Compute breakdown and fallback payment amount if missing
    const budgetVal = Number(campaign.budget || 0);
    const platformFee = +(budgetVal * 0.10).toFixed(2);
    const gstAmount = +(platformFee * 0.18).toFixed(2);
    let computedPaymentAmount = campaign.payment_amount;
    if (computedPaymentAmount === null || computedPaymentAmount === undefined) {
      computedPaymentAmount = +(budgetVal + platformFee + gstAmount).toFixed(2);
    }

    // Get payment record if exists
    const { data: paymentRecord, error: paymentError } = await supabase
      .from('campaign_payments')
      .select(`
        id, upi_transaction_id, upi_ref_number, payment_screenshot_url,
        brand_payment_notes, admin_verified_by, admin_verified_at,
        admin_verification_notes, created_at, updated_at, payment_status
      `)
      .eq('campaign_id', campaignId)
      .eq('payment_type', 'campaign_fee')
      .single();

    // Combine campaign and payment data
    // Look up brand name
    let brandName = null;
    if (campaign?.brand_id) {
      const { data: brand } = await supabase
        .from('brands')
        .select('brand_name')
        .eq('id', campaign.brand_id)
        .single();
      brandName = brand?.brand_name || null;
    }

    const paymentInfo = {
      ...campaign,
      brand_name: brandName,
      platform_fee: platformFee,
      gst_amount: gstAmount,
      payment_amount: computedPaymentAmount,
      payment_record_id: paymentRecord?.id || null,
      upi_transaction_id: paymentRecord?.upi_transaction_id || null,
      upi_ref_number: paymentRecord?.upi_ref_number || null,
      payment_screenshot_url: paymentRecord?.payment_screenshot_url || null,
      brand_payment_notes: paymentRecord?.brand_payment_notes || null,
      admin_verified_by: paymentRecord?.admin_verified_by || null,
      admin_verified_at: paymentRecord?.admin_verified_at || null,
      admin_verification_notes: paymentRecord?.admin_verification_notes || null,
      payment_submitted_at: paymentRecord?.created_at || null,
      payment_updated_at: paymentRecord?.updated_at || null,
      has_payment_record: !!paymentRecord
    };

    res.json({
      success: true,
      payment: paymentInfo,
      has_payment_record: !!paymentRecord
    });

  } catch (error) {
    console.error('Error fetching payment details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payment details',
      details: error.message
    });
  }
});

// Get all pending payments (Admin dashboard)
router.get('/api/payments/pending', async (req, res) => {
  try {
    // Get campaigns in payment_pending phase or with pending payments
    const { data: campaigns, error: campaignError } = await supabase
      .from('campaigns')
      .select(`
        id, campaign_name, brand_id, budget, payment_status,
        payment_amount, payment_request_sent_at, payment_due_date,
        upi_id, qr_code_url, payment_instructions
      `)
      .eq('phase', 'payment_pending')
      .order('created_at', { ascending: false });

    if (campaignError) throw campaignError;

    // Get payment records for these campaigns
    const campaignIds = campaigns?.map(c => c.id) || [];
    let paymentRecords = [];
    
    if (campaignIds.length > 0) {
      const { data: payments, error: paymentError } = await supabase
        .from('campaign_payments')
        .select(`
          campaign_id, id, upi_transaction_id, upi_ref_number,
          payment_screenshot_url, brand_payment_notes, created_at,
          payment_status, admin_verified_at
        `)
        .in('campaign_id', campaignIds)
        .eq('payment_type', 'campaign_fee');

      paymentRecords = payments || [];
    }

    // Combine campaign and payment data
    // Fetch brand names for mapping
    let brandsById = {};
    if ((campaigns?.length || 0) > 0) {
      const { data: brands } = await supabase
        .from('brands')
        .select('id, brand_name')
        .in('id', campaigns.map(c => c.brand_id));
      brandsById = (brands || []).reduce((acc, b) => { acc[b.id] = b.brand_name; return acc; }, {});
    }

    const pendingPayments = campaigns?.map(campaign => {
      const budgetVal = Number(campaign.budget || 0);
      const platformFee = +(budgetVal * 0.10).toFixed(2);
      const gstAmount = +(platformFee * 0.18).toFixed(2);
      // Compute fallback payment amount if missing
      let computedPaymentAmount = campaign.payment_amount;
      if (computedPaymentAmount === null || computedPaymentAmount === undefined) {
        computedPaymentAmount = +(budgetVal + platformFee + gstAmount).toFixed(2);
      }
      const paymentRecord = paymentRecords.find(p => p.campaign_id === campaign.id);
      return {
        campaign_id: campaign.id,
        campaign_name: campaign.campaign_name,
        brand_name: brandsById[campaign.brand_id] || null,
        budget: campaign.budget,
        payment_status: campaign.payment_status,
        payment_amount: computedPaymentAmount,
        platform_fee: platformFee,
        gst_amount: gstAmount,
        payment_request_sent_at: campaign.payment_request_sent_at,
        payment_due_date: campaign.payment_due_date,
        upi_id: campaign.upi_id,
        payment_record_id: paymentRecord?.id || null,
        upi_transaction_id: paymentRecord?.upi_transaction_id || null,
        upi_ref_number: paymentRecord?.upi_ref_number || null,
        payment_screenshot_url: paymentRecord?.payment_screenshot_url || null,
        brand_payment_notes: paymentRecord?.brand_payment_notes || null,
        payment_submitted_at: paymentRecord?.created_at || null
      };
    }) || [];

    res.json({
      success: true,
      payments: pendingPayments,
      count: pendingPayments.length
    });

  } catch (error) {
    console.error('Error fetching pending payments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pending payments',
      details: error.message
    });
  }
});

module.exports = router;