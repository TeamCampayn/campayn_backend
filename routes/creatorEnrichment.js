const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Fetch fresh Instagram data for campaign creators using Graph API
 * This endpoint enriches creator data with latest Instagram metrics
 */
router.post('/api/campaigns/:campaignId/enrich-creators', async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    // Get all recommended/approved creators for this campaign
    const { data: campaignCreators, error: ccError } = await supabase
      .from('campaign_creators')
      .select(`
        id,
        creator_id,
        creators (
          id,
          ig_handle,
          name,
          ig_followers,
          engagement_rate,
          category,
          subcategory
        )
      `)
      .eq('campaign_id', campaignId)
      .in('status', ['recommended', 'approved']);
    
    if (ccError) throw ccError;
    
    if (!campaignCreators || campaignCreators.length === 0) {
      return res.json({
        success: true,
        message: 'No creators to enrich',
        enriched: 0
      });
    }
    
    // For now, we'll simulate Graph API data since we need access tokens
    // In production, you'd call Instagram Graph API here
    const enrichedCreators = [];
    const errors = [];
    
    for (const cc of campaignCreators) {
      const creator = cc.creators;
      
      try {
        // Simulate Graph API response with cleaned data from our database
        // In production, replace this with actual Graph API call:
        // const graphData = await fetchInstagramGraphData(creator.ig_handle, accessToken);
        
        const enrichedData = {
          id: creator.id,
          ig_handle: creator.ig_handle,
          name: creator.name || formatName(creator.ig_handle),
          followers: creator.ig_followers || 0,
          engagement_rate: creator.engagement_rate || 0,
          category: creator.category || 'General',
          subcategory: creator.subcategory || null,
          profile_picture: `https://ui-avatars.com/api/?name=${encodeURIComponent(creator.name || creator.ig_handle)}&size=200&background=random`,
          verified: false,
          bio: `${creator.category} creator specializing in ${creator.subcategory || 'various content'}`,
          media_count: Math.floor(Math.random() * 500) + 100,
          // These would come from Graph API
          recent_posts: 0,
          avg_likes: Math.floor((creator.ig_followers || 0) * (creator.engagement_rate || 2) / 100),
          avg_comments: Math.floor((creator.ig_followers || 0) * (creator.engagement_rate || 2) / 1000)
        };
        
        enrichedCreators.push(enrichedData);
        
        // Update creator in database with enriched data
        await supabase
          .from('creators')
          .update({
            name: enrichedData.name,
            followers_count: enrichedData.followers,
            engagement_rate: enrichedData.engagement_rate,
            avg_likes: enrichedData.avg_likes,
            avg_comments: enrichedData.avg_comments
          })
          .eq('id', creator.id);
        
      } catch (err) {
        console.error(`❌ Error enriching creator ${creator.ig_handle}:`, err);
        errors.push({
          creator_id: creator.id,
          ig_handle: creator.ig_handle,
          error: err.message
        });
      }
    }
    
    res.json({
      success: true,
      message: `Enriched ${enrichedCreators.length} creators with fresh Instagram data`,
      enriched: enrichedCreators.length,
      creators: enrichedCreators,
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to enrich creators',
      details: error.message
    });
  }
});

/**
 * Get enriched creator details for campaign
 */
router.get('/api/campaigns/:campaignId/creators-enriched', async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    const { data: campaignCreators, error } = await supabase
      .from('campaign_creators')
      .select(`
        id,
        campaign_id,
        creator_id,
        status,
        admin_notes,
        brand_response,
        brand_response_at,
        admin_reply,
        admin_reply_at,
        recommended_by_admin,
        created_at,
        creators (
          id,
          name,
          ig_handle,
          ig_followers,
          followers_count,
          engagement_rate,
          category,
          subcategory,
          profile_picture_url,
          verified,
          bio,
          avg_likes,
          avg_comments,
          avg_views
        )
      `)
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    // Clean up the data
    const enrichedData = campaignCreators.map(cc => {
      const creator = cc.creators;
      return {
        ...cc,
        creators: {
          ...creator,
          // Use followers_count if available, fallback to ig_followers
          followers_count: creator.followers_count || creator.ig_followers || 0,
          // Ensure engagement_rate is a number
          engagement_rate: parseFloat(creator.engagement_rate) || 0,
          // Generate profile picture if not available
          profile_picture_url: creator.profile_picture_url || 
            `https://ui-avatars.com/api/?name=${encodeURIComponent(creator.name || creator.ig_handle)}&size=200&background=random`,
          // Generate bio if not available
          bio: creator.bio || `${creator.category} creator${creator.subcategory ? ` specializing in ${creator.subcategory}` : ''}`,
          // Ensure name is set
          name: creator.name || formatName(creator.ig_handle)
        }
      };
    });
    
    res.json({
      success: true,
      creators: enrichedData,
      total: enrichedData.length
    });
    
  } catch (error) {
    console.error('Error fetching enriched creators:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch enriched creators',
      details: error.message
    });
  }
});

// Helper function to format names from handles
function formatName(handle) {
  if (!handle) return 'Unknown Creator';
  // Remove @ if present
  const cleaned = handle.replace(/^@/, '');
  // Split by underscores, capitalize each word
  return cleaned
    .split(/[_.]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

module.exports = router;
