const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const config = require('./config/instagram');
const instagramRoutes = require('./routes/instagramRoutes');
const agentRoutes = require('./routes/agentRoutes');
const imaiRoutes = require('./routes/imaiRoutes');
const tiktokRoutes = require('./routes/tiktokRoutes');
const apifyRoutes = require('./routes/apifyRoutes');
const apiDirectRoutes = require('./routes/apiDirectRoutes');
const healthRoutes = require('./routes/healthRoutes');
const rateLimit = require('express-rate-limit');

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  console.error('Stack:', error.stack);
});

// Load env from backend directory: .env.local first, then .env (works regardless of cwd)
const backendDir = __dirname;
const envLocal = path.join(backendDir, '.env.local');
const envDefault = path.join(backendDir, '.env');
if (fs.existsSync(envLocal)) {
    require('dotenv').config({ path: envLocal });
} else {
    require('dotenv').config({ path: envDefault });
}
const clientCheckScheduler = require('./services/clientCheckScheduler');

const session = require('express-session');

const app = express();

// CORS Configuration
const corsOptions = {
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
      : 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    optionsSuccessStatus: 200,
};

// Middleware
app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(limiter);

// Routes
app.use('/', healthRoutes);
app.use('/', instagramRoutes);
app.use('/', agentRoutes);
app.use('/', imaiRoutes);
app.use('/', tiktokRoutes);
app.use('/', apifyRoutes);
app.use('/', apiDirectRoutes);

// Homepage
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        error: 'Something went wrong!',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Start server
const PORT = config.server.port;
app.listen(PORT, () => {
    console.log('\n================================================');
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('================================================\n');

    console.log('API Endpoints:');
    console.log(`   GET  /api/health - System health check`);
    console.log(`   GET  /api/instagram/search?keyword={keyword} - Search creators`);
    console.log('\nAgent Endpoints:');
    console.log(`   GET  /api/agents/:id/stream - SSE real-time logs`);
    console.log(`   POST /api/agents/:id/run - Trigger immediate run`);
    console.log(`   POST /api/agents/:id/stop - Stop running agent`);
    console.log(`   GET  /api/agents/:id/status - Get agent status`);
    console.log(`   POST /api/agents/test-login - Test IMAI credentials`);
    console.log('\nIMAI API Endpoints:');
    console.log(`   GET  /api/imai/credits - Get token balance`);
    console.log(`   GET  /api/imai/test - Test API connection`);
    console.log(`   POST /api/imai/search - Search influencers`);
    console.log(`   POST /api/imai/report - Create audience report`);
    console.log(`   GET  /api/imai/report/:id - Fetch report`);
    console.log('\nTikTok API Endpoints:');
    console.log(`   GET  /api/tiktok/search?keyword={keyword} - Search TikTok`);
    console.log(`   GET  /api/tiktok/user/:username - Get TikTok user info`);
    console.log(`   GET  /api/tiktok/challenge/:hashtag - Get challenge info`);

    console.log('\n================================================');
    console.log('Server is ready to accept requests!');
    console.log('================================================\n');
    //clientCheckScheduler.start();
});
