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
    // First get the user's FB ID for logging
    const meResponse = await axios.get('https://graph.facebook.com/v21.0/me', {
      params: { fields: 'id,name', access_token: longToken }
    });
    console.log('👤 Logged in as:', JSON.stringify(meResponse.data));

    // Strategy 1: Standard /me/accounts (v21.0)
    const pagesResponse = await axios.get('https://graph.facebook.com/v21.0/me/accounts', {
      params: { 
        access_token: longToken,
        fields: 'id,name,access_token,instagram_business_account'
      }
    });

    let pages = pagesResponse.data.data || [];
    console.log('📄 Strategy 1 (v21.0 /me/accounts) pages:', JSON.stringify(pages, null, 2));

    // Strategy 2: Try /me?fields=accounts (v21.0)
    if (pages.length === 0) {
      console.log('📄 Strategy 1 failed, trying Strategy 2...');
      const altResponse = await axios.get('https://graph.facebook.com/v21.0/me', {
        params: {
          fields: 'accounts{id,name,access_token,instagram_business_account}',
          access_token: longToken
        }
      });
      pages = altResponse.data.accounts?.data || [];
      console.log('📄 Strategy 2 pages:', JSON.stringify(pages, null, 2));
    }

    // Strategy 3: Try unversioned endpoint  
    if (pages.length === 0) {
      console.log('📄 Strategy 2 failed, trying Strategy 3 (unversioned)...');
      const unversionedResponse = await axios.get('https://graph.facebook.com/me/accounts', {
        params: { 
          access_token: longToken,
          fields: 'id,name,access_token,instagram_business_account'
        }
      });
      pages = unversionedResponse.data.data || [];
      console.log('📄 Strategy 3 (unversioned) pages:', JSON.stringify(pages, null, 2));
    }

    // Strategy 4: Try using the user's FB ID directly
    if (pages.length === 0) {
      console.log('📄 Strategy 3 failed, trying Strategy 4 (user ID)...');
      const userId = meResponse.data.id;
      const userPagesResponse = await axios.get(`https://graph.facebook.com/v21.0/${userId}/accounts`, {
        params: { 
          access_token: longToken,
          fields: 'id,name,access_token,instagram_business_account'
        }
      });
      pages = userPagesResponse.data.data || [];
      console.log('📄 Strategy 4 (userId/accounts) pages:', JSON.stringify(pages, null, 2));
    }

    if (!pages || pages.length === 0) {
      throw new Error('No Facebook Pages found. Your account may be too new for the API. Try using the Facebook account that owns the Meta Developer App, or wait a few hours and try again.');
    }

    // Find the page linked to an Instagram Business account
    let igBusinessId = null;
    let igHandle = null;

    for (const page of pages) {
      // Check if instagram_business_account was already returned in the fields
      if (page.instagram_business_account) {
        igBusinessId = page.instagram_business_account.id;
      } else {
        // Fetch it separately using the page's own access token
        const pageToken = page.access_token || longToken;
        const igResponse = await axios.get(`https://graph.facebook.com/v21.0/${page.id}`, {
          params: {
            fields: 'instagram_business_account',
            access_token: pageToken
          }
        });
        if (igResponse.data.instagram_business_account) {
          igBusinessId = igResponse.data.instagram_business_account.id;
        }
      }

      if (igBusinessId) {
        // Get the IG handle/username
        const igInfo = await axios.get(`https://graph.facebook.com/v21.0/${igBusinessId}`, {
          params: {
            fields: 'username,profile_picture_url,followers_count',
            access_token: longToken
          }
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
      .select()
      .single();

    if (error) throw error;

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
