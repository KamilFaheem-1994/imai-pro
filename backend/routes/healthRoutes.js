const express = require('express');
const router = express.Router();
const { checkDbHealth, getSettingValue } = require('../services/dbService');
const { ImaiApiService } = require('../services/imaiApiService');

/**
 * GET /api/health
 * Returns system health status.
 */
router.get('/api/health', async (req, res) => {
  const dbHealthy = await checkDbHealth();

  let imaiHealthy = false;
  try {
    const apiKey = await getSettingValue('imai_api_key');
    if (apiKey) {
      const imai = new ImaiApiService(apiKey);
      const credits = await imai.getCredits();
      imaiHealthy = credits?.success !== false;
    }
  } catch {
    imaiHealthy = false;
  }

  const allHealthy = dbHealthy;
  const statusCode = allHealthy ? 200 : 503;

  res.status(statusCode).json({
    status: allHealthy ? 'ok' : 'degraded',
    db: dbHealthy,
    imai: imaiHealthy,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
