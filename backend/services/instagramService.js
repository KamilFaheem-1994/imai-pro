const axios = require('axios');
const db = require('../config/database');
require('dotenv').config();

class InstagramService {

    /**
     * Search Instagram posts by keyword (hashtag or mention)
     * @param {string} keyword - The keyword to search
     * @param {string} clientId - Optional client ID to associate posts with
     * @returns {Promise<Object>} Search results with posts
     */
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
                const hashtagResults = await this.searchPostByHashtag_API_Direct(cleanKeyword, clientId);
                results.hashtagPosts = hashtagResults.posts;
            }

            results.totalPosts = results.hashtagPosts.length + results.mentionPosts.length;
            return results;
        } catch (error) {
            console.error('❌ Search error:', error.message);
            throw error;
        }
    }

    /**
     * Fetch Instagram user info from IMAI API by author username
     * @param {string} author - Instagram username (e.g. "beingsrd")
     * @returns {Promise<Object|null>} IMAI user object or null on failure
     */
    async fetchImaiUserInfo(author) {
        const IMAI_API_KEY = process.env.IMAI_API_KEY;
        if (!IMAI_API_KEY) {
            console.warn("[Instagram] IMAI_API_KEY not set; skipping IMAI user info fetch");
            return null;
        }
        try {
            const profileUrl = `https://instagram.com/${encodeURIComponent(author)}`;
            const res = await axios.get("https://imai.co/api/raw/ig/user/info/", {
                params: { url: profileUrl },
                headers: {
                    accept: "application/json",
                    authkey: IMAI_API_KEY,
                },
                timeout: 15000,
            });
            if (res.data?.status === "ok" && res.data?.user) {
                return res.data.user;
            }
            return null;
        } catch (err) {
            console.warn(`[Instagram] IMAI user info failed for @${author}:`, err.response?.status || err.message);
            return null;
        }
    }

    /**
     * Search posts by hashtag via apidirect.io, then enrich each post with IMAI user info and save as TrackedCreators
     * @param {string} hashtag - The hashtag to search (without #)
     * @param {string} clientId - Optional client ID to associate posts with
     * @returns {Promise<Object>} { hashtag, total, posts }
     */
    async searchPostByHashtag_API_Direct(hashtag, clientId = null) {
        try {
            if (!hashtag) {
                throw new Error("hashtag is required");
            }

            const API_KEY = process.env.API_KEY;
            const hashtagResponse = await axios.get(
                "https://apidirect.io/v1/instagram/posts",
                {
                    params: { query: hashtag, pages: 1 },
                    headers: API_KEY ? { "X-API-Key": API_KEY } : {},
                    timeout: 20000,
                }
            );

            const rawPosts = hashtagResponse.data?.posts ?? [];
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
                        username: userObj?.username ?? author,
                        fullName: userObj?.full_name ?? null,
                        profilePicUrl: userObj?.profile_pic_url ?? userObj?.profile_pic_url_hd ?? null,
                        platform: "instagram",
                        sourceType: "hashtag",
                        sourceValue: hashtag,
                        postId,
                        postCaption: post.snippet ?? null,
                        postMediaUrl: post.url ?? null,
                        permalink: post.url ?? null,
                        engagement: {
                            followers: userObj?.follower_count ?? 0,
                            followings: userObj?.following_count ?? 0,
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
            console.error("error ", error.response?.data || error.message);
            return {
                hashtag,
                total: 0,
                posts: [],
                error: error.message || "Failed to fetch public Instagram posts",
            };
        }
    }
}

module.exports = new InstagramService();
