const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Get all available creator categories with subcategories
 * Used for populating campaign creation form dropdowns
 */
router.get('/api/creators/categories', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('creator_categories_summary')
      .select('*')
      .order('creator_count', { ascending: false });
    
    if (error) throw error;
    
    // Transform to frontend-friendly format
    const categories = data.map(cat => ({
      name: cat.category,
      count: cat.creator_count,
      subcategories: cat.subcategories || [],
      followerRange: {
        min: cat.min_followers,
        max: cat.max_followers,
        avg: cat.avg_followers
      },
      tierCounts: {
        micro: cat.micro_count || 0,
        macro: cat.macro_count || 0,
        mega: cat.mega_count || 0
      }
    }));
    
    res.json({ 
      success: true, 
      categories,
      total: categories.length
    });
    
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch categories',
      details: error.message 
    });
  }
});

/**
 * Get subcategories for a specific category
 */
router.get('/api/creators/categories/:category/subcategories', async (req, res) => {
  try {
    const { category } = req.params;
    
    const { data, error } = await supabase
      .from('creators')
      .select('subcategory')
      .eq('category', category)
      .not('subcategory', 'is', null);
    
    if (error) throw error;
    
    // Get unique subcategories and count occurrences
    const subcategoryMap = {};
    data.forEach(item => {
      if (item.subcategory) {
        subcategoryMap[item.subcategory] = (subcategoryMap[item.subcategory] || 0) + 1;
      }
    });
    
    const subcategories = Object.entries(subcategoryMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    
    res.json({ 
      success: true, 
      category, 
      subcategories
    });
    
  } catch (error) {
    console.error('Error fetching subcategories:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch subcategories',
      details: error.message 
    });
  }
});

/**
 * Get automated creator recommendations for a campaign
 * This is the core recommendation engine
 */
router.get('/api/campaigns/:campaignId/recommend', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { limit = 15 } = req.query;
    
    // Fetch campaign details to get target criteria
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, campaign_name, target_category, target_subcategory, creator_type, target_creators_count, budget')
      .eq('id', campaignId)
      .single();
    
    if (campaignError) throw campaignError;
    
    if (!campaign.target_category) {
      return res.status(400).json({
        success: false,
        error: 'Campaign does not have target category set'
      });
    }
    
    // Call the recommendation function
    const { data: recommendations, error: recError } = await supabase
      .rpc('recommend_creators', {
        p_category: campaign.target_category,
        p_subcategory: campaign.target_subcategory,
        p_creator_type: campaign.creator_type,
        p_limit: parseInt(limit) || campaign.target_creators_count || 15,
        p_min_engagement: 0.5
      });
    
    if (recError) throw recError;
    
    // Enhance recommendations with additional metadata
    const enhancedRecommendations = recommendations.map(creator => {
      const tierLabels = {
        'micro': 'Micro Influencer (1K-10K)',
        'macro': 'Macro Influencer (10K-100K)',
        'mega': 'Mega Influencer (100K-2M)'
      };
      
      return {
        ...creator,
        match_percentage: Math.round(creator.match_score),
        follower_tier: tierLabels[creator.creator_tier] || creator.creator_tier,
        estimated_cost: estimateCost(creator.ig_followers, campaign.budget),
        recommendation_reason: generateReason(creator, campaign)
      };
    });
    
    res.json({
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.campaign_name,
        target_category: campaign.target_category,
        target_subcategory: campaign.target_subcategory,
        creator_type: campaign.creator_type
      },
      recommendations: enhancedRecommendations,
      total: enhancedRecommendations.length,
      metadata: {
        generated_at: new Date().toISOString(),
        criteria: {
          category: campaign.target_category,
          subcategory: campaign.target_subcategory || 'Any',
          tier: campaign.creator_type || 'Any'
        }
      }
    });
    
  } catch (error) {
    console.error('Error generating recommendations:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to generate recommendations',
      details: error.message 
    });
  }
});

/**
 * Manually trigger recommendation generation and save to campaign_creators
 * Admin can review and approve these before sending to brand
 */
router.post('/api/campaigns/:campaignId/generate-recommendations', async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { autoApprove = false } = req.body;
    
    // Get recommendations
    const recResponse = await fetch(`${req.protocol}://${req.get('host')}/api/campaigns/${campaignId}/recommend`);
    const recData = await recResponse.json();
    
    if (!recData.success) {
      return res.status(400).json(recData);
    }
    
    // Insert recommendations into campaign_creators table
    const creatorAssignments = recData.recommendations.map(creator => ({
      campaign_id: campaignId,
      creator_id: creator.id,
      status: 'recommended', // Always set to recommended so brand can review
      recommended_by_admin: true,
      admin_notes: `Auto-recommended: ${creator.match_percentage}% match, ${creator.follower_tier}. ${creator.recommendation_reason || ''}`
      // Note: priority_score removed as column doesn't exist in campaign_creators table
    }));
    
    const { data, error } = await supabase
      .from('campaign_creators')
      .upsert(creatorAssignments, {
        onConflict: 'campaign_id,creator_id',
        ignoreDuplicates: false
      });
    
    if (error) throw error;
    
    res.json({
      success: true,
      message: `Successfully generated ${creatorAssignments.length} creator recommendations`,
      count: creatorAssignments.length,
      recommendations: recData.recommendations
    });
    
  } catch (error) {
    console.error('Error saving recommendations:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save recommendations',
      details: error.message
    });
  }
});

/**
 * Get creator tier statistics for a category
 */
router.get('/api/creator-stats', async (req, res) => {
  try {
    const { category, subcategory } = req.query;
    
    let query = supabase
      .from('creators_classified')
      .select('calculated_type, ig_followers, engagement_rate');
    
    if (category) query = query.eq('category', category);
    if (subcategory) query = query.eq('subcategory', subcategory);
    
    const { data, error } = await query;
    
    if (error) throw error;
    
    // Calculate statistics
    const stats = {
      total: data.length,
      by_tier: {
        micro: data.filter(c => c.calculated_type === 'micro').length,
        macro: data.filter(c => c.calculated_type === 'macro').length,
        mega: data.filter(c => c.calculated_type === 'mega').length
      },
      avg_engagement: data.reduce((sum, c) => sum + (c.engagement_rate || 0), 0) / data.length || 0,
      avg_followers: data.reduce((sum, c) => sum + c.ig_followers, 0) / data.length || 0
    };
    
    res.json({ success: true, stats, filters: { category, subcategory } });
    
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics'
    });
  }
});

// Helper functions
function estimateCost(followers, totalBudget) {
  // Simple cost estimation based on follower count
  // Adjust these rates based on your market research
  const baseRate = followers < 10000 ? 0.001 : 
                   followers < 100000 ? 0.0005 : 
                   0.0003;
  
  const estimated = Math.round(followers * baseRate);
  return Math.min(estimated, totalBudget * 0.3); // Max 30% of budget per creator
}

function generateReason(creator, campaign) {
  const reasons = [];
  
  if (creator.category === campaign.target_category) {
    reasons.push(`Matches ${campaign.target_category} category`);
  }
  
  if (creator.subcategory === campaign.target_subcategory) {
    reasons.push(`Specializes in ${campaign.target_subcategory}`);
  }
  
  if (creator.engagement_rate >= 3) {
    reasons.push(`High engagement rate (${creator.engagement_rate.toFixed(1)}%)`);
  }
  
  if (creator.match_score >= 80) {
    reasons.push('Excellent match for campaign criteria');
  }
  
  return reasons.join('. ');
}

module.exports = router;
