const path = require('path');
require('dotenv').config();

const config = {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT, 10) || 3000,
    serviceName: process.env.SERVICE_NAME || 'analytics-service',

    clickhouse: {
        host: process.env.CLICKHOUSE_HOST || 'localhost',
        port: parseInt(process.env.CLICKHOUSE_PORT, 10) || 8123,
        username: process.env.CLICKHOUSE_USERNAME || 'default',
        password: process.env.CLICKHOUSE_PASSWORD || '',
        database: process.env.CLICKHOUSE_DATABASE || 'ritcher_analytics'
    },

    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT, 10) || 6379,
        password: process.env.REDIS_PASSWORD || '',
        db: parseInt(process.env.REDIS_DB, 10) || 0,
        keyPrefix: 'analytics:',
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3
    },

    kafka: {
        brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
        clientId: process.env.KAFKA_CLIENT_ID || 'analytics-service',
        groupId: process.env.KAFKA_GROUP_ID || 'analytics-service-group',
        topics: {
            markerEvents: process.env.KAFKA_TOPIC_MARKER_EVENTS || 'marker-events',
            userEvents: process.env.KAFKA_TOPIC_USER_EVENTS || 'user-events',
            systemEvents: process.env.KAFKA_TOPIC_SYSTEM_EVENTS || 'system-events',
            analyticsEvents: process.env.KAFKA_TOPIC_ANALYTICS_EVENTS || 'analytics-events'
        }
    },

    security: {
        jwtSecret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
        apiKeyHeader: process.env.API_KEY_HEADER || 'x-api-key',
        rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
        rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100
    },

    monitoring: {
        metricsEnabled: process.env.METRICS_ENABLED === 'true',
        healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL, 10) || 30000
    },

    workers: {
        aggregationInterval: parseInt(process.env.AGGREGATION_INTERVAL, 10) || 300000,
        cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL, 10) || 3600000,
        reportGenerationInterval: parseInt(process.env.REPORT_GENERATION_INTERVAL, 10) || 86400000
    },

    externalServices: {
        authService: process.env.AUTH_SERVICE_URL || 'http://localhost:8081',
        markerService: process.env.MARKER_SERVICE_URL || 'http://localhost:8082',
        userService: process.env.USER_SERVICE_URL || 'http://localhost:8083'
    },

    logging: {
        level: process.env.LOG_LEVEL || 'info',
        format: process.env.LOG_FORMAT || 'json'
    }
};

module.exports = config;