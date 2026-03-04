const axios = require('axios');

/**
 * APIDirect-specific error wrapper — mirrors ApifyServiceError / ImaiApiError structure.
 */
class ApiDirectError extends Error {
  constructor(message, { code, statusCode, response } = {}) {
    super(message);
    this.name = 'ApiDirectError';
    this.code = code || null;
    this.statusCode = statusCode || null;
    this.response = response || null;
  }
}

/**
 * APIDirect platform endpoint paths.
 * Pattern: GET /v1/{platform}/posts?query=KEYWORD&sort_by=most_recent&page=1
 */
const PLATFORM_ENDPOINTS = {
  instagram: '/v1/instagram/posts',
  tiktok:    '/v1/tiktok/posts',
  youtube:   '/v1/youtube/posts',
};

/**
 * Estimated cost per request in USD, by platform.
 */
const PLATFORM_COSTS = {
  instagram: 0.006,
  tiktok:    0.006,
  youtube:   0.006,
};

/**
 * ApiDirectService — client for the APIDirect.io social listening API.
 *
 * Searches posts by keyword across Instagram, TikTok, and YouTube.
 * Normalises results into the same post shape used by instagramController.js
 * so downstream tracked_creators insertion works identically.
 */
class ApiDirectService {
  /**
   * @param {string} apiKey — APIDirect API key (sent as X-API-Key header)
   */
  constructor(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      throw new ApiDirectError('An APIDirect API key is required to create the service', {
        code: 'not_authenticated',
        statusCode: 401,
      });
    }

    this.apiKey = apiKey;
    this.baseUrl = 'https://apidirect.io';

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: { 'X-API-Key': this.apiKey },
      timeout: 30000,
    });
  }

  // ------------------------------------------------------------------ //
  //  Health check                                                        //
  // ------------------------------------------------------------------ //

  /**
   * Verify the API key works by making a minimal search request.
   *
   * @returns {Promise<{ connected: boolean, platforms: string[] }>}
   */
  async testConnection() {
    try {
      // Make a lightweight search to verify credentials
      await this.client.get(PLATFORM_ENDPOINTS.instagram, {
        params: { query: 'test', sort_by: 'most_recent', page: 1 },
      });

      return {
        connected: true,
        platforms: Object.keys(PLATFORM_ENDPOINTS),
      };
    } catch (error) {
      // 401/403 means the key is bad; anything else is still a valid connection test failure
      throw this._wrapError(error, 'testConnection');
    }
  }

  // ------------------------------------------------------------------ //
  //  Post search                                                         //
  // ------------------------------------------------------------------ //

  /**
   * Search posts on a given platform by keyword.
   *
   * @param {'instagram'|'tiktok'|'youtube'} platform
   * @param {string} query — search term (may include # or @ prefix)
   * @param {{ sortBy?: string, page?: number, maxPages?: number }} opts
   * @returns {Promise<{ keyword: string, totalPosts: number, hashtagPosts: Array, mentionPosts: Array }>}
   */
  async searchPosts(platform, query, opts = {}) {
    if (!query || typeof query !== 'string') {
      throw new ApiDirectError('query is required for post search', {
        code: 'invalid_params',
      });
    }

    const endpoint = PLATFORM_ENDPOINTS[platform];
    if (!endpoint) {
      throw new ApiDirectError(
        `Unsupported platform "${platform}". Supported: ${Object.keys(PLATFORM_ENDPOINTS).join(', ')}`,
        { code: 'invalid_platform' },
      );
    }

    const sortBy = opts.sortBy || 'most_recent';
    const page = opts.page || 1;
    const maxPages = opts.maxPages || 1;

    const allPosts = [];

    try {
      let currentPage = page;
      let pagesCollected = 0;

      while (pagesCollected < maxPages) {
        console.log(`   [APIDirect] ${platform} search: "${query}" | page ${currentPage}`);

        const response = await this.client.get(endpoint, {
          params: {
            query,
            sort_by: sortBy,
            page: currentPage,
          },
        });

        const data = response.data;
        const posts = data?.posts || [];

        if (posts.length === 0) break;

        allPosts.push(...posts);
        pagesCollected += 1;
        currentPage += 1;
      }
    } catch (error) {
      throw this._wrapError(error, 'searchPosts');
    }

    // Determine search type from query prefix
    const sourceType = this._deriveSourceType(query);

    // Normalise all posts into the standard shape
    const normalised = allPosts.map((post) => this._normalizePost(post, platform, query));

    // Bucket into hashtag vs mention arrays to match controller convention
    const hashtagPosts = sourceType === 'hashtag' ? normalised : [];
    const mentionPosts = sourceType !== 'hashtag' ? normalised : [];

    return {
      keyword: query,
      totalPosts: normalised.length,
      hashtagPosts,
      mentionPosts,
    };
  }

  // ------------------------------------------------------------------ //
  //  Normalisation                                                       //
  // ------------------------------------------------------------------ //

  /**
   * Transform a single APIDirect post object into the standard post shape
   * used by instagramController.js and the tracked_creators pipeline.
   *
   * @param {object} post — raw post from APIDirect response
   * @param {'instagram'|'tiktok'|'youtube'} platform
   * @param {string} query — original search query
   * @returns {object} — normalised post
   */
  _normalizePost(post, platform, query) {
    const author = post.author || '';
    const url = post.url || '';

    // Try to extract a shortcode from the URL (Instagram /p/SHORTCODE/ pattern)
    let shortcode = null;
    const shortcodeMatch = url.match(/\/p\/([A-Za-z0-9_-]+)/);
    if (shortcodeMatch) {
      shortcode = shortcodeMatch[1];
    }

    // Derive a unique post identifier
    const postId = shortcode || post.id || url || null;

    // Parse timestamp from the date string
    let timestamp = null;
    let dateStr = null;
    if (post.date) {
      const parsed = new Date(post.date);
      if (!isNaN(parsed.getTime())) {
        timestamp = Math.floor(parsed.getTime() / 1000);
        dateStr = parsed.toISOString();
      }
    }

    // Build permalink — prefer the post URL, fall back to constructing one
    const permalink = url || this._buildPermalink(author, platform, postId);

    return {
      postId,
      shortcode,
      creator: {
        username:      author || 'unknown',
        fullName:      null,
        profilePicUrl: null,
        isVerified:    false,
        userId:        null,
      },
      content: {
        caption:      post.title || post.snippet || null,
        displayUrl:   null,
        thumbnailUrl: null,
      },
      engagement: {
        likes:    post.likes || 0,
        comments: post.comments || 0,
        views:    post.views || 0,
        shares:   post.shares || 0,
      },
      timestamp,
      date: dateStr,
      permalink,
      searchInfo: {
        searchType: this._deriveSourceType(query),
        searchTerm: query,
        provider:   'apidirect',
      },
    };
  }

  // ------------------------------------------------------------------ //
  //  Internal helpers                                                    //
  // ------------------------------------------------------------------ //

  /**
   * Derive the source type from the query prefix.
   *   - Starts with '#' -> 'hashtag'
   *   - Starts with '@' -> 'mention'
   *   - Plain text       -> 'mention' (brand name search)
   *
   * @param {string} query
   * @returns {'hashtag'|'mention'}
   */
  _deriveSourceType(query) {
    if (query.startsWith('#')) return 'hashtag';
    return 'mention';
  }

  /**
   * Build a best-effort permalink when the API response URL is missing.
   *
   * @param {string} username
   * @param {string} platform
   * @param {string|null} postId
   * @returns {string|null}
   */
  _buildPermalink(username, platform, postId) {
    if (!username) return null;

    switch (platform) {
      case 'instagram':
        return postId
          ? `https://www.instagram.com/p/${postId}/`
          : `https://www.instagram.com/${username}/`;
      case 'tiktok':
        return postId
          ? `https://www.tiktok.com/@${username}/video/${postId}`
          : `https://www.tiktok.com/@${username}`;
      case 'youtube':
        return postId
          ? `https://www.youtube.com/watch?v=${postId}`
          : `https://www.youtube.com/@${username}`;
      default:
        return null;
    }
  }

  /**
   * Wrap an Axios error into a structured ApiDirectError.
   *
   * @param {Error} error — upstream error (usually AxiosError)
   * @param {string} context — name of the calling method for log context
   * @returns {ApiDirectError}
   */
  _wrapError(error, context) {
    if (error instanceof ApiDirectError) return error;

    const status = error.response?.status || 500;
    const data = error.response?.data;
    const message = data?.message || data?.error || error.message || `APIDirect ${context} failed`;

    if (status === 401) {
      return new ApiDirectError('APIDirect API key is invalid or missing', {
        code: 'invalid_api_key',
        statusCode: 401,
        response: data || null,
      });
    }

    if (status === 403) {
      return new ApiDirectError('APIDirect API key does not have access to this resource', {
        code: 'forbidden',
        statusCode: 403,
        response: data || null,
      });
    }

    if (status === 429) {
      return new ApiDirectError('APIDirect rate limit exceeded — slow down requests', {
        code: 'rate_limit_exceeded',
        statusCode: 429,
        response: data || null,
      });
    }

    if (status === 402) {
      return new ApiDirectError('APIDirect payment required — add credits at apidirect.io', {
        code: 'credits_exhausted',
        statusCode: 402,
        response: data || null,
      });
    }

    return new ApiDirectError(message, {
      code: error.code || 'apidirect_error',
      statusCode: status,
      response: data || null,
    });
  }
}

module.exports = { ApiDirectService, ApiDirectError, PLATFORM_ENDPOINTS, PLATFORM_COSTS };
