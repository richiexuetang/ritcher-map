const { createClient } = require('@clickhouse/client');
const config = require('./index');
const logger = require('../utils/logger');

let clickhouseClient = null;

const connectClickHouse = async () => {
    try {
        clickhouseClient = createClient({
            host: `http://${config.clickhouse.host}:${config.clickhouse.port}`,
            username: config.clickhouse.username,
            password: config.clickhouse.password,
            database: config.clickhouse.database,
            request_timeout: 60000,
            compression: {
                request: true,
                response: true
            }
        });

        // Test connection
        const result = await clickhouseClient.query({
            query: 'SELECT version()',
            format: 'JSON'
        });

        const data = await result.json();
        logger.info('Connected to ClickHouse', {
            version: data.data[0]['version()'],
            host: config.clickhouse.host,
            database: config.clickhouse.database
        });

        // Run migrations if needed
        await runMigrations();

        return clickhouseClient;
    } catch (error) {
        logger.error('Failed to connect to ClickHouse:', error);
        throw error;
    }
};

const disconnectClickHouse = async () => {
    if (clickhouseClient) {
        await clickhouseClient.close();
        clickhouseClient = null;
        logger.info('Disconnected from ClickHouse');
    }
};

const getClickHouseClient = () => {
    if (!clickhouseClient) {
        throw new Error('ClickHouse client not initialized');
    }
    return clickhouseClient;
};

const runMigrations = async () => {
    const fs = require('fs').promises;
    const path = require('path');

    try {
        const migrationsDir = path.join(__dirname, '../../sql/migrations');
        const migrationFiles = await fs.readdir(migrationsDir);

        for (const file of migrationFiles.sort()) {
            if (file.endsWith('.sql')) {
                const migration = await fs.readFile(path.join(migrationsDir, file), 'utf8');
                await clickhouseClient.exec({ query: migration });
                logger.info(`Migration executed: ${file}`);
            }
        }
    } catch (error) {
        logger.error('Migration error:', error);
        throw error;
    }
};

module.exports = {
    connectClickHouse,
    disconnectClickHouse,
    getClickHouseClient
};