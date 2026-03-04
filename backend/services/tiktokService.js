const axios = require('axios');
const db = require('../config/database');

/**
 * TikTok Business API Service
 * Handles TikTok API operations
 */
class TikTokService {
    constructor() {
        this.clientKey = process.env.TT_CLIENT_KEY;
        this.clientSecret = process.env.TT_CLIENT_SECRET;
        this.redirectUri = process.env.TT_REDIRECT_URI;
        this.baseUrl = 'https://business-api.tiktok.com/open_api/v1.3';
    }

    async searchPostsByHashTag(hashtag, clientId = null) {
        try {
            const API_KEY = process.env.API_KEY;

            if (!API_KEY) {
                throw new Error('APIFY_TOKEN is not configured in environment variables');
            }

            if (!hashtag) {
                throw new Error('Hashtag is required for searching');
            }

            console.log(`📡 Searching TikTok posts for #${hashtag}`);

            // Use Apify synchronous endpoint
            const hashtagResponse = await axios.get(
                "https://apidirect.io/v1/tiktok/videos",
                {
                    params: { query: hashtag, pages: 1, sort_by: "most_recent" },
                    headers: API_KEY ? { "X-API-Key": API_KEY } : {},
                    timeout: 20000,
                }
            );

            const rawPosts = hashtagResponse.data?.videos ?? [];
            console.log("apidirect response: %d posts------", rawPosts.length);

            if (rawPosts.length === 0) {
                return { hashtag, total: 0, posts: [] };
            }
            if (clientId) {
                const trackedCreators = [];
                for (const post of rawPosts) {
                    const author = post.author;
                    if (!author) continue;

                    const userObj = await this.fetchImaiUserInfo(author);
                    const postId = post.url ? post.url.replace(/\/$/, "") : post.title || `post_${author}_${Date.now()}`;
                    trackedCreators.push({
                        clientId,
                        username: userObj?.user.uniqueId ?? author,
                        fullName: userObj?.user.nickname ?? null,
                        profilePicUrl: userObj?.user.avatarMedium ?? userObj?.user.avatarMedium ?? null,
                        platform: "tiktok",
                        sourceType: "hashtag",
                        sourceValue: hashtag,
                        postId,
                        postCaption: post.snippet ?? null,
                        postMediaUrl: post.url ?? null,
                        permalink: post.url ?? null,
                        engagement: {
                            followers: userObj?.stats.followerCount ?? 0,
                            followings: userObj?.stats.followingCount ?? 0,
                        },
                    });
                }
                console.log("Inserting into database");
                if (trackedCreators.length > 0) {
                    await db.bulkUpsertTrackedCreators(trackedCreators);
                    console.log("Inserted into database");
                }
            }

            return {
                hashtag,
                total: rawPosts.length,
                posts: rawPosts,
            };

        } catch (error) {
            console.error('❌ TikTok Search Error:', error.response?.data || error.message);

            throw {
                success: false,
                error: "Failed to fetch TikTok posts",
                message: error.message,
                details: error.response?.data || null
            };
        }
    }

    async fetchImaiUserInfo(author) {
        const IMAI_API_KEY = process.env.IMAI_API_KEY;
        if (!IMAI_API_KEY) {
            console.warn("[Instagram] IMAI_API_KEY not set; skipping IMAI user info fetch");
            return null;
        }
        try {
            const res = await axios.get("https://imai.co/api/raw/tt/user/info/", {
                params: { url: author },
                headers: {
                    accept: "application/json",
                    authkey: IMAI_API_KEY,
                },
                timeout: 15000,
            });
            if (res.data?.success === true && res.data?.user_info?.userInfo) {
                return res.data?.user_info?.userInfo;
            }
            return null;
        } catch (err) {
            console.warn(`[Instagram] IMAI user info failed for @${author}:`, err.response?.status || err.message);
            return null;
        }
    }


    async searchByKeyword(keyword, clientId = null) {
        const results = {
            keyword,
            hashtagPosts: [],
            mentionPosts: [],
            totalPosts: 0,
        };

        const isHashtagOnly = keyword.trim().startsWith('#');
        const isMentionOnly = keyword.trim().startsWith('@');
        const cleanKeyword = keyword.replace(/^[@#]/, '').trim();

        if (!cleanKeyword) {
            throw new Error('Please provide a valid keyword');
        }

        try {
            if (isHashtagOnly || (!isHashtagOnly && !isMentionOnly)) {
                const hashtagResults = await this.searchPostsByHashTag(cleanKeyword, clientId);
                results.hashtagPosts = hashtagResults.posts;
            }

            results.totalPosts = results.hashtagPosts.length + results.mentionPosts.length;
            return results;
        } catch (error) {
            console.error('❌ Search error:', error.message);
            throw error;
        }
    }

}

module.exports = new TikTokService();
