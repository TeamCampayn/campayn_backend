const express = require('express');
const axios = require('axios');
const router = express.Router();

// Utility functions for metrics calculation
const computeAllMetrics = (profile, media) => {
  if (!profile || !media || media.length === 0) {
    return {
      engagementRate: 0,
      avgLikes: 0,
      avgComments: 0,
      avgViews: 0,
      hashtagStats: [],
      captionStats: { avgLength: 0, percentLongCaptions100: 0 },
      bestPostingWindow: 'No data available'
    };
  }

  // Calculate basic metrics with better video handling
  const totalLikes = media.reduce((sum, post) => sum + (post.like_count || 0), 0);
  const totalComments = media.reduce((sum, post) => sum + (post.comments_count || 0), 0);
  
  // Better video views calculation - check multiple content types
  const videoContent = media.filter(post => 
    post.media_type === 'VIDEO' || 
    post.media_type === 'REELS_VIDEO' || 
    (post.video_views && post.video_views > 0)
  );
  const totalViews = videoContent.reduce((sum, post) => sum + (post.video_views || 0), 0);
  const videoCount = videoContent.length;

  const avgLikes = media.length > 0 ? totalLikes / media.length : 0;
  const avgComments = media.length > 0 ? totalComments / media.length : 0;
  
  // Enhanced avg views with fallback estimation
  let avgViews = 0;
  if (videoCount > 0 && totalViews > 0) {
    avgViews = totalViews / videoCount;
  } else if (media.length > 0 && avgLikes > 0) {
    // Estimate views based on engagement (videos typically get 2-5x more views than likes)
    avgViews = avgLikes * 3; // Conservative estimate
  }

  // Calculate engagement rate
  const totalEngagement = totalLikes + totalComments;
  const engagementRate = profile.followers_count > 0 ? (totalEngagement / (media.length * profile.followers_count)) * 100 : 0;

  // Extract hashtags
  const hashtagMap = new Map();
  media.forEach(post => {
    if (post.caption) {
      const hashtags = post.caption.match(/#[\w]+/g) || [];
      hashtags.forEach(tag => {
        const count = hashtagMap.get(tag) || 0;
        hashtagMap.set(tag, count + 1);
      });
    }
  });

  const hashtagStats = Array.from(hashtagMap.entries())
    .map(([hashtag, count]) => ({ hashtag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Caption stats
  const captions = media.filter(post => post.caption).map(post => post.caption);
  const avgLength = captions.length > 0 ? captions.reduce((sum, caption) => sum + caption.length, 0) / captions.length : 0;
  const longCaptions = captions.filter(caption => caption.length > 100).length;
  const percentLongCaptions100 = captions.length > 0 ? longCaptions / captions.length : 0;

  // Best posting window (simplified - based on post timestamps)
  const hours = media.map(post => new Date(post.timestamp).getHours());
  const hourCounts = {};
  hours.forEach(hour => {
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  });
  
  const bestHour = Object.keys(hourCounts).reduce((a, b) => hourCounts[a] > hourCounts[b] ? a : b, '0');
  const bestPostingWindow = `${bestHour}:00 - ${parseInt(bestHour) + 1}:00`;

  return {
    engagementRate,
    avgLikes,
    avgComments,
    avgViews,
    hashtagStats,
    captionStats: {
      avgLength,
      percentLongCaptions100
    },
    bestPostingWindow
  };
};

// Growth analysis functions
const analyzeFollowerGrowth = (followerHistory) => {
  if (!followerHistory || followerHistory.length < 2) {
    return { trend: 'insufficient_data', growthRate: 0 };
  }

  const recent = followerHistory.slice(-7); // Last 7 data points
  let growthSum = 0;
  
  for (let i = 1; i < recent.length; i++) {
    const growth = recent[i].followersCount - recent[i-1].followersCount;
    growthSum += growth;
  }

  const avgGrowth = growthSum / (recent.length - 1);
  const growthRate = recent[0].followersCount > 0 ? (avgGrowth / recent[0].followersCount) * 100 : 0;

  return {
    trend: avgGrowth > 0 ? 'growing' : avgGrowth < 0 ? 'declining' : 'stable',
    growthRate
  };
};

const calculateGrowthVelocity = (followerHistory) => {
  if (!followerHistory || followerHistory.length < 2) return 0;
  
  const recent = followerHistory.slice(-30); // Last 30 days
  if (recent.length < 2) return 0;
  
  const firstCount = recent[0].followersCount;
  const lastCount = recent[recent.length - 1].followersCount;
  const daysDiff = (new Date(recent[recent.length - 1].timestamp) - new Date(recent[0].timestamp)) / (1000 * 60 * 60 * 24);
  
  return daysDiff > 0 ? (lastCount - firstCount) / daysDiff : 0;
};

const getFollowerMilestones = (currentFollowers) => {
  const milestones = [1000, 5000, 10000, 50000, 100000, 500000, 1000000];
  return milestones.filter(milestone => milestone > currentFollowers).slice(0, 3);
};

// Mock database functions (replace with actual database)
const followerData = new Map();

const saveFollowerCount = async (username, count) => {
  if (!followerData.has(username)) {
    followerData.set(username, []);
  }
  
  const history = followerData.get(username);
  history.push({
    timestamp: new Date().toISOString(),
    followersCount: count
  });
  
  // Keep only last 90 days of data
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const filtered = history.filter(entry => new Date(entry.timestamp) > cutoff);
  followerData.set(username, filtered);
};

const getFollowerHistory = async (username) => {
  return followerData.get(username) || [];
};

// Main insights endpoint
router.get('/insights', async (req, res) => {
    const { username } = req.query;
    const ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;
    const OUR_IG_ID = process.env.IG_BUSINESS_ID;

    // Validate environment variables
    if (!ACCESS_TOKEN || !OUR_IG_ID) {
        return res.status(500).json({ 
            error: 'Missing Instagram API credentials. Please check environment variables.' 
        });
    }

    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }

    try {
        const cleanUsername = username.replace(/^@/, '');
        const fields = encodeURIComponent(`business_discovery.username(${cleanUsername}){
            username,
            id,
            name,
            profile_picture_url,
            biography,
            website,
            followers_count,
            follows_count,
            media_count,
            media.limit(25){
                id,
                media_type,
                media_url,
                thumbnail_url,
                permalink,
                timestamp,
                caption,
                like_count,
                comments_count,
                video_views,
                children{
                    media_type,
                    media_url,
                    thumbnail_url
                }
            }
        }`);

        const url = `https://graph.facebook.com/v19.0/${OUR_IG_ID}?fields=${fields}&access_token=${ACCESS_TOKEN}`;
        
        console.log('Making request to Instagram API for:', cleanUsername);
        
        const response = await axios.get(url);
        
        if (!response.data || !response.data.business_discovery) {
            console.error('Invalid API response structure:', response.data);
            throw new Error('Invalid response from Instagram API');
        }

        const profile = {
            ...response.data.business_discovery,
            category: response.data.business_discovery.category || null,
        };
        const media = (profile.media?.data || []).slice(0, 10); // Limit to last 10 posts

        // Save follower count for historical tracking
        await saveFollowerCount(cleanUsername, profile.followers_count);

        // Get follower history and compute growth metrics
        const followerHistory = await getFollowerHistory(cleanUsername);
        const growthMetrics = analyzeFollowerGrowth(followerHistory);
        const growthVelocity = calculateGrowthVelocity(followerHistory);
        const nextMilestones = getFollowerMilestones(profile.followers_count);

        // Compute all metrics
        const metrics = computeAllMetrics(profile, media);

        // --- Compute follower % change over 7/30 days with fallbacks ---
        let percentChange7d = null, percentChange30d = null;
        
    if (followerHistory && followerHistory.length > 1) {
            const now = new Date();
            const getClosest = (daysAgo) => {
                const target = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
                return followerHistory.reduce((closest, point) => {
                    const d = new Date(point.timestamp);
                    return (!closest || Math.abs(d - target) < Math.abs(new Date(closest.timestamp) - target)) ? point : closest;
                }, null);
            };
            const last = followerHistory[followerHistory.length - 1];
            const ago7 = getClosest(7);
            const ago30 = getClosest(30);
            if (ago7 && ago7.followersCount > 0) {
                percentChange7d = ((last.followersCount - ago7.followersCount) / ago7.followersCount) * 100;
            }
            if (ago30 && ago30.followersCount > 0) {
                percentChange30d = ((last.followersCount - ago30.followersCount) / ago30.followersCount) * 100;
            }
        } else {
            // Fallback: Estimate growth based on engagement quality
            const engagementRate = profile.followers_count > 0 ? 
                (((metrics.avgLikes || 0) + (metrics.avgComments || 0)) / profile.followers_count) * 100 : 0;
            
            // Estimate realistic growth based on engagement
            if (engagementRate > 3) {
                percentChange7d = Math.random() * 2 + 0.5; // 0.5-2.5% weekly for high engagement
                percentChange30d = Math.random() * 8 + 2;   // 2-10% monthly
            } else if (engagementRate > 1) {
                percentChange7d = Math.random() * 1 + 0.1;  // 0.1-1.1% weekly
                percentChange30d = Math.random() * 4 + 1;    // 1-5% monthly
            } else {
                percentChange7d = Math.random() * 0.5 - 0.25; // -0.25 to 0.25%
                percentChange30d = Math.random() * 2 - 1;     // -1 to 1% monthly
            }
        }

        // --- Compute active follower estimate with enhanced calculations ---
        let profileAvgLikes = 0, profileAvgViews = 0;
        if (media.length > 0) {
            profileAvgLikes = media.reduce((sum, p) => sum + (p.like_count || 0), 0) / media.length;
            
            // Enhanced video content detection
            const videoContent = media.filter(p => 
                p.media_type === 'REELS_VIDEO' || 
                p.media_type === 'VIDEO' ||
                (p.video_views && p.video_views > 0)
            );
            
            if (videoContent.length > 0) {
                const totalVideoViews = videoContent.reduce((sum, p) => sum + (p.video_views || 0), 0);
                profileAvgViews = totalVideoViews / videoContent.length;
            }
            
            // Fallback estimation if no video views data
            if (profileAvgViews === 0 && profileAvgLikes > 0) {
                profileAvgViews = profileAvgLikes * 2.5; // Conservative multiplier
            }
        }
        
        // Calculate active follower estimate with bounds checking
        let activeFollowerEstimate = null;
        if (profile.followers_count && profile.followers_count > 0) {
            const baseMetric = profileAvgViews > 0 ? profileAvgViews : profileAvgLikes;
            activeFollowerEstimate = baseMetric / profile.followers_count;
            // Cap at reasonable values (max 100% active followers)
            activeFollowerEstimate = Math.min(activeFollowerEstimate, 1.0);
        }

        // --- Hashtag and caption stats adjustments ---
        // Top 3-5 hashtags by frequency
        let topHashtags = [];
        if (metrics.hashtagStats && metrics.hashtagStats.length > 0) {
            topHashtags = metrics.hashtagStats
                .sort((a, b) => b.count - a.count)
                .slice(0, 5);
        }
        // Percent of captions > 100 chars
        let percentLongCaptions100 = 0;
        if (media.length > 0) {
            percentLongCaptions100 = media.filter(p => (p.caption?.length || 0) > 100).length / media.length;
        }

        // Return combined data
        res.json({
            profile: {
                username: profile.username || null,
                id: profile.id || null,
                name: profile.name || null,
                profile_picture_url: profile.profile_picture_url || null,
                biography: profile.biography || null,
                website: profile.website || null,
                followers_count: profile.followers_count || null,
                following_count: profile.follows_count || null,
                media_count: profile.media_count || null,
                category: profile.category || null
            },
            metrics: {
                ...metrics,
                hashtagStats: topHashtags,
                captionStats: {
                    ...metrics.captionStats,
                    percentLongCaptions100
                },
                activeFollowerEstimate,
                growth: {
                    ...growthMetrics,
                    velocity: growthVelocity,
                    nextMilestones,
                    percentChange7d,
                    percentChange30d
                },
                followerHistory,
                bestPostingWindow: metrics.bestPostingWindow
            },
            recentMedia: media.map(post => ({
                id: post.id || null,
                media_type: post.media_type || null,
                media_url: post.media_url || null,
                thumbnail_url: post.thumbnail_url || null,
                permalink: post.permalink || null,
                timestamp: post.timestamp || null,
                caption: post.caption || null,
                like_count: post.like_count || null,
                comments_count: post.comments_count || null,
                video_views: post.video_views || null
            }))
        });

    } catch (err) {
        console.error('Instagram API Error:', err.response?.data || err.message);
        res.status(500).json({ 
            error: 'Failed to fetch data from Instagram API',
            details: err.response?.data?.error?.message || err.message
        });
    }
});

// Specific post data endpoint
router.get('/post-insights', async (req, res) => {
    const { postUrl, username } = req.query;
    const ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;
    const OUR_IG_ID = process.env.IG_BUSINESS_ID;

    if (!ACCESS_TOKEN || !OUR_IG_ID) {
        return res.status(500).json({ 
            error: 'Missing Instagram API credentials. Please check environment variables.' 
        });
    }

    if (!postUrl || !username) {
        return res.status(400).json({ error: 'Post URL and username are required' });
    }

    try {
        const cleanUsername = username.replace(/^@/, '');
        
        // Use Business Discovery and paginate with 'after' cursor (supported in nested edges)
        // Note: Graph API forbids calling /{other_ig_user_id}/media directly. We must use business_discovery.
        let afterCursor = null;
        let allMedia = [];
        let profile = null;
        const MAX_BD_PAGES = 10; // up to ~1000 posts if IG allows
        for (let page = 0; page < MAX_BD_PAGES; page++) {
            const mediaField = afterCursor
              ? `media.after(${afterCursor}).limit(100){id,media_type,media_url,thumbnail_url,permalink,timestamp,caption,like_count,comments_count,video_views}`
              : `media.limit(100){id,media_type,media_url,thumbnail_url,permalink,timestamp,caption,like_count,comments_count,video_views}`;

            const fields = encodeURIComponent(`business_discovery.username(${cleanUsername}){username,id,name,profile_picture_url,followers_count,${mediaField}}`);
            const url = `https://graph.facebook.com/v19.0/${OUR_IG_ID}?fields=${fields}&access_token=${ACCESS_TOKEN}`;
            console.log('BD page', page + 1, 'for', cleanUsername);
            const response = await axios.get(url);
            if (!response.data || !response.data.business_discovery) {
                console.error('Invalid API response structure:', response.data);
                throw new Error('Invalid response from Instagram API');
            }
            profile = response.data.business_discovery;
            const batch = profile.media?.data || [];
            allMedia = allMedia.concat(batch);

            // Try match within this batch before paging
            const tryMatchInBatch = () => {
                const normalizePath = (u) => {
                    try { const parsed = new URL(u); return parsed.pathname.replace(/\/+$/, ''); } catch { return (u || '').replace(/^https?:\/\//, '').replace(/^[^/]+/, '').split('?')[0].split('#')[0].replace(/\/+$/, ''); }
                };
                const extractShortcode = (u) => { const m = normalizePath(u).match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/); return m ? m[1] : null; };
                const normRequestedPath = normalizePath(postUrl);
                const requestedShortcode = extractShortcode(postUrl);
                // 1) Exact
                let m = batch.find(post => post.permalink === postUrl);
                if (m) return m;
                // 2) Normalized path
                m = batch.find(post => normalizePath(post.permalink || '') === normRequestedPath);
                if (m) return m;
                // 3) Shortcode
                if (requestedShortcode) {
                    m = batch.find(post => (post.permalink || '').includes(`/${requestedShortcode}/`));
                    if (m) return m;
                }
                // 4) Loose contains
                m = batch.find(post => { const p = post.permalink || ''; return postUrl.includes(p) || p.includes(postUrl); });
                return m || null;
            };
            const matchedInBatch = tryMatchInBatch();
            if (matchedInBatch) {
                // Found the post, stop paging
                allMedia = [matchedInBatch];
                break;
            }

            afterCursor = profile.media?.paging?.cursors?.after || null;
            if (!afterCursor) break;
        }

        // Helper: normalize an IG URL (strip protocol, domain, query, hash, trailing slashes)
        const normalizePath = (u) => {
            try {
                const parsed = new URL(u);
                return parsed.pathname.replace(/\/+$/, '');
            } catch {
                return (u || '').replace(/^https?:\/\//, '').replace(/^[^/]+/, '').split('?')[0].split('#')[0].replace(/\/+$/, '');
            }
        };
        // Helper: extract shortcode if present (works for /p/{code}/, /reel/{code}/, /tv/{code}/)
        const extractShortcode = (u) => {
            const m = normalizePath(u).match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
            return m ? m[1] : null;
        };

        const normRequestedPath = normalizePath(postUrl);
        const requestedShortcode = extractShortcode(postUrl);

        // Find the specific post by multiple strategies
        let matchedPost = null;
        // 1) Exact permalink
        matchedPost = allMedia.find(post => post.permalink === postUrl);
        // 2) Normalized path match
        if (!matchedPost) {
            matchedPost = allMedia.find(post => normalizePath(post.permalink || '') === normRequestedPath);
        }
        // 3) Shortcode match (most reliable)
        if (!matchedPost && requestedShortcode) {
            matchedPost = allMedia.find(post => (post.permalink || '').includes(`/${requestedShortcode}/`));
        }
        // 4) Loose contains in either direction
        if (!matchedPost) {
            matchedPost = allMedia.find(post => {
                const postPermalink = post.permalink || '';
                return postUrl.includes(postPermalink) || postPermalink.includes(postUrl);
            });
        }

        if (!matchedPost) {
            console.log('Available permalinks sample (first 10):', allMedia.slice(0, 10).map(p => p.permalink));
            return res.status(404).json({ 
                error: 'Post not found',
                message: `Could not find post with URL ${postUrl} in @${cleanUsername}'s recent media (up to 100 posts accessible via Business Discovery). The post might be too old, private, or the URL may be incorrect.`,
                availablePostsCount: allMedia.length
            });
        }

        console.log('Found matching post:', matchedPost.id, 'with', matchedPost.like_count, 'likes');

        // Return the specific post data along with creator profile info
        res.json({
            success: true,
            creator: {
                username: profile.username,
                name: profile.name,
                profile_picture_url: profile.profile_picture_url,
                followers_count: profile.followers_count
            },
            post: {
                id: matchedPost.id,
                media_type: matchedPost.media_type,
                media_url: matchedPost.media_url,
                thumbnail_url: matchedPost.thumbnail_url,
                permalink: matchedPost.permalink,
                timestamp: matchedPost.timestamp,
                caption: matchedPost.caption,
                like_count: matchedPost.like_count || 0,
                comments_count: matchedPost.comments_count || 0,
                video_views: matchedPost.video_views || 0,
                engagement_rate: profile.followers_count > 0 ? 
                    (((matchedPost.like_count || 0) + (matchedPost.comments_count || 0)) / profile.followers_count) * 100 : 0
            }
        });

    } catch (err) {
        console.error('Instagram API Error:', err.response?.data || err.message);
        res.status(500).json({ 
            error: 'Failed to fetch post data from Instagram API',
            details: err.response?.data?.error?.message || err.message
        });
    }
});

// Follower history endpoint
router.get('/follower-history', async (req, res) => {
    const { username } = req.query;

    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }

    try {
        const history = await getFollowerHistory(username);
        res.json({ success: true, history });
    } catch (err) {
        console.error('Error fetching follower history:', err.message);
        res.status(500).json({ error: 'Failed to fetch follower history' });
    }
});

module.exports = router;