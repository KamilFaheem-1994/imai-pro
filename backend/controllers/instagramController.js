const { addTrackedCreators, getSettingValue } = require('../services/dbService');
const { ImaiApiService, ImaiApiError } = require('../services/imaiApiService');
const instagramService = require('../services/instagramService');
const clientCheckScheduler = require('../services/clientCheckScheduler');

/**
 * Instagram webhook verification (Meta Messenger Platform).
 * GET /api/instagram/webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
 * @see https://developers.facebook.com/docs/graph-api/webhooks/getting-started
 */
exports.webhook = (req, res) => {  //http://localhost:4000/api/instagram/webhook/verifytoken
    try{
    if(req.method === "GET"){
      console.log('[Instagram Webhook] Received GET webhook for verification:', req.query);
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];

      const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN || 'instagram_story_mention_verify';

      if (mode === 'subscribe' && token === verifyToken) {
          console.log('[Instagram Webhook] Verification successful');
          res.status(200).send(challenge);
      } else {
          console.warn('[Instagram Webhook] Verification failed: mode or token mismatch');
          res.status(403).send('Forbidden');
      }
    }
    else if(req.method === "POST"){
      console.log('[Instagram Webhook] Received POST webhook:', JSON.stringify(req.body));
      const body = req.body;
      // Validate webhook payload
      if (!body || !body.entry) {
          console.warn('[Instagram Webhook] Invalid payload structure');
          return res.status(400).json({ success: false, error: 'Invalid payload' });
      }
      // Process entries asynchronously
      body.entry.forEach((entry) => {
          // Handle live comments
          if (entry.changes) {
              entry.changes.forEach((change) => {
                  if (change.field === 'live_comments') {
                      handleLiveComment(change.value);
                  }
              });
          }

          // Handle story mentions and other messaging events
          if (entry.messaging) {
              entry.messaging.forEach((msg) => {
                  handleStoryMention(msg);
              });
          }
      });
      // Return 200 OK immediately to acknowledge receipt
      res.status(200).json({ success: true, body: body });
    }
  }
  catch (error) {
      console.error('[Instagram Webhook] Error processing webhook:', error.message);
      res.status(500).json({ success: false, error: error.message });
  }
};
/**
 * Handle live comment from Instagram live stream.
 * 
 * @param {object} liveComment - { from: { id, username, self_ig_scoped_id }, media: { id, media_product_type }, id, text }
 */
function handleLiveComment(liveComment) {
    try {
        console.log('[Live Comment] Received:', {
            username: liveComment.from?.username,
            userId: liveComment.from?.id,
            mediaId: liveComment.media?.id,
            mediaType: liveComment.media?.media_product_type,
            commentId: liveComment.id,
            text: liveComment.text,
        });

        // TODO: Store live comment in database
        // TODO: Trigger any business logic (e.g., notifications, analytics)

        // Example: Could add tracking creator if not already tracked
        if (liveComment.from?.username) {
            console.log(`[Live Comment] Creator: @${liveComment.from.username}`);
            // Could call addTrackedCreators here if needed
        }
    } catch (error) {
        console.error('[Live Comment] Error handling comment:', error.message);
    }
}

/**
 * Handle story mention from Instagram.
 * 
 * @param {object} message - { sender, recipient, message }
 */
function handleStoryMention(message) {
    try {
        console.log('[Story Mention] Received:', {
            sender: message.sender?.id,
            recipient: message.recipient?.id,
            text: message.message?.text,
        });

        // TODO: Store story mention in database
        // TODO: Trigger any business logic
    } catch (error) {
        console.error('[Story Mention] Error handling mention:', error.message);
    }
}


/**
 * Transform IMAI IG hashtag feed response into the standard post shape
 * expected by the rest of the controller (tracked_creators insertion, response).
 *
 * @param {object}  response  — raw response from ImaiApiService.igHashtagFeed()
 * @param {string}  keyword   — the original search keyword (e.g. "#fashion")
 * @returns {{ keyword: string, totalPosts: number, hashtagPosts: Array, mentionPosts: Array }}
 */
function transformImaiHashtagResults(response, keyword) {
    const items = Array.isArray(response) ? response : (response?.items || response?.result || []);

    const posts = items.map((item) => ({
        postId: item.code || item.pk || null,
        shortcode: item.code || null,
        creator: {
            username: item.user?.username || 'unknown',
            fullName: item.user?.full_name || null,
            profilePicUrl: item.user?.profile_pic_url || null,
            isVerified: item.user?.is_verified || false,
            userId: item.user?.pk || null,
        },
        content: {
            caption: item.caption?.text || null,
            displayUrl: item.display_url || null,
            thumbnailUrl: item.display_url || null,
            mediaType: 'Photo',
            isVideo: false,
            videoUrl: null,
        },
        engagement: {
            likes: item.like_count || 0,
            comments: item.comment_count || 0,
        },
        timestamp: item.taken_at || null,
        date: item.taken_at ? new Date(item.taken_at * 1000).toISOString() : null,
        permalink: item.code ? `https://www.instagram.com/p/${item.code}/` : null,
        searchInfo: {
            searchType: 'hashtag',
            searchTerm: keyword,
        },
    }));

    return {
        keyword,
        totalPosts: posts.length,
        hashtagPosts: posts,
        mentionPosts: [],
    };
}

/**
 * Transform IMAI IG user search response into the standard post shape.
 *
 * User search returns profile objects, not posts.  We normalise each user
 * into a pseudo-post so that the downstream tracked_creators insertion
 * works identically.
 *
 * @param {object}  response  — raw response from ImaiApiService.igSearchUsers()
 * @param {string}  keyword   — the original search keyword (e.g. "@fitness")
 * @returns {{ keyword: string, totalPosts: number, hashtagPosts: Array, mentionPosts: Array }}
 */
function transformImaiUserResults(response, keyword) {
    const users = Array.isArray(response)
        ? response
        : (response?.users || response?.result?.users || response?.result || []);

    const posts = users.map((user) => ({
        postId: String(user.pk || user.username || ''),
        shortcode: null,
        creator: {
            username: user.username || 'unknown',
            fullName: user.full_name || null,
            profilePicUrl: user.profile_pic_url || null,
            isVerified: user.is_verified || false,
            userId: user.pk || null,
            followerCount: user.follower_count || 0,
        },
        content: {
            caption: null,
            displayUrl: user.profile_pic_url || null,
            thumbnailUrl: user.profile_pic_url || null,
            mediaType: 'Profile',
            isVideo: false,
            videoUrl: null,
        },
        engagement: {
            likes: 0,
            comments: 0,
        },
        timestamp: null,
        date: null,
        permalink: user.username ? `https://www.instagram.com/${user.username}/` : null,
        searchInfo: {
            searchType: 'username',
            searchTerm: keyword,
        },
    }));

    return {
        keyword,
        totalPosts: posts.length,
        hashtagPosts: [],
        mentionPosts: posts,
    };
}

/**
 * Transform IMAI TikTok challenge (hashtag) feed response.
 *
 * @param {object}  response  — raw response from ImaiApiService.ttChallengeFeed()
 * @param {string}  keyword   — the original search keyword (e.g. "#dance")
 * @returns {{ keyword: string, totalPosts: number, hashtagPosts: Array, mentionPosts: Array }}
 */
function transformImaiTTChallengeResults(response, keyword) {
    const items = Array.isArray(response)
        ? response
        : (response?.challenge_feed?.itemList
            || response?.itemList
            || response?.items
            || response?.result?.items
            || response?.result
            || []);

    const posts = items.map((item) => {
        const author = item.author || item.user || {};
        return {
            postId: item.id || item.aweme_id || null,
            shortcode: item.id || item.aweme_id || null,
            creator: {
                username: author.unique_id || author.uniqueId || author.username || 'unknown',
                fullName: author.nickname || null,
                profilePicUrl: author.avatar_thumb?.url_list?.[0] || author.avatarThumb || null,
                isVerified: author.is_verified || false,
                userId: author.uid || author.id || null,
            },
            content: {
                caption: item.desc || item.title || null,
                displayUrl: item.video?.cover?.url_list?.[0] || item.cover || null,
                thumbnailUrl: item.video?.cover?.url_list?.[0] || item.cover || null,
                mediaType: 'Video',
                isVideo: true,
                videoUrl: item.video?.play_addr?.url_list?.[0] || null,
            },
            engagement: {
                likes: item.statistics?.digg_count || item.stats?.diggCount || 0,
                comments: item.statistics?.comment_count || item.stats?.commentCount || 0,
            },
            timestamp: item.create_time || null,
            date: item.create_time ? new Date(item.create_time * 1000).toISOString() : null,
            permalink: (author.unique_id || author.uniqueId) && (item.id || item.aweme_id)
                ? `https://www.tiktok.com/@${author.unique_id || author.uniqueId}/video/${item.id || item.aweme_id}`
                : null,
            searchInfo: {
                searchType: 'hashtag',
                searchTerm: keyword,
            },
        };
    });

    return {
        keyword,
        totalPosts: posts.length,
        hashtagPosts: posts,
        mentionPosts: [],
    };
}

/**
 * Transform IMAI TikTok user search response.
 *
 * @param {object}  response  — raw response from ImaiApiService.ttSearchUsers()
 * @param {string}  keyword   — the original search keyword (e.g. "@dancer")
 * @returns {{ keyword: string, totalPosts: number, hashtagPosts: Array, mentionPosts: Array }}
 */
function transformImaiTTUserResults(response, keyword) {
    const userList = Array.isArray(response)
        ? response
        : (response?.user_list || response?.result?.user_list || response?.result || []);

    const posts = userList.map((entry) => {
        const userInfo = entry.user_info || entry;
        return {
            postId: String(userInfo.uid || userInfo.unique_id || ''),
            shortcode: null,
            creator: {
                username: userInfo.unique_id || userInfo.uniqueId || 'unknown',
                fullName: userInfo.nickname || null,
                profilePicUrl: userInfo.avatar_thumb?.url_list?.[0] || null,
                isVerified: false,
                userId: userInfo.uid || null,
                followerCount: userInfo.follower_count || 0,
            },
            content: {
                caption: null,
                displayUrl: userInfo.avatar_thumb?.url_list?.[0] || null,
                thumbnailUrl: userInfo.avatar_thumb?.url_list?.[0] || null,
                mediaType: 'Profile',
                isVideo: false,
                videoUrl: null,
            },
            engagement: {
                likes: 0,
                comments: 0,
            },
            timestamp: null,
            date: null,
            permalink: userInfo.unique_id
                ? `https://www.tiktok.com/@${userInfo.unique_id}`
                : null,
            searchInfo: {
                searchType: 'username',
                searchTerm: keyword,
            },
        };
    });

    return {
        keyword,
        totalPosts: posts.length,
        hashtagPosts: [],
        mentionPosts: posts,
    };
}

// ------------------------------------------------------------------ //
//  IMAI API search dispatcher                                          //
// ------------------------------------------------------------------ //

/**
 * Execute a search using the IMAI REST API.
 *
 * @param {string} apiKey       — IMAI authkey
 * @param {string} keyword      — raw keyword (may start with # or @)
 * @param {string} platform     — "instagram" | "tiktok"
 * @returns {Promise<{ keyword, totalPosts, hashtagPosts, mentionPosts }>}
 */
async function searchViaImaiApi(apiKey, keyword, platform) {
    const imai = new ImaiApiService(apiKey);

    const isHashtag = keyword.startsWith('#');
    const cleanKeyword = keyword.replace(/^[#@]/, '').trim();

    if (platform === 'tiktok') {
        if (isHashtag) {
            // Step 1: Resolve hashtag name → numeric challengeId
            console.log(`   [IMAI API] TikTok challenge info for: ${cleanKeyword}`);
            const info = await imai.ttChallengeInfo(cleanKeyword);
            const challengeId =
                info?.challenge?.challengeInfo?.challenge?.id
                || info?.challenge?.id
                || info?.ch_info?.cid
                || info?.id
                || null;

            if (!challengeId) {
                console.warn(`   [IMAI API] Could not resolve challengeId for "${cleanKeyword}", falling back to name`);
            }

            // Step 2: Fetch feed using challengeId (or fall back to name)
            const feedParam = challengeId || cleanKeyword;
            console.log(`   [IMAI API] TikTok challenge feed for: ${feedParam}`);
            const response = await imai.ttChallengeFeed(feedParam);
            return transformImaiTTChallengeResults(response, keyword);
        } else {
            console.log(`   [IMAI API] TikTok user search for: ${cleanKeyword}`);
            const response = await imai.ttSearchUsers(cleanKeyword);
            return transformImaiTTUserResults(response, keyword);
        }
    }

    // Default: Instagram
    if (isHashtag) {
        console.log(`   [IMAI API] IG hashtag feed for: ${cleanKeyword}`);
        const response = await imai.igHashtagFeed(cleanKeyword);
        return transformImaiHashtagResults(response, keyword);
    } else {
        console.log(`   [IMAI API] IG user search for: ${cleanKeyword}`);
        const response = await imai.igSearchUsers(cleanKeyword);
        return transformImaiUserResults(response, keyword);
    }
}

// ------------------------------------------------------------------ //
//  Controller exports                                                  //
// ------------------------------------------------------------------ //

/**
 * Search posts by keyword (hashtag or username) with pagination.
 *
 * GET /api/instagram/search?keyword={keyword}&clientId={id}&platform={platform}
 *
 * Query parameters:
 *   keyword   (required)  — search term, prefix with # for hashtag or @ for username
 *   clientId  (optional)  — UUID of client; when provided, results are saved to tracked_creators
 *   platform  (optional)  — "instagram" (default) | "tiktok"
 */
exports.searchPosts = async (req, res) => {
    try {
        const { keyword, page = 1, limit = 10, clientId } = req.query;

        // Validate keyword parameter
        if (!keyword) {
            return res.status(400).json({
                success: false,
                error: 'Keyword parameter is required',
                usage: 'GET /api/instagram/search?keyword=travel&page=1&limit=10',
            });
        }

        const pageNum = parseInt(page, 10) || 1;
        const limitNum = parseInt(limit, 10) || 10;

        console.log(`\n📡 API Request: Search for "${keyword}" (page ${pageNum}, limit ${limitNum})`);

        // Search for posts using Graph API
        let posts = [];

        // searchByKeyword always returns an object with hashtagPosts and mentionPosts
        const searchResults = await instagramService.searchPostByHashtag_API_Direct(keyword, clientId);

        if (searchResults && typeof searchResults === 'object' && !Array.isArray(searchResults)) {
            // For hashtags, use hashtagPosts; for mentions, use mentionPosts; for both, combine them
            if (keyword.startsWith('#')) {
                posts = searchResults.hashtagPosts || [];
            } else if (keyword.startsWith('@')) {
                posts = searchResults.mentionPosts || [];
            } else {
                // Combine hashtagPosts and mentionPosts into a single array
                posts = [...(searchResults.hashtagPosts || []), ...(searchResults.mentionPosts || [])];
            }
        } else if (Array.isArray(searchResults)) {
            // Fallback: if it's already an array, use it directly
            posts = searchResults;
        }

        // Apply pagination
        const startIndex = (pageNum - 1) * limitNum;
        const endIndex = startIndex + limitNum;
        const paginatedPosts = posts.slice(startIndex, endIndex);
        const totalPosts = posts.length;
        const totalPages = Math.ceil(totalPosts / limitNum);

        // Update client last_checked when search is called for a client
        if (clientId) {
            try {
                const updated = await clientCheckScheduler.updateClientLastChecked(clientId);
                if (updated) {
                    console.log(`📅 Client ${clientId} last_checked updated (api/instagram/search).`);
                }
            } catch (dbErr) {
                console.warn('Could not update client last_checked:', dbErr.message);
            }
        }

        // Response
        return res.status(200).json({
            success: true,
            data: {
                keyword: keyword,
                totalPosts,
                page: pageNum,
                limit: limitNum,
                totalPages,
                hasMore: pageNum < totalPages,
                posts: paginatedPosts,
            },
            message: `Found ${totalPosts} posts for keyword "${keyword}" (showing ${paginatedPosts.length})`,
        });
    } catch (error) {
        console.error('❌ Search API Error:', error.message);

        // Handle Graph API specific errors
        if (error.response?.data?.error?.code === 24) {
            return res.status(429).json({
                success: false,
                error: 'Hashtag search limit reached',
                message: 'Instagram limits hashtag searches to 30 unique hashtags per 7 days',
                details: error.response?.data?.error?.message || error.message,
            });
        }

        if (error.response?.data?.error?.code === 190) {
            return res.status(401).json({
                success: false,
                error: 'Access token expired or invalid',
                message: 'Please refresh your Instagram access token',
                details: error.response?.data?.error?.message || error.message,
            });
        }

        if (error.message.includes('rate') || error.message.includes('limit')) {
            return res.status(429).json({
                success: false,
                error: 'Rate limit exceeded',
                message: 'Please wait a few minutes before trying again',
                details: error.message,
            });
        }

        // Generic error
        return res.status(500).json({
            success: false,
            error: 'Search failed',
            message: error.message,
        });
    }
};
