const BasePlatformService = require('./BasePlatformService');

/**
 * TikTokService — wraps IMAI TT raw-API endpoints and normalises
 * every response into the common creator/post shape used across the app.
 *
 * TikTok engagement is richer than IG: it includes views, shares, and plays
 * in addition to likes (diggs) and comments.
 */
class TikTokService extends BasePlatformService {
  // ------------------------------------------------------------------
  //  Normalisation helpers
  // ------------------------------------------------------------------

  /**
   * Extract TikTok engagement stats from an item.
   * Handles both snake_case (statistics) and camelCase (stats) variants
   * returned by different IMAI response shapes.
   */
  _extractEngagement(item) {
    const stats = item.statistics || item.stats || {};
    const likes = stats.digg_count ?? stats.diggCount ?? 0;
    const comments = stats.comment_count ?? stats.commentCount ?? 0;
    const shares = stats.share_count ?? stats.shareCount ?? 0;
    const views = stats.play_count ?? stats.playCount ?? 0;

    return {
      likes,
      comments,
      shares,
      views,
      plays: views,
    };
  }

  /**
   * Normalise a single TikTok challenge-feed / user-feed item (video post).
   */
  _normalisePost(item) {
    const author = item.author || item.user || {};
    const username = author.unique_id || author.uniqueId || author.username || 'unknown';
    const postId = item.id || item.aweme_id || null;

    return {
      username,
      fullName: author.nickname || null,
      profilePicUrl: author.avatar_thumb?.url_list?.[0] || author.avatarThumb || null,
      platform: 'tiktok',
      platformUserId: author.uid || author.id ? String(author.uid || author.id) : null,
      isVerified: author.is_verified || false,
      followersCount: author.follower_count || null,
      engagement: this._extractEngagement(item),
      postId: postId ? String(postId) : null,
      caption: item.desc || item.title || null,
      mediaUrl: item.video?.cover?.url_list?.[0] || item.cover || null,
      permalink: username !== 'unknown' && postId
        ? `https://www.tiktok.com/@${username}/video/${postId}`
        : null,
    };
  }

  /**
   * Normalise a TikTok user-search entry.
   * The IMAI response wraps each result in a { user_info: { ... } } object.
   */
  _normaliseSearchUser(entry) {
    const userInfo = entry.user_info || entry;
    const username = userInfo.unique_id || userInfo.uniqueId || 'unknown';

    return {
      username,
      fullName: userInfo.nickname || null,
      profilePicUrl: userInfo.avatar_thumb?.url_list?.[0] || null,
      platform: 'tiktok',
      platformUserId: userInfo.uid ? String(userInfo.uid) : null,
      isVerified: false,
      followersCount: userInfo.follower_count || null,
      engagement: {
        likes: 0,
        comments: 0,
        shares: 0,
        views: 0,
        plays: 0,
      },
      postId: null,
      caption: null,
      mediaUrl: userInfo.avatar_thumb?.url_list?.[0] || null,
      permalink: username !== 'unknown'
        ? `https://www.tiktok.com/@${username}`
        : null,
    };
  }

  /**
   * Normalise a TikTok user-info response (single user detail).
   */
  _normaliseUserInfo(data) {
    const user = data?.user || data?.result?.user || data?.result || data || {};
    const stats = data?.stats || data?.result?.stats || {};
    const username = user.unique_id || user.uniqueId || user.username || 'unknown';

    return {
      username,
      fullName: user.nickname || null,
      profilePicUrl: user.avatar_thumb?.url_list?.[0] || user.avatarThumb || null,
      platform: 'tiktok',
      platformUserId: user.uid || user.id ? String(user.uid || user.id) : null,
      isVerified: user.is_verified || false,
      followersCount: stats.follower_count ?? stats.followerCount ?? user.follower_count ?? null,
      engagement: {
        likes: stats.heart_count ?? stats.heartCount ?? 0,
        comments: 0,
        shares: 0,
        views: stats.video_count ?? stats.videoCount ?? 0,
        plays: 0,
      },
      postId: null,
      caption: user.signature || null,
      mediaUrl: user.avatar_thumb?.url_list?.[0] || user.avatarThumb || null,
      permalink: username !== 'unknown'
        ? `https://www.tiktok.com/@${username}`
        : null,
    };
  }

  // ------------------------------------------------------------------
  //  Public API
  // ------------------------------------------------------------------

  /**
   * Search TikTok challenge (hashtag) feed.
   * @param {string} tag — hashtag without #
   * @returns {Promise<Array>}
   */
  async searchByHashtag(tag) {
    const response = await this.imai.ttChallengeFeed(tag);
    const items = Array.isArray(response)
      ? response
      : (response?.items || response?.result?.items || response?.result || []);
    return items.map((item) => this._normalisePost(item));
  }

  /**
   * Search TikTok users by keyword.
   * @param {string} username
   * @returns {Promise<Array>}
   */
  async searchByUser(username) {
    const response = await this.imai.ttSearchUsers(username);
    const userList = Array.isArray(response)
      ? response
      : (response?.user_list || response?.result?.user_list || response?.result || []);
    return userList.map((entry) => this._normaliseSearchUser(entry));
  }

  /**
   * Get detailed info for a single TikTok user.
   * @param {string} username
   * @returns {Promise<object>}
   */
  async getUserInfo(username) {
    const response = await this.imai.ttUserInfo(username);
    return this._normaliseUserInfo(response);
  }

  /**
   * Get a TikTok user's recent feed.
   * @param {string} username
   * @param {string|null} after — pagination cursor
   * @returns {Promise<Array>}
   */
  async getUserFeed(username, after = null) {
    const response = await this.imai.ttUserFeed(username, after);
    const items = Array.isArray(response)
      ? response
      : (response?.items || response?.result?.items || response?.result || []);
    return items.map((item) => this._normalisePost(item));
  }
}

module.exports = TikTokService;
