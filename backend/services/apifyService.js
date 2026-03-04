const { ApifyClient } = require('apify-client');

/**
 * Apify-specific error wrapper — mirrors ImaiApiError structure.
 */
class ApifyServiceError extends Error {
  constructor(message, { code, statusCode, response } = {}) {
    super(message);
    this.name = 'ApifyServiceError';
    this.code = code || null;
    this.statusCode = statusCode || null;
    this.response = response || null;
  }
}

/**
 * Known Apify actor IDs.
 */
const ACTORS = {
  SEARCH:   'apify/instagram-search-scraper',
  LOCATION: 'apidojo/instagram-location-scraper',
};

/**
 * ApifyService — client for Apify Instagram location scraping.
 *
 * Two capabilities:
 *   1. Search Instagram locations by name  (searchLocations)
 *   2. Scrape posts from an Instagram location page  (scrapeLocationPosts)
 */
class ApifyService {
  /**
   * @param {string} token — Apify API token
   */
  constructor(token) {
    if (!token || typeof token !== 'string') {
      throw new ApifyServiceError('An Apify API token is required to create the service', {
        code: 'not_authenticated',
        statusCode: 401,
      });
    }

    this.token = token;
    this.client = new ApifyClient({ token });
  }

  // ------------------------------------------------------------------ //
  //  Search Instagram locations by name                                  //
  // ------------------------------------------------------------------ //

  /**
   * Search for Instagram locations matching a query string.
   *
   * Uses the `apify/instagram-search-scraper` actor with searchType "location".
   *
   * @param {string} query — search term (e.g. "KFC Dubai")
   * @param {number} limit — max results to return (default 10)
   * @returns {Promise<Array<{ id: string, name: string, address: string, lat: number, lng: number }>>}
   */
  async searchLocations(query, limit = 10) {
    if (!query || typeof query !== 'string') {
      throw new ApifyServiceError('query is required for location search');
    }

    try {
      const run = await this.client.actor(ACTORS.SEARCH).call(
        {
          search: query,
          searchType: 'place',
          resultsLimit: limit,
        },
        { timeout: 120 },
      );

      const { items } = await this.client.dataset(run.defaultDatasetId).listItems();

      // Normalise to a clean shape — the actor returns mixed formats
      return items.slice(0, limit).map((item) => ({
        id:      String(item.id || item.pk || item.location_id || ''),
        name:    item.name || item.title || '',
        address: item.address || item.street_address || '',
        lat:     item.lat ?? item.latitude ?? null,
        lng:     item.lng ?? item.longitude ?? null,
      }));
    } catch (error) {
      throw this._wrapError(error, 'searchLocations');
    }
  }

  // ------------------------------------------------------------------ //
  //  Scrape posts from an Instagram location page                        //
  // ------------------------------------------------------------------ //

  /**
   * Scrape recent posts from a specific Instagram location.
   *
   * Uses the `apidojo/instagram-location-scraper` actor.
   *
   * @param {string} locationUrl — full URL, e.g. "https://www.instagram.com/explore/locations/123456/"
   * @param {number} maxPosts — max posts to scrape (default 50)
   * @returns {Promise<Array<{ ownerUsername: string, caption: string, likesCount: number, commentsCount: number, mediaUrl: string, postUrl: string, timestamp: string }>>}
   */
  async scrapeLocationPosts(locationUrl, maxPosts = 50) {
    if (!locationUrl || typeof locationUrl !== 'string') {
      throw new ApifyServiceError('locationUrl is required');
    }

    try {
      const run = await this.client.actor(ACTORS.LOCATION).call(
        {
          locationUrls: [locationUrl],
          maxItems: maxPosts,
        },
        { timeout: 180 }, // location scraping can take a bit longer
      );

      const { items } = await this.client.dataset(run.defaultDatasetId).listItems();

      // Normalise post data
      return items.map((post) => ({
        ownerUsername:  post.ownerUsername || post.owner?.username || post.user?.username || null,
        ownerId:        post.ownerId || post.owner?.id || null,
        caption:        post.caption || post.text || '',
        likesCount:     post.likesCount ?? post.likes ?? 0,
        commentsCount:  post.commentsCount ?? post.comments ?? 0,
        mediaUrl:       post.displayUrl || post.mediaUrl || post.url || null,
        postUrl:        post.url || post.shortcode ? `https://www.instagram.com/p/${post.shortcode}/` : null,
        timestamp:      post.timestamp || post.taken_at || null,
      }));
    } catch (error) {
      throw this._wrapError(error, 'scrapeLocationPosts');
    }
  }

  // ------------------------------------------------------------------ //
  //  Health check                                                         //
  // ------------------------------------------------------------------ //

  /**
   * Validate the Apify token by fetching user info.
   */
  async testConnection() {
    try {
      const user = await this.client.user().get();
      return {
        success: true,
        username: user.username,
        plan: user.plan?.id || 'unknown',
      };
    } catch (error) {
      throw this._wrapError(error, 'testConnection');
    }
  }

  // ------------------------------------------------------------------ //
  //  Internal                                                             //
  // ------------------------------------------------------------------ //

  /**
   * Wrap an upstream error into a structured ApifyServiceError.
   */
  _wrapError(error, operation) {
    if (error instanceof ApifyServiceError) return error;

    const status = error.statusCode || error.status || 500;
    const message = error.message || `Apify ${operation} failed`;

    // Common Apify error codes
    if (status === 401 || message.includes('unauthorized')) {
      return new ApifyServiceError('Apify API token is invalid or expired', {
        code: 'invalid_token',
        statusCode: 401,
      });
    }

    if (status === 402 || message.includes('usage limit')) {
      return new ApifyServiceError('Apify usage limit exceeded — add credits at apify.com', {
        code: 'credits_exhausted',
        statusCode: 402,
      });
    }

    return new ApifyServiceError(message, {
      code: error.code || 'apify_error',
      statusCode: status,
      response: error.data || null,
    });
  }
}

module.exports = { ApifyService, ApifyServiceError };
