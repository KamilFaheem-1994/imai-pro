const schedule = require('node-schedule');
const EventEmitter = require('events');

class AgentScheduler extends EventEmitter {
  constructor() {
    super();
    this.scheduledJobs = new Map(); // agentId -> job
    this.runningAgents = new Map(); // agentId -> status
  }

  /**
   * Schedule an agent to run at regular intervals
   */
  scheduleAgent(agentId, intervalMinutes, runFunction) {
    // Cancel existing job if any
    this.cancelAgent(agentId);

    // Use setInterval for minute-based scheduling
    // Convert minutes to milliseconds
    const intervalMs = intervalMinutes * 60 * 1000;

    // Create a wrapper function that will be called on schedule
    const scheduledRun = async () => {
      console.log(`[SCHEDULER] Running scheduled job for agent ${agentId}`);
      this.emit('agentStart', { agentId, scheduled: true });

      try {
        await runFunction(agentId);
        this.emit('agentComplete', { agentId, success: true });
      } catch (error) {
        console.error(`[SCHEDULER] Agent ${agentId} failed:`, error.message);
        this.emit('agentComplete', { agentId, success: false, error: error.message });
      }
    };

    // Run immediately on schedule
    scheduledRun();

    // Schedule recurring runs using setInterval
    const intervalId = setInterval(scheduledRun, intervalMs);

    // Store the interval ID (we'll wrap it in an object to match the expected interface)
    const job = {
      cancel: () => clearInterval(intervalId),
      nextInvocation: () => {
        const nextRun = new Date(Date.now() + intervalMs);
        return nextRun;
      },
    };

    this.scheduledJobs.set(agentId, job);

    // Calculate next run time
    const nextRun = job.nextInvocation();

    console.log(`[SCHEDULER] Agent ${agentId} scheduled. Next run: ${nextRun.toISOString()}`);

    return {
      agentId,
      intervalMinutes,
      nextRun: nextRun ? nextRun.toISOString() : null,
    };
  }

  /**
   * Cancel a scheduled agent
   */
  cancelAgent(agentId) {
    const job = this.scheduledJobs.get(agentId);
    if (job) {
      job.cancel();
      this.scheduledJobs.delete(agentId);
      console.log(`[SCHEDULER] Agent ${agentId} cancelled`);
      return true;
    }
    return false;
  }

  /**
   * Run an agent immediately (outside of schedule)
   */
  async runAgentNow(agentId, runFunction) {
    if (this.runningAgents.has(agentId)) {
      throw new Error(`Agent ${agentId} is already running`);
    }

    this.runningAgents.set(agentId, {
      startTime: new Date(),
      status: 'running',
    });

    this.emit('agentStart', { agentId, scheduled: false });

    try {
      const result = await runFunction(agentId);
      this.runningAgents.delete(agentId);
      this.emit('agentComplete', { agentId, success: true, result });
      return result;
    } catch (error) {
      this.runningAgents.delete(agentId);
      this.emit('agentComplete', { agentId, success: false, error: error.message });
      throw error;
    }
  }

  /**
   * Stop a running agent and cancel its schedule
   */
  stopAgent(agentId) {
    let stopped = false;

    // Cancel the scheduled job if one exists
    const job = this.scheduledJobs.get(agentId);
    if (job) {
      job.cancel();
      this.scheduledJobs.delete(agentId);
      stopped = true;
    }

    // Remove from running agents map
    const status = this.runningAgents.get(agentId);
    if (status) {
      this.runningAgents.delete(agentId);
      this.emit('agentStop', { agentId });
      stopped = true;
    }

    if (stopped) {
      console.log(`[SCHEDULER] Agent ${agentId} stopped and schedule cancelled`);
    }
    return stopped;
  }

  /**
   * Get agent status
   */
  getAgentStatus(agentId) {
    const job = this.scheduledJobs.get(agentId);
    const running = this.runningAgents.get(agentId);

    return {
      agentId,
      isScheduled: !!job,
      isRunning: !!running,
      nextRun: job?.nextInvocation()?.toISOString() || null,
      runningStatus: running || null,
    };
  }

  /**
   * Get all scheduled agents
   */
  getAllScheduledAgents() {
    const agents = [];
    for (const [agentId, job] of this.scheduledJobs) {
      agents.push({
        agentId,
        nextRun: job.nextInvocation()?.toISOString() || null,
        isRunning: this.runningAgents.has(agentId),
      });
    }
    return agents;
  }
}

// Export a singleton instance
module.exports = new AgentScheduler();
