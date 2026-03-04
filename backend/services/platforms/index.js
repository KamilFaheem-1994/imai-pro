const { ImaiApiService } = require('../imaiApiService');
const InstagramService = require('./InstagramService');
const TikTokService = require('./TikTokService');

/**
 * Factory — returns the appropriate platform service for the given platform.
 *
 * @param {'instagram'|'tiktok'} platform
 * @param {string} apiKey — IMAI authkey
 * @returns {import('./BasePlatformService')} platform service instance
 */
function getPlatformService(platform, apiKey) {
  const imai = new ImaiApiService(apiKey);

  switch (platform) {
    case 'instagram':
      return new InstagramService(imai);
    case 'tiktok':
      return new TikTokService(imai);
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

module.exports = { getPlatformService };
