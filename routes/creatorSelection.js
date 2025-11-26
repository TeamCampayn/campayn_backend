const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Validate if a creator can be selected within budget limits
 * POST /api/campaigns/:campaignId/validate-selection
 */
router.post('/api/campaigns/:campaignId/validate-selection', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { creatorId } = req.body;

    if (!creatorId) {
      return res.status(400).json({
        success: false,
        error: 'Creator ID is required'
      });
    }

    // Call the validation function
    const { data, error } = await supabase
      .rpc('validate_creator_selection', {
        p_campaign_id: campaignId,
        p_creator_id: creatorId
      });

    if (error) throw error;

    const result = data[0]; // RPC returns array, get first element

    res.json({
      success: result.is_valid,
      valid: result.is_valid,
      currentSelected: result.current_selected,
      maxAllowed: result.max_allowed,
      message: result.message,
      canSelect: result.is_valid,
      remaining: result.max_allowed - result.current_selected
    });

  } catch (error) {
    console.error('Error validating selection:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate creator selection',
      details: error.message
    });
  }
});

/**
 * Get current selection status for a campaign
 * GET /api/campaigns/:campaignId/selection-status
 */
router.get('/api/campaigns/:campaignId/selection-status', async (req, res) => {
  try {
    const { campaignId } = req.params;

    // Fetch campaign details with selection info
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select(`
        id,
        campaign_name,
        budget,
        estimated_cost_per_creator,
        max_affordable_creators,
        actual_creators_selected,
        creators_approved_count,
        payment_initiated,
        target_creators_count,
        phase,
        status
      `)
      .eq('id', campaignId)
      .single();

    if (campaignError) throw campaignError;

    // Get count of approved creators
    const { data: selectedCreators, error: creatorsError } = await supabase
      .from('campaign_creators')
      .select('id, creator_id, status, selection_status')
      .eq('campaign_id', campaignId)
      .eq('status', 'approved');

    if (creatorsError) throw creatorsError;

    const currentSelected = selectedCreators.length;
    const maxAllowed = campaign.max_affordable_creators || campaign.target_creators_count || 15;
    const estimatedCostPerCreator = campaign.estimated_cost_per_creator || 0;
    const totalEstimatedCost = currentSelected * estimatedCostPerCreator;
    const remaining = maxAllowed - currentSelected;
    const canProceedToPayment = currentSelected > 0 && currentSelected <= maxAllowed;
    const limitReached = currentSelected >= maxAllowed;

    res.json({
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.campaign_name,
        phase: campaign.phase,
        status: campaign.status
      },
      selection: {
        currentSelected,
        maxAllowed,
        remaining,
        limitReached,
        canProceedToPayment,
        paymentInitiated: campaign.payment_initiated,
        percentage: Math.round((currentSelected / maxAllowed) * 100)
      },
      budget: {
        total: campaign.budget,
        costPerCreator: estimatedCostPerCreator,
        totalEstimatedCost,
        remainingBudget: campaign.budget - totalEstimatedCost,
        utilizationPercentage: Math.round((totalEstimatedCost / campaign.budget) * 100)
      },
      selectedCreators: selectedCreators.map(sc => ({
        id: sc.id,
        creatorId: sc.creator_id,
        status: sc.status,
        selectionStatus: sc.selection_status
      }))
    });

  } catch (error) {
    console.error('Error fetching selection status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch selection status',
      details: error.message
    });
  }
});

/**
 * Update selection count manually (if needed)
 * POST /api/campaigns/:campaignId/update-selection-count
 */
router.post('/api/campaigns/:campaignId/update-selection-count', async (req, res) => {
  try {
    const { campaignId } = req.params;

    // Count approved creators
    const { data: selectedCreators, error: countError } = await supabase
      .from('campaign_creators')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('response_status', 'approved');

    if (countError) throw countError;

    const count = selectedCreators || 0;

    // Update campaign
    const { data, error } = await supabase
      .from('campaigns')
      .update({
        actual_creators_selected: count,
        creators_approved_count: count,
        updated_at: new Date().toISOString()
      })
      .eq('id', campaignId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Selection count updated',
      count,
      campaign: data
    });

  } catch (error) {
    console.error('Error updating selection count:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update selection count',
      details: error.message
    });
  }
});

/**
 * Initiate payment process for selected creators
 * POST /api/campaigns/:campaignId/initiate-payment
 */
router.post('/api/campaigns/:campaignId/initiate-payment', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { totalCost, selectedCreatorIds } = req.body;

    // Validate that creators are selected
    const { data: selectedCreators, error: creatorsError } = await supabase
      .from('campaign_creators')
      .select('id, creator_id, status')
      .eq('campaign_id', campaignId)
      .eq('status', 'approved');

    if (creatorsError) throw creatorsError;

    if (selectedCreators.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No creators selected for payment'
      });
    }

    // Get campaign details
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();

    if (campaignError) throw campaignError;

    // Check if selection is within limits
    const maxAllowed = campaign.max_affordable_creators || campaign.target_creators_count || 15;
    if (selectedCreators.length > maxAllowed) {
      return res.status(400).json({
        success: false,
        error: `Selection exceeds budget limit. Maximum ${maxAllowed} creators allowed.`,
        currentSelected: selectedCreators.length,
        maxAllowed
      });
    }

    // Call the payment preparation function
    const { data: paymentResult, error: paymentError } = await supabase
      .rpc('prepare_campaign_payment', {
        p_campaign_id: campaignId,
        p_total_cost: totalCost || 0
      });

    if (paymentError) throw paymentError;

    const result = paymentResult[0];

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.message,
        details: result
      });
    }

    // Log payment initiation activity
    await supabase
      .from('campaign_activities')
      .insert({
        campaign_id: campaignId,
        user_id: campaign.brand_id,
        user_type: 'brand',
        activity_type: 'payment_initiated',
        description: `Payment initiated for ${result.selected_count} creators`,
        metadata: {
          selected_count: result.selected_count,
          estimated_cost: result.estimated_cost,
          creator_ids: selectedCreators.map(sc => sc.creator_id)
        }
      });

    res.json({
      success: true,
      message: result.message,
      payment: {
        selectedCount: result.selected_count,
        estimatedCost: result.estimated_cost,
        costPerCreator: campaign.estimated_cost_per_creator,
        totalBudget: campaign.budget,
        remainingBudget: campaign.budget - result.estimated_cost
      },
      campaign: {
        id: campaignId,
        phase: 'payment',
        paymentInitiated: true
      },
      selectedCreators: selectedCreators.map(sc => ({
        id: sc.id,
        creatorId: sc.creator_id
      }))
    });

  } catch (error) {
    console.error('Error initiating payment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate payment',
      details: error.message
    });
  }
});

/**
 * Get payment summary for a campaign
 * GET /api/campaigns/:campaignId/payment-summary
 */
router.get('/api/campaigns/:campaignId/payment-summary', async (req, res) => {
  try {
    const { campaignId } = req.params;

    // Use the payment summary view
    const { data, error } = await supabase
      .from('campaign_payment_summary')
      .select('*')
      .eq('campaign_id', campaignId)
      .single();

    if (error) throw error;

    // Get selected creators with details
    const { data: creators, error: creatorsError } = await supabase
      .from('campaign_creators')
      .select(`
        id,
        creator_id,
        status,
        selection_status,
        creators:creator_id (
          id,
          name,
          ig_handle,
          ig_followers,
          category,
          engagement_rate
        )
      `)
      .eq('campaign_id', campaignId)
      .eq('status', 'approved');

    if (creatorsError) throw creatorsError;

    res.json({
      success: true,
      summary: {
        campaignId: data.campaign_id,
        campaignName: data.campaign_name,
        budget: data.budget,
        estimatedCostPerCreator: data.estimated_cost_per_creator,
        maxAffordableCreators: data.max_affordable_creators,
        actualCreatorsSelected: data.actual_creators_selected,
        estimatedTotalCost: data.estimated_total_cost,
        remainingBudget: data.remaining_budget,
        selectionPercentage: data.selection_percentage,
        paymentInitiated: data.payment_initiated,
        paymentStatus: data.payment_status
      },
      creators: creators.map(c => ({
        id: c.id,
        creatorId: c.creator_id,
        status: c.status,
        selectionStatus: c.selection_status,
        details: c.creators
      })),
      counts: {
        approved: data.approved_creators,
        selectedForPayment: data.selected_for_payment,
        paid: data.paid_creators
      }
    });

  } catch (error) {
    console.error('Error fetching payment summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payment summary',
      details: error.message
    });
  }
});

/**
 * Complete payment for selected creators
 * POST /api/campaigns/:campaignId/complete-payment
 */
router.post('/api/campaigns/:campaignId/complete-payment', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { paymentId, transactionId } = req.body;

    // Update campaign status
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .update({
        payment_status: 'completed',
        payment_completed_at: new Date().toISOString(),
        phase: 'content_creation',
        status: 'active',
        updated_at: new Date().toISOString()
      })
      .eq('id', campaignId)
      .select()
      .single();

    if (campaignError) throw campaignError;

    // Update creator selection status to 'paid'
    const { error: updateError } = await supabase
      .from('campaign_creators')
      .update({
        selection_status: 'paid',
        updated_at: new Date().toISOString()
      })
      .eq('campaign_id', campaignId)
      .eq('status', 'approved');

    if (updateError) throw updateError;

    // Log payment completion activity
    await supabase
      .from('campaign_activities')
      .insert({
        campaign_id: campaignId,
        user_id: campaign.brand_id,
        user_type: 'brand',
        activity_type: 'payment_completed',
        description: 'Payment completed for campaign creators',
        metadata: {
          payment_id: paymentId,
          transaction_id: transactionId
        }
      });

    res.json({
      success: true,
      message: 'Payment completed successfully',
      campaign: {
        id: campaign.id,
        phase: campaign.phase,
        status: campaign.status,
        paymentStatus: campaign.payment_status
      }
    });

  } catch (error) {
    console.error('Error completing payment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete payment',
      details: error.message
    });
  }
});

module.exports = router;
