const EventEmitter = require('events');
const ImaiAgentService = require('../imaiAgentService');

/**
 * ImaiServiceManager — manages per-agent ImaiAgentService instances.
 *
 * Replaces the old singleton pattern so multiple agents can run concurrently,
 * each with its own Playwright browser and state.
 */
class ImaiServiceManager extends EventEmitter {
  constructor() {
    super();
    /** @type {Map<string, ImaiAgentService>} */
    this.instances = new Map();
  }

  /**
   * Get or create an ImaiAgentService instance for the given agent ID.
   * @param {string} agentId
   * @returns {ImaiAgentService}
   */
  getInstance(agentId) {
    if (!this.instances.has(agentId)) {
      const service = new ImaiAgentService();

      // Forward all events with the agentId attached
      for (const event of ['log', 'progress', 'stopping', 'creators_update']) {
        service.on(event, (data) => {
          this.emit(event, { ...data, agentId });
        });
      }

      this.instances.set(agentId, service);
    }
    return this.instances.get(agentId);
  }

  /**
   * Check if an agent instance exists and is running.
   * @param {string} agentId
   * @returns {boolean}
   */
  isRunning(agentId) {
    const instance = this.instances.get(agentId);
    return instance ? instance.isRunning : false;
  }

  /**
   * Stop and clean up an agent instance.
   * @param {string} agentId
   */
  async stopInstance(agentId) {
    const instance = this.instances.get(agentId);
    if (instance) {
      if (instance.isRunning) {
        await instance.stop();
      }
      try {
        await instance.cleanup();
      } catch (e) {
        console.error(`[ImaiServiceManager] Cleanup failed for agent ${agentId}:`, e.message);
      }
      this.instances.delete(agentId);
    }
  }

  /**
   * Remove an instance from the map (without stopping — for when it's already done).
   * @param {string} agentId
   */
  removeInstance(agentId) {
    this.instances.delete(agentId);
  }

  /**
   * Get status of all managed instances.
   */
  getAllStatuses() {
    const statuses = {};
    for (const [agentId, instance] of this.instances) {
      statuses[agentId] = instance.getStatus();
    }
    return statuses;
  }
}

module.exports = new ImaiServiceManager();
