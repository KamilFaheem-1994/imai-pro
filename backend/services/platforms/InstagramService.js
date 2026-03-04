const BasePlatformService = require('./BasePlatformService');

/**
 * InstagramService — wraps IMAI IG raw-API endpoints and normalises
 * every response into the common creator/post shape used across the app.
 */
class InstagramService extends BasePlatformService {
  // ------------------------------------------------------------------
  //  Normalisation helpers
  // ------------------------------------------------------------------

  /**
   * Normalise a single IG hashtag-feed item (post) into the common shape.
   */
  _normalisePost(item) {
    const user = item.user || {};
    return {
      username: user.username || 'unknown',
      fullName: user.full_name || null,
      profilePicUrl: user.profile_pic_url || null,
      platform: 'instagram',
      platformUserId: user.pk ? String(user.pk) : null,
      isVerified: user.is_verified || false,
      followersCount: user.follower_count || null,
      engagement: {
        likes: item.like_count || 0,
        comments: item.comment_count || 0,
      },
      postId: item.code || item.pk || null,
      caption: item.caption?.text || null,
      mediaUrl: item.display_url || null,
      permalink: item.code
        ? `https://www.instagram.com/p/${item.code}/`
        : null,
    };
  }

  /**
   * Normalise an IG user-search result into the common shape.
   */
  _normaliseUser(user) {
    return {
      username: user.username || 'unknown',
      fullName: user.full_name || null,
      profilePicUrl: user.profile_pic_url || null,
      platform: 'instagram',
      platformUserId: user.pk ? String(user.pk) : null,
      isVerified: user.is_verified || false,
      followersCount: user.follower_count || null,
      engagement: {
        likes: 0,
        comments: 0,
      },
      postId: null,
      caption: null,
      mediaUrl: user.profile_pic_url || null,
      permalink: user.username
        ? `https://www.instagram.com/${user.username}/`
        : null,
    };
  }

  // ------------------------------------------------------------------
  //  Public API
  // ------------------------------------------------------------------

  /**
   * Search IG hashtag feed.
   * @param {string} tag — hashtag without #
   * @returns {Promise<Array>}
   */
  async searchByHashtag(tag) {
    const response = await this.imai.igHashtagFeed(tag);
    const items = Array.isArray(response)
      ? response
      : (response?.items || response?.result || []);
    return items.map((item) => this._normalisePost(item));
  }

  /**
   * Search IG users by keyword.
   * @param {string} username
   * @returns {Promise<Array>}
   */
  async searchByUser(username) {
    const response = await this.imai.igSearchUsers(username);
    const users = Array.isArray(response)
      ? response
      : (response?.users || response?.result?.users || response?.result || []);
    return users.map((user) => this._normaliseUser(user));
  }

  /**
   * Get detailed info for a single IG user.
   * @param {string} username
   * @returns {Promise<object>}
   */
  async getUserInfo(username) {
    const response = await this.imai.igUserInfo(username);
    const user = response?.user || response?.result?.user || response?.result || response || {};
    return this._normaliseUser(user);
  }
}

module.exports = InstagramService;
