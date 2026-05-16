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
