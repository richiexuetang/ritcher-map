const Redis = require('ioredis');
const config = require('./index');
const logger = require('../utils/logger');

let redisClient = null;

const connectRedis = async () => {
    try {
        redisClient = new Redis({
            host: config.redis.host,
            port: config.redis.port,
            password: config.redis.password || null,
            db: config.redis.db,
            keyPrefix: config.redis.keyPrefix,
            retryDelayOnFailover: config.redis.retryDelayOnFailover,
            maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
            lazyConnect: true
        });

        // Event handlers
        redisClient.on('connect', () => {
            logger.info('Connected to Redis', {
                host: config.redis.host,
                port: config.redis.port,
                db: config.redis.db
            });
        });

        redisClient.on('error', (error) => {
            logger.error('Redis connection error:', error);
        });

        redisClient.on('close', () => {
            logger.info('Redis connection closed');
        });

        // Connect
        await redisClient.connect();

        return redisClient;
    } catch (error) {
        logger.error('Failed to connect to Redis:', error);
        throw error;
    }
};

const disconnectRedis = async () => {
    if (redisClient) {
        await redisClient.disconnect();
        redisClient = null;
        logger.info('Disconnected from Redis');
    }
};

const getRedisClient = () => {
    if (!redisClient) {
        throw new Error('Redis client not initialized');
    }
    return redisClient;
};

module.exports = {
    connectRedis,
    disconnectRedis,
    getRedisClient
};