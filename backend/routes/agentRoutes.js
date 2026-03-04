const express = require('express');
const router = express.Router();
const ImaiAgentService = require('../services/imaiAgentService');
const imaiServiceManager = require('../services/imai/ImaiServiceManager');
const agentScheduler = require('../services/agentScheduler');
const { sql } = require('../services/dbService');

// Store for active SSE connections
const sseConnections = new Map(); // agentId -> Set of response objects

/**
 * Send SSE message to all connected clients for an agent
 */
function broadcastToAgent(agentId, data) {
  const connections = sseConnections.get(agentId);
  if (connections) {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    connections.forEach((res) => {
      try {
        res.write(message);
      } catch (error) {
        console.error('Error writing to SSE connection:', error);
      }
    });
  }
}

// Forward service manager events — filtered by agent ID
imaiServiceManager.on('log', (logEntry) => {
  if (logEntry.agentId) {
    broadcastToAgent(logEntry.agentId, { type: 'log', ...logEntry });
  }
});

imaiServiceManager.on('progress', (progressData) => {
  if (progressData.agentId) {
    broadcastToAgent(progressData.agentId, {
      type: 'progress',
      ...progressData,
      timestamp: new Date().toISOString(),
    });
  }
});

imaiServiceManager.on('stopping', (data) => {
  if (data.agentId) {
    broadcastToAgent(data.agentId, {
      type: 'status',
      status: 'stopping',
      timestamp: new Date().toISOString(),
      message: 'Agent is stopping...',
    });
  }
});

imaiServiceManager.on('creators_update', (data) => {
  if (data.agentId) {
    broadcastToAgent(data.agentId, {
      type: 'creators_update',
      creatorsList: data.creatorsList,
      currentCreatorIndex: data.currentCreatorIndex,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/agents/:id/stream
 * SSE endpoint for real-time agent logs
 */
router.get('/api/agents/:id/stream', (req, res) => {
  const agentId = req.params.id;

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Initialize connection set for this agent if needed
  if (!sseConnections.has(agentId)) {
    sseConnections.set(agentId, new Set());
  }

  // Add this connection
  sseConnections.get(agentId).add(res);

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', agentId, timestamp: new Date().toISOString() })}\n\n`);

  console.log(`[SSE] Client connected for agent ${agentId}`);

  // Handle client disconnect
  req.on('close', () => {
    const connections = sseConnections.get(agentId);
    if (connections) {
      connections.delete(res);
      if (connections.size === 0) {
        sseConnections.delete(agentId);
      }
    }
    console.log(`[SSE] Client disconnected for agent ${agentId}`);
  });
});

/**
 * POST /api/agents/:id/run
 * Trigger an immediate agent run
 */
router.post('/api/agents/:id/run', async (req, res) => {
  // Agent runs require Playwright for IMAI campaign management
  if (!ImaiAgentService.isPlaywrightAvailable()) {
    return res.status(501).json({
      success: false,
      error: 'Campaign automation is not available. Playwright is not installed on this server. Install it with: npm install playwright',
    });
  }

  const agentId = req.params.id;
  const { client, imaiCredentials, openRouterSettings } = req.body;
  let { creators } = req.body;

  if (!client || !imaiCredentials) {
    return res.status(400).json({
      error: 'Missing required data',
      required: ['client', 'imaiCredentials'],
    });
  }

  // If no creators provided, fetch pending ones from DB
  if (!creators || creators.length === 0) {
    try {
      const rows = await sql`
        SELECT username, platform, full_name, profile_pic_url, followers_count
        FROM tracked_creators
        WHERE client_id = ${client.id}
          AND imai_status = 'pending'
          AND added_to_imai = false
        ORDER BY discovered_at ASC
      `;
      creators = rows.map((row) => ({
        username: row.username,
        platform: row.platform,
        fullName: row.full_name,
        profilePicUrl: row.profile_pic_url,
        followersCount: row.followers_count,
      }));
    } catch (dbError) {
      console.error('[Run] Failed to fetch pending creators:', dbError.message);
      creators = [];
    }
  }

  if (!creators || creators.length === 0) {
    return res.status(400).json({
      error: 'No pending creators to process',
      message: 'Discover creators first using the search features',
    });
  }

  if (!client.imaiCampaignId) {
    return res.status(400).json({
      error: 'Client must have an IMAI Campaign ID configured',
    });
  }

  // Check if agent is already running
  if (imaiServiceManager.isRunning(agentId)) {
    return res.status(409).json({
      error: 'Agent is already running',
    });
  }

  // Get a dedicated service instance for this agent
  const service = imaiServiceManager.getInstance(agentId);

  // Configure OpenRouter if settings provided
  if (openRouterSettings?.apiKey) {
    service.setOpenRouterConfig(openRouterSettings.apiKey, openRouterSettings.model);
  }

  // Broadcast that we're starting
  broadcastToAgent(agentId, {
    type: 'status',
    status: 'starting',
    timestamp: new Date().toISOString(),
    message: 'Agent run initiated',
  });

  try {
    const result = await agentScheduler.runAgentNow(agentId, async () => {
      return await service.runAgentForClient(client, imaiCredentials, creators);
    });

    broadcastToAgent(agentId, {
      type: 'status',
      status: 'completed',
      timestamp: new Date().toISOString(),
      result,
    });

    res.json({ success: true, result });
  } catch (error) {
    broadcastToAgent(agentId, {
      type: 'status',
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error.message,
    });

    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/agents/:id/stop
 * Stop a running agent gracefully
 */
router.post('/api/agents/:id/stop', async (req, res) => {
  const agentId = req.params.id;

  try {
    const schedulerStopped = agentScheduler.stopAgent(agentId);
    await imaiServiceManager.stopInstance(agentId);

    broadcastToAgent(agentId, {
      type: 'status',
      status: 'stopping',
      timestamp: new Date().toISOString(),
      message: 'Stop requested - finishing current operation...',
    });

    res.json({
      success: true,
      wasStopped: true,
      schedulerStopped,
      message: 'Agent will stop after current operation completes',
    });
  } catch (error) {
    try {
      await imaiServiceManager.stopInstance(agentId);
    } catch (cleanupError) {
      console.error('Force cleanup also failed:', cleanupError);
    }

    broadcastToAgent(agentId, {
      type: 'status',
      status: 'stopped',
      timestamp: new Date().toISOString(),
      message: 'Agent force stopped due to error',
    });

    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/agents/:id/skip
 * Skip the currently processing creator
 */
router.post('/api/agents/:id/skip', (req, res) => {
  const agentId = req.params.id;
  const service = imaiServiceManager.instances.get(agentId);

  if (!service || !service.isRunning) {
    return res.status(400).json({ success: false, error: 'Agent is not running' });
  }

  service.queueCommand({ type: 'skip' });

  broadcastToAgent(agentId, {
    type: 'log',
    level: 'warning',
    message: 'Skip command queued - will skip current creator',
    timestamp: new Date().toISOString(),
  });

  res.json({ success: true, message: 'Skip command queued' });
});

/**
 * POST /api/agents/:id/relogin
 * Force re-login to IMAI
 */
router.post('/api/agents/:id/relogin', (req, res) => {
  const agentId = req.params.id;
  const service = imaiServiceManager.instances.get(agentId);

  if (!service || !service.isRunning) {
    return res.status(400).json({ success: false, error: 'Agent is not running' });
  }

  service.queueCommand({ type: 'relogin' });

  broadcastToAgent(agentId, {
    type: 'log',
    level: 'info',
    message: 'Relogin command queued - will re-authenticate',
    timestamp: new Date().toISOString(),
  });

  res.json({ success: true, message: 'Relogin command queued' });
});

/**
 * POST /api/agents/:id/switch
 * Switch to a different creator in the queue
 */
router.post('/api/agents/:id/switch', (req, res) => {
  const agentId = req.params.id;
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ success: false, error: 'Missing username in request body' });
  }

  const service = imaiServiceManager.instances.get(agentId);
  if (!service || !service.isRunning) {
    return res.status(400).json({ success: false, error: 'Agent is not running' });
  }

  service.queueCommand({ type: 'switch', username });

  broadcastToAgent(agentId, {
    type: 'log',
    level: 'info',
    message: `Switch command queued - will switch to @${username}`,
    timestamp: new Date().toISOString(),
  });

  res.json({ success: true, message: `Switch to @${username} command queued` });
});

/**
 * GET /api/agents/:id/creators
 * Get the current creators list with statuses
 */
router.get('/api/agents/:id/creators', (req, res) => {
  const agentId = req.params.id;
  const service = imaiServiceManager.instances.get(agentId);

  if (!service) {
    return res.json({ success: true, creatorsList: [], currentCreatorIndex: 0 });
  }

  const creatorsData = service.getCreatorsList();
  res.json({ success: true, ...creatorsData });
});

/**
 * GET /api/agents/:id/status
 * Get current agent status
 */
router.get('/api/agents/:id/status', (req, res) => {
  const agentId = req.params.id;
  const schedulerStatus = agentScheduler.getAgentStatus(agentId);
  const service = imaiServiceManager.instances.get(agentId);
  const serviceStatus = service ? service.getStatus() : { isRunning: false, isLoggedIn: false };

  res.json({
    agentId,
    ...schedulerStatus,
    service: serviceStatus,
  });
});

/**
 * POST /api/agents/:id/schedule
 * Schedule an agent for recurring runs
 */
router.post('/api/agents/:id/schedule', (req, res) => {
  const agentId = req.params.id;
  const { intervalMinutes, client, imaiCredentials } = req.body;

  if (!intervalMinutes || !client || !imaiCredentials) {
    return res.status(400).json({
      error: 'Missing required data',
      required: ['intervalMinutes', 'client', 'imaiCredentials'],
    });
  }

  const result = agentScheduler.scheduleAgent(agentId, intervalMinutes, async () => {
    const service = imaiServiceManager.getInstance(agentId);

    // Fetch pending creators from database for this client
    let creators = [];
    try {
      const rows = await sql`
        SELECT username, platform, full_name, profile_pic_url, followers_count
        FROM tracked_creators
        WHERE client_id = ${client.id}
          AND imai_status = 'pending'
          AND added_to_imai = false
        ORDER BY discovered_at ASC
      `;
      creators = rows.map((row) => ({
        username: row.username,
        platform: row.platform,
        fullName: row.full_name,
        profilePicUrl: row.profile_pic_url,
        followersCount: row.followers_count,
      }));
      console.log(`[Schedule] Found ${creators.length} pending creators for client ${client.id}`);
    } catch (dbError) {
      console.error(`[Schedule] Failed to fetch pending creators:`, dbError.message);
    }

    if (creators.length === 0) {
      console.log(`[Schedule] No pending creators for client ${client.id}, skipping run`);
      return { skipped: true, reason: 'No pending creators' };
    }

    return await service.runAgentForClient(client, imaiCredentials, creators);
  });

  res.json({ success: true, schedule: result });
});

/**
 * DELETE /api/agents/:id/schedule
 * Cancel a scheduled agent
 */
router.delete('/api/agents/:id/schedule', (req, res) => {
  const agentId = req.params.id;
  const cancelled = agentScheduler.cancelAgent(agentId);

  res.json({
    success: cancelled,
    message: cancelled ? 'Schedule cancelled' : 'No schedule found',
  });
});

/**
 * GET /api/agents/scheduled
 * List all scheduled agents
 */
router.get('/api/agents/scheduled', (req, res) => {
  const agents = agentScheduler.getAllScheduledAgents();
  res.json(agents);
});

/**
 * POST /api/agents/test-login
 * Test IMAI login credentials
 */
router.post('/api/agents/test-login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: 'Missing required data',
      required: ['email', 'password'],
    });
  }

  // Use a temporary instance for testing
  const ImaiAgentService = require('../services/imaiAgentService');
  const testService = new ImaiAgentService();

  try {
    await testService.login(email, password);
    await testService.cleanup();
    res.json({ success: true, message: 'Login successful' });
  } catch (error) {
    await testService.cleanup();
    res.status(401).json({ success: false, error: error.message });
  }
});

module.exports = router;
