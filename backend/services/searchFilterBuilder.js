/**
 * Search Filter Builder — constructs filter payloads for IMAI's /search/newv1/ endpoint.
 *
 * All builder functions return a `filter` object suitable for POSTing to IMAI.
 */

const DEFAULT_FOLLOWERS = { left_number: 1000, right_number: 10000000 };
const DEFAULT_LAST_POSTED = 30; // days

/**
 * Build a filter to find influencers who mentioned a specific @handle.
 *
 * @param {string} handle — handle with or without @
 * @param {object} [opts]
 * @param {number} [opts.lastPosted]   — days since last post (default 30)
 * @param {object} [opts.followers]    — { left_number, right_number }
 * @returns {object} filter payload
 */
function buildMentionFilter(handle, opts = {}) {
  const cleanHandle = handle.startsWith('@') ? handle : `@${handle}`;
  return {
    text_tags: [{ type: 'mention', value: cleanHandle, action: 'should' }],
    last_posted: opts.lastPosted ?? DEFAULT_LAST_POSTED,
    followers: opts.followers ?? DEFAULT_FOLLOWERS,
  };
}

/**
 * Build a filter to find influencers who used a specific #hashtag.
 *
 * @param {string} hashtag — hashtag with or without #
 * @param {object} [opts]
 * @returns {object} filter payload
 */
function buildHashtagFilter(hashtag, opts = {}) {
  const cleanTag = hashtag.startsWith('#') ? hashtag : `#${hashtag}`;
  return {
    text_tags: [{ type: 'hashtag', value: cleanTag, action: 'should' }],
    last_posted: opts.lastPosted ?? DEFAULT_LAST_POSTED,
    followers: opts.followers ?? DEFAULT_FOLLOWERS,
  };
}

/**
 * Build a keyword search filter using text_advanced (boolean keyword matching).
 *
 * @param {string|string[]} keywords — one or more keywords
 * @param {'must'|'should'} [action='should']
 * @param {object} [opts]
 * @returns {object} filter payload
 */
function buildKeywordFilter(keywords, action = 'should', opts = {}) {
  const keywordArray = Array.isArray(keywords) ? keywords : [keywords];
  return {
    text_advanced: keywordArray.map((text) => ({ text, action })),
    last_posted: opts.lastPosted ?? DEFAULT_LAST_POSTED,
    followers: opts.followers ?? DEFAULT_FOLLOWERS,
  };
}

/**
 * Build a geo-filtered search.
 *
 * @param {string|number} geoId — IMAI geo ID (from /geos/ dictionary)
 * @param {object} [opts]
 * @returns {object} filter payload
 */
function buildGeoFilter(geoId, opts = {}) {
  return {
    geo: [{ id: geoId }],
    last_posted: opts.lastPosted ?? DEFAULT_LAST_POSTED,
    followers: opts.followers ?? DEFAULT_FOLLOWERS,
  };
}

/**
 * Build a combined filter merging multiple criteria.
 *
 * @param {object} options
 * @param {string}         [options.mention]     — @handle to search by mention
 * @param {string}         [options.hashtag]     — #hashtag to search
 * @param {string|string[]}[options.keywords]    — keyword(s) for text_advanced
 * @param {string|number}  [options.geoId]       — IMAI geo ID
 * @param {number}         [options.lastPosted]  — days since last post
 * @param {object}         [options.followers]   — { left_number, right_number }
 * @param {number}         [options.engagementRate] — minimum engagement rate (0-1)
 * @returns {object} filter payload
 */
function buildCombinedFilter(options = {}) {
  const filter = {};

  // text_tags can hold both mentions and hashtags
  const textTags = [];

  if (options.mention) {
    const cleanHandle = options.mention.startsWith('@') ? options.mention : `@${options.mention}`;
    textTags.push({ type: 'mention', value: cleanHandle, action: 'should' });
  }

  if (options.hashtag) {
    const cleanTag = options.hashtag.startsWith('#') ? options.hashtag : `#${options.hashtag}`;
    textTags.push({ type: 'hashtag', value: cleanTag, action: 'should' });
  }

  if (textTags.length > 0) {
    filter.text_tags = textTags;
  }

  if (options.keywords) {
    const keywordArray = Array.isArray(options.keywords) ? options.keywords : [options.keywords];
    filter.text_advanced = keywordArray.map((text) => ({ text, action: 'should' }));
  }

  if (options.geoId) {
    filter.geo = [{ id: options.geoId }];
  }

  filter.last_posted = options.lastPosted ?? DEFAULT_LAST_POSTED;
  filter.followers = options.followers ?? DEFAULT_FOLLOWERS;

  if (options.engagementRate) {
    filter.engagement_rate = { value: options.engagementRate, operator: 'gte' };
  }

  return filter;
}

/**
 * Build a sponsored-posts (market_scan) filter by brand mentions.
 *
 * @param {string[]} handles — array of @handles
 * @param {object} [opts]
 * @param {number} [opts.daysBack] — how far back to search (default 30)
 * @returns {object} filter payload for /market_scan/posts/search/
 */
function buildSponsoredPostsFilter(handles, opts = {}) {
  const daysBack = opts.daysBack ?? 30;
  const now = Math.floor(Date.now() / 1000);
  const past = now - daysBack * 86400;

  return {
    mentions: handles.map((h) => (h.startsWith('@') ? h : `@${h}`)),
    created_at: { left_number: past, right_number: now },
  };
}

module.exports = {
  buildMentionFilter,
  buildHashtagFilter,
  buildKeywordFilter,
  buildGeoFilter,
  buildCombinedFilter,
  buildSponsoredPostsFilter,
  DEFAULT_FOLLOWERS,
  DEFAULT_LAST_POSTED,
};
