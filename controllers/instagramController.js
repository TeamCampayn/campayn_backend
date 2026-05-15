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

    // 3. Get the User's Instagram Business Account ID
    // First get FB Pages managed by user
    const pagesResponse = await axios.get('https://graph.facebook.com/v19.0/me/accounts', {
      params: { access_token: longToken }
    });

    const pages = pagesResponse.data.data;
    if (!pages || pages.length === 0) {
      throw new Error('No Facebook Pages found linked to this account.');
    }

    // Find the page linked to an Instagram Business account
    let igBusinessId = null;
    let igHandle = null;

    for (const page of pages) {
      const igResponse = await axios.get(`https://graph.facebook.com/v19.0/${page.id}`, {
        params: {
          fields: 'instagram_business_account',
          access_token: longToken
        }
      });

      if (igResponse.data.instagram_business_account) {
        igBusinessId = igResponse.data.instagram_business_account.id;
        
        // Get the IG handle/username
        const igInfo = await axios.get(`https://graph.facebook.com/v19.0/${igBusinessId}`, {
          params: {
            fields: 'username,profile_picture_url,followers_count',
            access_token: longToken
          }
        });
        igHandle = igInfo.data.username;
        break;
      }
    }

    if (!igBusinessId) {
      throw new Error('No Instagram Business account found linked to your Facebook pages.');
    }

    // 4. Update Creator in Database
    // We assume the 'state' parameter was used to pass the creator's local ID
    const creatorId = state; 

    const { data, error } = await supabase
      .from('creators')
      .update({
        ig_access_token: longToken,
        ig_user_id: igBusinessId,
        ig_token_expires_at: expiresAt.toISOString(),
        ig_handle: igHandle,
        account_status: 'verified'
      })
      .eq('id', creatorId)
      .select()
      .single();

    if (error) throw error;

    // 5. Redirect back to frontend
    res.redirect(`${process.env.FRONTEND_URL}/dashboard/settings?status=success&handle=${igHandle}`);

  } catch (error) {
    console.error('❌ Instagram Auth Error:', error.response?.data || error.message);
    res.redirect(`${process.env.FRONTEND_URL}/dashboard/settings?status=error&message=${encodeURIComponent(error.message)}`);
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
