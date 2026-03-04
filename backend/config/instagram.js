require('dotenv').config();

module.exports = {
    // Server Configuration
    server: {
        port: process.env.PORT || 4000,
    },

    // Rate Limiting
    rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        maxRequests: 100, // Limit each IP to 100 requests per windowMs
    }
};
