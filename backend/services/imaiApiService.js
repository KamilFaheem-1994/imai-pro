const axios = require('axios');
const EventEmitter = require('events');

/**
 * IMAI API Error — wraps upstream error codes with structured metadata.
 */
class ImaiApiError extends Error {
  constructor(message, { code, statusCode, response } = {}) {
    super(message);
    this.name = 'ImaiApiError';
    this.code = code || null;
    this.statusCode = statusCode || null;
    this.response = response || null;
  }
}

/**
 * Maps IMAI-specific error codes to HTTP status codes and human-readable messages.
 */
const IMAI_ERROR_MAP = {
  account_not_found:            { httpStatus: 400, message: 'No such account found on the social media platform' },
  account_is_private:           { httpStatus: 400, message: 'The account is private and cannot be analyzed' },
  no_tokens_remaining:          { httpStatus: 402, message: 'Not enough IMAI tokens remaining' },
  daily_tokens_limit_exceeded:  { httpStatus: 402, message: 'Daily IMAI token limit has been exceeded' },
  retry_later:                  { httpStatus: 503, message: 'Audience data is updating — please retry later' },
  not_authenticated:            { httpStatus: 401, message: 'IMAI API key is missing or not provided' },
  invalid_api_key:              { httpStatus: 403, message: 'The IMAI API key is invalid' },
  tokens_expired:               { httpStatus: 403, message: 'IMAI subscription has expired' },
  rate_limit_exceeded:          { httpStatus: 429, message: 'Too many requests — rate limit exceeded' },
};

/**
 * ImaiApiService — complete client for the IMAI REST API.
 *
 * Tracks cumulative token usage via the `X-Tokens-Cost` response header.
 * Every public method returns the parsed response body (`response.data`).
 */
/**
 * Global event emitter for token spend events.
 * Listeners can subscribe to 'token_spent' to log each API call's cost.
 *
 * Event payload: { operation: string, cost: number, timestamp: string }
 */
const tokenEvents = new EventEmitter();

class ImaiApiService {
  /**
   * @param {string} apiKey — IMAI authkey value
   */
  constructor(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      throw new ImaiApiError('An IMAI API key is required to create the service', {
        code: 'not_authenticated',
      });
    }

    this.baseUrl = 'https://imai.co/api';
    this.apiKey = apiKey;
    this.totalTokensUsed = 0;

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: { authkey: this.apiKey },
      timeout: 30000,
    });

    // ---- Response interceptor: track token cost & normalise errors ----
    this.client.interceptors.response.use(
      (response) => {
        const tokenCost = parseFloat(response.headers['x-tokens-cost']);
        if (!isNaN(tokenCost) && tokenCost > 0) {
          this.totalTokensUsed += tokenCost;
          response.tokenCost = tokenCost;

          // Derive operation name from the request URL path
          const urlPath = response.config?.url || '';
          const operation = urlPath
            .replace(/^\//, '')
            .replace(/\/$/, '')
            .replace(/\//g, '_');

          tokenEvents.emit('token_spent', {
            operation,
            cost: tokenCost,
            timestamp: new Date().toISOString(),
          });
        }
        return response;
      },
      (error) => {
        throw this._normaliseError(error);
      },
    );
  }

  // ------------------------------------------------------------------ //
  //  Internal helpers                                                    //
  // ------------------------------------------------------------------ //

  /**
   * Convert an Axios error into a structured ImaiApiError.
   */
  _normaliseError(axiosError) {
    if (axiosError instanceof ImaiApiError) return axiosError;

    const data = axiosError.response?.data;
    const status = axiosError.response?.status;

    // IMAI returns an `error` field in the JSON body.
    const imaiCode = data?.error || data?.code || null;

    if (imaiCode && IMAI_ERROR_MAP[imaiCode]) {
      const mapped = IMAI_ERROR_MAP[imaiCode];
      return new ImaiApiError(mapped.message, {
        code: imaiCode,
        statusCode: mapped.httpStatus,
        response: data,
      });
    }

    // Fall back to HTTP status or generic message.
    const message =
      data?.message || data?.error || axiosError.message || 'Unknown IMAI API error';

    return new ImaiApiError(message, {
      code: imaiCode,
      statusCode: status || 500,
      response: data,
    });
  }

  // ------------------------------------------------------------------ //
  //  Account                                                             //
  // ------------------------------------------------------------------ //

  /**
   * GET /account/info/ — returns token balance & account metadata. Free.
   */
  async getCredits() {
    const response = await this.client.get('/account/info/');
    return response.data;
  }

  // ------------------------------------------------------------------ //
  //  Search                                                              //
  // ------------------------------------------------------------------ //

  /**
   * POST /search/newv1/?platform={platform}
   *
   * @param {'instagram'|'tiktok'|'youtube'} platform
   * @param {object} filters — platform-specific filter payload
   * @param {{ limit?: number, skip?: number }} paging
   */
  async searchInfluencers(platform, filter, paging = { limit: 100, skip: 0 }, sort = null) {
    const body = {
      filter,
      paging: {
        limit: paging.limit ?? 100,
        skip: paging.skip ?? 0,
      },
      sort: sort || { field: 'engagements', direction: 'desc' },
      audience_source: 'any',
    };

    const response = await this.client.post(
      '/search/newv1/',
      body,
      { params: { platform } },
    );
    return response.data;
  }

  /**
   * POST /search/unhide/?platform={platform}
   *
   * Unlocks (reveals) search-result profiles that are hidden by default.
   *
   * @param {'instagram'|'tiktok'|'youtube'} platform
   * @param {string[]} searchResultIds — array of search-result _id values
   */
  async unlockInfluencers(platform, searchResultIds) {
    if (!Array.isArray(searchResultIds) || searchResultIds.length === 0) {
      throw new ImaiApiError('searchResultIds must be a non-empty array');
    }
    const response = await this.client.post(
      '/search/unhide/',
      { ids: searchResultIds },
      { params: { platform } },
    );
    return response.data;
  }

  // ------------------------------------------------------------------ //
  //  Audience Reports                                                    //
  // ------------------------------------------------------------------ //

  /**
   * POST /reports/new/?platform={platform}&url={username}&dry_run={dryRun}
   *
   * Creates (or queues) an audience report. Use dryRun=true to check
   * availability and cost without spending tokens.
   *
   * @param {'instagram'|'tiktok'|'youtube'} platform
   * @param {string} username — social handle (without @)
   * @param {boolean} dryRun
   */
  async createReport(platform, username, dryRun = false) {
    const response = await this.client.post('/reports/new/', null, {
      params: {
        platform,
        url: username,
        dry_run: dryRun,
      },
    });
    return response.data;
  }

  /**
   * GET /reports/{reportId}/?fmt=json
   *
   * Fetches a completed audience report.
   */
  async fetchReport(reportId) {
    if (!reportId) {
      throw new ImaiApiError('reportId is required');
    }
    const response = await this.client.get(`/reports/${reportId}/`, {
      params: { fmt: 'json' },
    });
    return response.data;
  }

  // ------------------------------------------------------------------ //
  //  Instagram Raw API                                                   //
  // ------------------------------------------------------------------ //

  /**
   * GET /raw/ig/hashtag/feed/
   *
   * @param {string} hashtag — without #
   * @param {'recent'|'top'} type
   * @param {string|null} after — pagination cursor
   */
  async igHashtagFeed(hashtag, type = 'recent', after = null) {
    const params = { hashtag, type };
    if (after) params.after = after;
    const response = await this.client.get('/raw/ig/hashtag/feed/', { params });
    return response.data;
  }

  /**
   * GET /raw/ig/search/users/?keyword={kw}
   */
  async igSearchUsers(keyword) {
    const response = await this.client.get('/raw/ig/search/users/', {
      params: { keyword },
    });
    return response.data;
  }

  /**
   * GET /raw/ig/user/info/?url={username}
   */
  async igUserInfo(username) {
    const response = await this.client.get('/raw/ig/user/info/', {
      params: { url: username },
    });
    return response.data;
  }

  // ------------------------------------------------------------------ //
  //  TikTok Raw API                                                      //
  // ------------------------------------------------------------------ //

  /**
   * GET /raw/tt/search/users/?keyword={kw}
   */
  async ttSearchUsers(keyword) {
    const response = await this.client.get('/raw/tt/search/users/', {
      params: { keyword },
    });
    return response.data;
  }

  /**
   * GET /raw/tt/user/info/?url={username}
   */
  async ttUserInfo(username) {
    const response = await this.client.get('/raw/tt/user/info/', {
      params: { url: username },
    });
    return response.data;
  }

  /**
   * GET /raw/tt/user/feed/?url={username}&after={after}
   */
  async ttUserFeed(username, after = null) {
    const params = { url: username };
    if (after) params.after = after;
    const response = await this.client.get('/raw/tt/user/feed/', { params });
    return response.data;
  }

  /**
   * GET /raw/tt/challenge/feed/?url={hashtagOrId}&after={after}
   */
  async ttChallengeFeed(hashtagOrId, after = null) {
    const params = { url: hashtagOrId };
    if (after) params.after = after;
    const response = await this.client.get('/raw/tt/challenge/feed/', { params });
    return response.data;
  }

  /**
   * GET /raw/tt/challenge/info/?url={hashtagOrId}
   */
  async ttChallengeInfo(hashtagOrId) {
    const response = await this.client.get('/raw/tt/challenge/info/', {
      params: { url: hashtagOrId },
    });
    return response.data;
  }

  // ------------------------------------------------------------------ //
  //  Contact Export                                                       //
  // ------------------------------------------------------------------ //

  /**
   * GET /exports/contacts/?url={username}&platform={platform}
   */
  async getContacts(platform, username) {
    const response = await this.client.get('/exports/contacts/', {
      params: { url: username, platform },
    });
    return response.data;
  }

  // ------------------------------------------------------------------ //
  //  Sponsored Posts                                                      //
  // ------------------------------------------------------------------ //

  /**
   * POST /market_scan/posts/search/
   *
   * @param {object} filters — sponsored-post filter payload
   * @param {{ limit?: number, skip?: number }} paging
   */
  async searchSponsoredPosts(filters, paging = { limit: 100, skip: 0 }) {
    const response = await this.client.post('/market_scan/posts/search/', {
      filters,
      paging: {
        limit: paging.limit ?? 100,
        skip: paging.skip ?? 0,
      },
    });
    return response.data;
  }

  // ------------------------------------------------------------------ //
  //  Dictionaries (free endpoints — callers should cache results)        //
  // ------------------------------------------------------------------ //

  /** GET /dict/interests/ */
  async getInterests() {
    const response = await this.client.get('/dict/interests/');
    return response.data;
  }

  /**
   * GET /dict/langs/?platform={platform}
   * @param {'instagram'|'tiktok'|'youtube'} platform
   */
  async getLanguages(platform = 'instagram') {
    const response = await this.client.get('/dict/langs/', {
      params: { platform },
    });
    return response.data;
  }

  /**
   * GET /geos/?q={query}&limit={limit}
   */
  async getGeos(query, limit = 10) {
    const response = await this.client.get('/geos/', {
      params: { q: query, limit },
    });
    return response.data;
  }

  /**
   * GET /dict/relevant-tags/?q={query}&platform={platform}
   */
  async getRelevantTags(query, platform = 'instagram') {
    const response = await this.client.get('/dict/relevant-tags/', {
      params: { q: query, platform },
    });
    return response.data;
  }

  // ------------------------------------------------------------------ //
  //  Utilities                                                           //
  // ------------------------------------------------------------------ //

  /** Returns cumulative token spend for this service instance. */
  getTokensUsed() {
    return this.totalTokensUsed;
  }

  /** Resets the cumulative token counter. */
  resetTokensUsed() {
    this.totalTokensUsed = 0;
  }
}

module.exports = { ImaiApiService, ImaiApiError, IMAI_ERROR_MAP, tokenEvents };
