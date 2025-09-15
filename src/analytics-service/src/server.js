const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const { connectClickHouse } = require('./config/database');
const { connectRedis } = require('./config/redis');
const { startKafkaConsumers } = require('./consumers');
const { startWorkers } = require('./workers');

class Server {
    constructor() {
        this.server = null;
        this.isShuttingDown = false;
    }

    async start() {
        try {
            // Connect to databases
            await connectClickHouse();
            await connectRedis();

            // Start Kafka consumers
            await startKafkaConsumers();

            // Start background workers
            await startWorkers();

            // Start HTTP server
            this.server = app.listen(config.port, () => {
                logger.info(`Analytics Service started on port ${config.port}`, {
                    environment: config.env,
                    port: config.port,
                    service: config.serviceName
                });
            });

            // Graceful shutdown handlers
            process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
            process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
            process.on('uncaughtException', (error) => {
                logger.error('Uncaught Exception:', error);
                this.gracefulShutdown('uncaughtException');
            });
            process.on('unhandledRejection', (reason, promise) => {
                logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
                this.gracefulShutdown('unhandledRejection');
            });

        } catch (error) {
            logger.error('Failed to start server:', error);
            process.exit(1);
        }
    }

    async gracefulShutdown(signal) {
        if (this.isShuttingDown) {
            logger.warn('Shutdown already in progress...');
            return;
        }

        this.isShuttingDown = true;
        logger.info(`Received ${signal}. Starting graceful shutdown...`);

        try {
            // Stop accepting new requests
            if (this.server) {
                this.server.close(() => {
                    logger.info('HTTP server closed');
                });
            }

            // Stop Kafka consumers
            const { stopKafkaConsumers } = require('./consumers');
            await stopKafkaConsumers();

            // Stop workers
            const { stopWorkers } = require('./workers');
            await stopWorkers();

            // Close database connections
            const { disconnectClickHouse } = require('./config/database');
            const { disconnectRedis } = require('./config/redis');

            await disconnectClickHouse();
            await disconnectRedis();

            logger.info('Graceful shutdown completed');
            process.exit(0);
        } catch (error) {
            logger.error('Error during graceful shutdown:', error);
            process.exit(1);
        }
    }
}

const server = new Server();
server.start();