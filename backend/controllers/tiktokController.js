const tiktokService = require('../services/tiktokService');

/**
 * Exchange authorization code for access token or refresh token
 * POST /api/tiktok/oauth2/token
 * Body: { auth_code: "...", grant_type: "authorization_code" }
 * or Body: { refresh_token: "...", grant_type: "refresh_token" }
 */
exports.searchPosts = async (req, res) => {
    try {
        const { keyword, page = 1, limit = 10, clientId } = req.query;

        // Validate keyword parameter
        if (!keyword) {
            return res.status(400).json({
                success: false,
                error: 'Keyword parameter is required',
                usage: `GET /api/TikTok/search?keyword=${keyword}&page=1&limit=10`,
            });
        }

        const pageNum = parseInt(page, 10) || 1;
        const limitNum = parseInt(limit, 10) || 10;

        console.log(`\n📡 API Request: Search for "${keyword}" (page ${pageNum}, limit ${limitNum})`);

        // Search for posts using Graph API
        let posts = [];

        // searchByKeyword always returns an object with hashtagPosts and mentionPosts
        const searchResults = await tiktokService.searchPostsByHashTag(keyword, clientId);

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
                    console.log(`📅 Client ${clientId} last_checked updated (api/TikTok/search).`);
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
                message: 'TikTok limits hashtag searches to 30 unique hashtags per 7 days',
                details: error.response?.data?.error?.message || error.message,
            });
        }

        if (error.response?.data?.error?.code === 190) {
            return res.status(401).json({
                success: false,
                error: 'Access token expired or invalid',
                message: 'Please refresh your TikTok access token',
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