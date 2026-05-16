const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Handle the Facebook OAuth callback
 * Exchanges code for tokens and saves to creator profile
 */
exports.handleAuthCallback = async (req, res) => {
  const { code, state } = req.query; // state usually contains the creator's DB ID

  if (!code) {
    return res.status(400).json({ error: 'No code provided' });
  }

  try {
    // 1. Exchange code for Short-Lived User Access Token
    const shortTokenResponse = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
      params: {
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        redirect_uri: `${process.env.BACKEND_URL}/api/auth/facebook/callback`,
        code
      }
    });

    const shortToken = shortTokenResponse.data.access_token;

    // 2. Exchange for Long-Lived User Access Token (60 days)
    const longTokenResponse = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        fb_exchange_token: shortToken
      }
    });

    const longToken = longTokenResponse.data.access_token;
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + (longTokenResponse.data.expires_in || 5184000));

    // DEBUG: Check what permissions we actually have
    const debugResponse = await axios.get('https://graph.facebook.com/debug_token', {
      params: {
        input_token: longToken,
        access_token: `${process.env.FACEBOOK_APP_ID}|${process.env.FACEBOOK_APP_SECRET}`
      }
    });
    console.log('🔐 Token Permissions:', JSON.stringify(debugResponse.data.data.scopes, null, 2));

    // 3. Get the User's Instagram Business Account ID
    const meResponse = await axios.get('https://graph.facebook.com/v19.0/me', {
      params: { fields: 'id,name', access_token: longToken }
    });
    console.log('👤 Logged in as:', JSON.stringify(meResponse.data));

    // Helper: retry a request up to 3 times for transient Facebook errors
    const retryRequest = async (url, params, retries = 3) => {
      for (let i = 0; i < retries; i++) {
        try {
          const response = await axios.get(url, { params });
          return response;
        } catch (err) {
          const isTransient = err.response?.data?.error?.is_transient;
          if (isTransient && i < retries - 1) {
            console.log(`⏳ Transient error, retrying in ${(i + 1) * 2}s... (attempt ${i + 2}/${retries})`);
            await new Promise(r => setTimeout(r, (i + 1) * 2000));
          } else {
            throw err;
          }
        }
      }
    };

    // Fetch pages with retry — Strategy 1: Standard /me/accounts
    const pagesResponse = await retryRequest('https://graph.facebook.com/v19.0/me/accounts', {
      access_token: longToken,
      fields: 'id,name,access_token,instagram_business_account'
    });

    let pages = pagesResponse.data.data || [];
    console.log('📄 Strategy 1 (/me/accounts) pages:', pages.length);

    // Strategy 2: Business Portfolio pages (for Meta Business Suite users)
    if (pages.length === 0) {
      console.log('📄 Strategy 1 empty, trying Business Portfolio...');
      try {
        const bizResponse = await retryRequest('https://graph.facebook.com/v19.0/me/businesses', {
          access_token: longToken,
          fields: 'id,name'
        });
        const businesses = bizResponse.data.data || [];
        console.log('🏢 Businesses found:', JSON.stringify(businesses, null, 2));

        for (const biz of businesses) {
          const bizPagesResponse = await retryRequest(`https://graph.facebook.com/v19.0/${biz.id}/owned_pages`, {
            access_token: longToken,
            fields: 'id,name,access_token,instagram_business_account'
          });
          const bizPages = bizPagesResponse.data.data || [];
          console.log(`📄 Pages in business "${biz.name}":`, JSON.stringify(bizPages, null, 2));
          pages = pages.concat(bizPages);
        }
      } catch (bizErr) {
        console.log('⚠️ Business API failed (may need business_management permission):', bizErr.response?.data?.error?.message || bizErr.message);
      }
    }

    if (pages.length === 0) {
      throw new Error('No Facebook Pages found. Ensure your Page is published and you granted page access during the connection flow.');
    }

    // Find the page linked to an Instagram Business account
    let igBusinessId = null;
    let igHandle = null;

    for (const page of pages) {
      // Check if instagram_business_account was already in the response
      if (page.instagram_business_account) {
        igBusinessId = page.instagram_business_account.id;
      } else {
        const pageToken = page.access_token || longToken;
        const igResponse = await retryRequest(`https://graph.facebook.com/v19.0/${page.id}`, {
          fields: 'instagram_business_account',
          access_token: pageToken
        });
        if (igResponse.data.instagram_business_account) {
          igBusinessId = igResponse.data.instagram_business_account.id;
        }
      }

      if (igBusinessId) {
        const igInfo = await retryRequest(`https://graph.facebook.com/v19.0/${igBusinessId}`, {
          fields: 'username,profile_picture_url,followers_count',
          access_token: longToken
        });
        igHandle = igInfo.data.username;
        console.log('✅ Found Instagram Business Account:', igBusinessId, 'Handle:', igHandle);
        break;
      }
    }

    if (!igBusinessId) {
      throw new Error('No Instagram Business account found linked to your Facebook pages. Please link your Instagram Professional account to your Facebook Page first.');
    }

    // 4. Update Creator in Database
    // We assume the 'state' parameter was used to pass the creator's local ID
    const creatorId = state; 
    console.log('💾 Updating creator with user_id:', creatorId);

    // First try to update existing creator
    const { data, error } = await supabase
      .from('creators')
      .update({
        ig_access_token: longToken,
        ig_user_id: igBusinessId,
        ig_token_expires_at: expiresAt.toISOString(),
        ig_handle: igHandle,
        account_status: 'verified'
      })
      .eq('user_id', creatorId)
      .select();

    console.log('💾 Update result:', JSON.stringify({ data, error }, null, 2));

    if (error) throw error;

    // If no rows were updated, the creator doesn't exist yet — create one
    if (!data || data.length === 0) {
      console.log('💾 No existing creator found, inserting new row...');
      const { data: insertData, error: insertError } = await supabase
        .from('creators')
        .insert({
          user_id: creatorId,
          name: meResponse.data.name || igHandle,
          ig_access_token: longToken,
          ig_user_id: igBusinessId,
          ig_token_expires_at: expiresAt.toISOString(),
          ig_handle: igHandle,
          account_status: 'verified'
        })
        .select();

      if (insertError) throw insertError;
      console.log('💾 Created new creator:', JSON.stringify(insertData, null, 2));
    }

    // 5. Redirect back to frontend
    res.redirect(`${process.env.FRONTEND_URL}/?status=success&handle=${igHandle}`);

  } catch (error) {
    const fbError = error.response?.data?.error?.message || error.message;
    console.error('❌ Instagram Auth Error:', error.response?.data || error.message);
    res.redirect(`${process.env.FRONTEND_URL}/?status=error&message=${encodeURIComponent(fbError)}`);
  }
};

/**
 * Fetch latest insights for a specific creator
 */
exports.getCreatorInsights = async (req, res) => {
  const { creatorId } = req.params;

  try {
    const { data: creator, error } = await supabase
      .from('creators')
      .select('*')
      .eq('id', creatorId)
      .single();

    if (error || !creator.ig_access_token) {
      return res.status(404).json({ error: 'Creator not found or not connected to Instagram' });
    }

    // Fetch basic insights (Followers, Engagement)
    const insightsResponse = await axios.get(`https://graph.facebook.com/v19.0/${creator.ig_user_id}`, {
      params: {
        fields: 'followers_count,media_count,insights.metric(impressions,reach,profile_views){values}',
        access_token: creator.ig_access_token
      }
    });

    res.json({
      success: true,
      insights: insightsResponse.data
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─── Helper: Calculate Campayn Score ─────────────────────────────────
function calculateCampaynScore(creator, igData, campaignStats) {
  const scores = {};

  // 1. Engagement Rate Score (30%)
  const engRate = igData.engagementRate || 0;
  if (engRate >= 6) scores.engagement = 100;
  else if (engRate >= 3) scores.engagement = 70 + (engRate - 3) * 10;
  else if (engRate >= 1) scores.engagement = 40 + (engRate - 1) * 15;
  else scores.engagement = engRate * 40;

  // 2. Growth Velocity Score (20%) — based on follower count tier
  const followers = igData.followersCount || creator.ig_followers || 0;
  if (followers >= 100000) scores.growth = 90;
  else if (followers >= 10000) scores.growth = 70;
  else if (followers >= 1000) scores.growth = 50;
  else scores.growth = 30;

  // 3. Content Consistency Score (20%) — posts per account age
  const mediaCount = igData.mediaCount || 0;
  const accountAgeDays = Math.max(1, Math.floor((Date.now() - new Date(creator.created_at).getTime()) / 86400000));
  const postsPerWeek = (mediaCount / accountAgeDays) * 7;
  if (postsPerWeek >= 5) scores.consistency = 95;
  else if (postsPerWeek >= 3) scores.consistency = 75;
  else if (postsPerWeek >= 1) scores.consistency = 55;
  else scores.consistency = 25;

  // 4. Audience Quality Score (15%) — reach-to-follower ratio
  const reachRatio = followers > 0 ? (igData.reach || 0) / followers : 0;
  scores.audienceQuality = Math.min(100, reachRatio * 200);

  // 5. Campaign Reliability Score (15%)
  const { totalDeliverables = 0, completedDeliverables = 0 } = campaignStats;
  if (totalDeliverables === 0) scores.reliability = 60; // neutral for new creators
  else scores.reliability = Math.min(100, (completedDeliverables / totalDeliverables) * 100);

  // Weighted total
  const total = Math.round(
    scores.engagement * 0.30 +
    scores.growth * 0.20 +
    scores.consistency * 0.20 +
    scores.audienceQuality * 0.15 +
    scores.reliability * 0.15
  );

  return { total: Math.min(100, total), breakdown: scores };
}

// ─── Helper: Calculate Smart Rate Card ───────────────────────────────
function calculateRateCard(followers, engagementRate) {
  // Tier multiplier (Indian market benchmarks)
  let tierMultiplier = 1.0;
  let tier = 'micro';
  if (followers < 10000) { tierMultiplier = 1.2; tier = 'nano'; }
  else if (followers < 50000) { tierMultiplier = 1.0; tier = 'micro'; }
  else if (followers < 500000) { tierMultiplier = 0.8; tier = 'mid'; }
  else { tierMultiplier = 0.6; tier = 'macro'; }

  const engFactor = Math.max(0.01, engagementRate / 100);

  const rates = {
    reel: Math.round(followers * 0.15 * engFactor * tierMultiplier),
    post: Math.round(followers * 0.10 * engFactor * tierMultiplier),
    story: Math.round(followers * 0.05 * engFactor * tierMultiplier),
    carousel: Math.round(followers * 0.12 * engFactor * tierMultiplier),
  };

  // Minimum rates (floor)
  rates.reel = Math.max(500, rates.reel);
  rates.post = Math.max(300, rates.post);
  rates.story = Math.max(200, rates.story);
  rates.carousel = Math.max(400, rates.carousel);

  return { rates, tier };
}

// ─── Helper: Calculate Campaign Match Score ──────────────────────────
function calculateMatchScore(creator, campaign) {
  let score = 0;
  const reasons = [];

  // Category Match (40 pts)
  if (creator.category && campaign.target_category &&
      creator.category.toLowerCase() === campaign.target_category.toLowerCase()) {
    score += 40;
    reasons.push('Category match');
  } else if (creator.category && campaign.target_category) {
    score += 10; // partial
  }

  // Follower Tier Match (25 pts)
  const followers = creator.ig_followers || creator.followers_count || 0;
  const tier = campaign.creator_type;
  if ((tier === 'micro' && followers >= 1000 && followers < 100000) ||
      (tier === 'macro' && followers >= 100000 && followers < 2000000) ||
      (tier === 'mega' && followers >= 2000000)) {
    score += 25;
    reasons.push('Follower tier fit');
  } else {
    score += 8;
  }

  // Engagement (20 pts)
  const engRate = parseFloat(creator.engagement_rate) || 0;
  if (engRate >= 2) {
    score += 20;
    reasons.push('High engagement');
  } else if (engRate >= 1) {
    score += 10;
  }

  // Verified/Active bonus (15 pts)
  if (creator.account_status === 'verified') {
    score += 15;
    reasons.push('Verified creator');
  }

  return { score: Math.min(100, score), reasons };
}

/**
 * Get full dashboard data for a creator
 */
exports.getCreatorDashboard = async (req, res) => {
  const { userId } = req.params;

  try {
    // 1. Fetch creator profile
    const { data: creator, error: creatorError } = await supabase
      .from('creators')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (creatorError) throw creatorError;
    if (!creator) {
      return res.json({
        success: true,
        connected: false,
        creator: null,
        igData: null,
        campaynScore: { total: 0, breakdown: {} },
        rateCard: { rates: {}, tier: 'nano' },
        campaigns: [],
        wallet: { balance: 0 }
      });
    }

    // 2. Fetch Instagram data if connected
    let igData = {
      followersCount: creator.ig_followers || creator.followers_count || 0,
      mediaCount: 0,
      engagementRate: parseFloat(creator.engagement_rate) || 0,
      reach: 0,
      impressions: 0,
      profileViews: 0,
      profilePictureUrl: creator.profile_picture_url || null,
      username: creator.ig_handle || null
    };

    if (creator.ig_access_token && creator.ig_user_id) {
      try {
        // Basic profile info
        const profileRes = await axios.get(`https://graph.facebook.com/v19.0/${creator.ig_user_id}`, {
          params: {
            fields: 'followers_count,media_count,username,profile_picture_url,biography',
            access_token: creator.ig_access_token
          }
        });

        igData.followersCount = profileRes.data.followers_count || 0;
        igData.mediaCount = profileRes.data.media_count || 0;
        igData.username = profileRes.data.username || creator.ig_handle;
        igData.profilePictureUrl = profileRes.data.profile_picture_url || null;
        igData.bio = profileRes.data.biography || null;

        // Update followers in DB
        await supabase.from('creators').update({
          ig_followers: igData.followersCount,
          followers_count: igData.followersCount,
          profile_picture_url: igData.profilePictureUrl
        }).eq('user_id', userId);

        // Insights (may fail for accounts with < 100 followers)
        try {
          const insightsRes = await axios.get(`https://graph.facebook.com/v19.0/${creator.ig_user_id}/insights`, {
            params: {
              metric: 'reach,impressions,profile_views',
              period: 'day',
              access_token: creator.ig_access_token
            }
          });

          if (insightsRes.data.data) {
            for (const metric of insightsRes.data.data) {
              const values = metric.values || [];
              const total = values.reduce((sum, v) => sum + (v.value || 0), 0);
              if (metric.name === 'reach') igData.reach = total;
              if (metric.name === 'impressions') igData.impressions = total;
              if (metric.name === 'profile_views') igData.profileViews = total;
            }
          }
        } catch (insightErr) {
          console.log('⚠️ Insights not available (may need 100+ followers):', insightErr.response?.data?.error?.message || insightErr.message);
        }

        // Calculate engagement rate from recent media
        try {
          const mediaRes = await axios.get(`https://graph.facebook.com/v19.0/${creator.ig_user_id}/media`, {
            params: {
              fields: 'like_count,comments_count',
              limit: 12,
              access_token: creator.ig_access_token
            }
          });

          if (mediaRes.data.data && mediaRes.data.data.length > 0) {
            const totalInteractions = mediaRes.data.data.reduce((sum, m) =>
              sum + (m.like_count || 0) + (m.comments_count || 0), 0);
            igData.engagementRate = igData.followersCount > 0
              ? parseFloat(((totalInteractions / mediaRes.data.data.length / igData.followersCount) * 100).toFixed(2))
              : 0;

            // Update in DB
            await supabase.from('creators').update({
              engagement_rate: igData.engagementRate
            }).eq('user_id', userId);
          }
        } catch (mediaErr) {
          console.log('⚠️ Media insights not available:', mediaErr.response?.data?.error?.message || mediaErr.message);
        }

      } catch (igErr) {
        console.log('⚠️ IG API call failed, using cached data:', igErr.response?.data?.error?.message || igErr.message);
      }
    }

    // 3. Campaign stats
    const { data: campaignCreators } = await supabase
      .from('campaign_creators')
      .select('*, campaigns(*, brands(brand_name))')
      .eq('creator_id', creator.id);

    const campaignStats = {
      totalDeliverables: 0,
      completedDeliverables: 0
    };
    const campaigns = (campaignCreators || []).map(cc => {
      campaignStats.totalDeliverables += cc.deliverables_count || 0;
      campaignStats.completedDeliverables += cc.deliverables_completed || 0;
      return {
        id: cc.campaigns?.id,
        name: cc.campaigns?.campaign_name,
        brand: cc.campaigns?.brands?.brand_name,
        status: cc.status,
        selectionStatus: cc.selection_status,
        cpvRate: cc.campaigns?.cpv_rate,
        deliverables: cc.deliverables_count,
        completed: cc.deliverables_completed,
        createdAt: cc.created_at,
        matchScore: calculateMatchScore(creator, cc.campaigns || {})
      };
    });

    // 4. Active campaign opportunities
    const { data: activeCampaigns } = await supabase
      .from('campaigns')
      .select('*, brands(brand_name)')
      .eq('status', 'campaign_active')
      .limit(6);

    const opportunities = (activeCampaigns || []).map(camp => ({
      id: camp.id,
      name: camp.campaign_name,
      brand: camp.brands?.brand_name,
      cpvRate: camp.cpv_rate,
      budget: camp.budget,
      contentTypes: camp.content_types,
      matchScore: calculateMatchScore(creator, camp)
    })).sort((a, b) => b.matchScore.score - a.matchScore.score);

    // 5. Wallet
    const { data: wallet } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', userId)
      .maybeSingle();

    // 6. Calculate Campayn Score & Rate Card
    const campaynScore = calculateCampaynScore(creator, igData, campaignStats);
    const rateCard = calculateRateCard(igData.followersCount, igData.engagementRate);

    res.json({
      success: true,
      connected: !!(creator.ig_access_token && creator.ig_user_id),
      creator: {
        id: creator.id,
        name: creator.name,
        igHandle: creator.ig_handle,
        category: creator.category,
        subcategory: creator.subcategory,
        bio: creator.bio,
        location: creator.location,
        languages: creator.languages,
        contentStyle: creator.content_style,
        verified: creator.verified,
        profilePictureUrl: igData.profilePictureUrl,
        accountStatus: creator.account_status,
        createdAt: creator.created_at
      },
      igData,
      campaynScore,
      rateCard,
      campaigns,
      opportunities,
      wallet: { balance: parseFloat(wallet?.balance || 0) }
    });

  } catch (error) {
    console.error('❌ Dashboard API Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Public media kit endpoint — no auth required
 */
exports.getMediaKit = async (req, res) => {
  const { igHandle } = req.params;

  try {
    const { data: creator, error } = await supabase
      .from('creators')
      .select('id, name, ig_handle, category, subcategory, bio, location, ig_followers, followers_count, engagement_rate, profile_picture_url, account_status, created_at, verified, avg_likes, avg_comments, content_style')
      .eq('ig_handle', igHandle)
      .maybeSingle();

    if (error) throw error;
    if (!creator) {
      return res.status(404).json({ success: false, error: 'Creator not found' });
    }

    const followers = creator.ig_followers || creator.followers_count || 0;
    const engRate = parseFloat(creator.engagement_rate) || 0;

    const campaynScore = calculateCampaynScore(creator, {
      followersCount: followers,
      engagementRate: engRate,
      mediaCount: 0,
      reach: 0
    }, { totalDeliverables: 0, completedDeliverables: 0 });

    const rateCard = calculateRateCard(followers, engRate);

    // Campaign history count
    const { count: campaignCount } = await supabase
      .from('campaign_creators')
      .select('id', { count: 'exact', head: true })
      .eq('creator_id', creator.id)
      .in('status', ['delivered', 'contracted', 'approved']);

    res.json({
      success: true,
      creator: {
        name: creator.name,
        igHandle: creator.ig_handle,
        category: creator.category,
        subcategory: creator.subcategory,
        bio: creator.bio,
        location: creator.location,
        followers,
        engagementRate: engRate,
        profilePictureUrl: creator.profile_picture_url,
        verified: creator.verified,
        contentStyle: creator.content_style,
        avgLikes: creator.avg_likes,
        avgComments: creator.avg_comments
      },
      campaynScore,
      rateCard,
      campaignsCompleted: campaignCount || 0
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
