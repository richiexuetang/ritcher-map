const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const logger = require('./utils/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const corsMiddleware = require('./middleware/cors');
const authMiddleware = require('./middleware/auth');

// Import routes
const analyticsRoutes = require('./routes/analytics');
const metricsRoutes = require('./routes/metrics');
const reportsRoutes = require('./routes/reports');
const healthRoutes = require('./routes/health');

const app = express();

// Trust proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// Compression
app.use(compression());

// CORS
app.use(corsMiddleware());

// Rate limiting
const limiter = rateLimit({
    windowMs: config.security.rateLimitWindowMs,
    max: config.security.rateLimitMaxRequests,
    message: {
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

app.use('/api', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info('HTTP Request', {
            method: req.method,
            url: req.url,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            userAgent: req.get('User-Agent'),
            ip: req.ip
        });
    });

    next();
});

// Health check (no auth required)
app.use('/health', healthRoutes);

// API routes (with auth)
app.use('/api/v1/analytics', authMiddleware, analyticsRoutes);
app.use('/api/v1/metrics', authMiddleware, metricsRoutes);
app.use('/api/v1/reports', authMiddleware, reportsRoutes);

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

module.exports = app;