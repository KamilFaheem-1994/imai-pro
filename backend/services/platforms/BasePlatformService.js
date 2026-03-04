/**
 * BasePlatformService — abstract base for platform-specific search services.
 *
 * Subclasses must override each method to provide platform-specific logic.
 * Every public method returns data normalised to a common creator/post shape
 * so that callers (routes, controllers, agents) can work platform-agnostically.
 */
class BasePlatformService {
  /**
   * @param {import('../imaiApiService').ImaiApiService} imaiApiService
   */
  constructor(imaiApiService) {
    if (!imaiApiService) {
      throw new Error('ImaiApiService instance required');
    }
    this.imai = imaiApiService;
  }

  /**
   * Search posts/videos by hashtag/challenge.
   * @param {string} tag — hashtag without the leading #
   * @returns {Promise<Array>} normalised creator/post objects
   */
  async searchByHashtag(tag) {
    throw new Error('searchByHashtag not implemented');
  }

  /**
   * Search for users/creators by username keyword.
   * @param {string} username
   * @returns {Promise<Array>} normalised creator objects
   */
  async searchByUser(username) {
    throw new Error('searchByUser not implemented');
  }

  /**
   * Fetch detailed info for a single user.
   * @param {string} username
   * @returns {Promise<object>} normalised creator object
   */
  async getUserInfo(username) {
    throw new Error('getUserInfo not implemented');
  }

  /**
   * Fetch a user's recent feed/posts.
   * @param {string} username
   * @returns {Promise<Array>} normalised post objects
   */
  async getUserFeed(username) {
    throw new Error('getUserFeed not implemented');
  }
}

module.exports = BasePlatformService;
