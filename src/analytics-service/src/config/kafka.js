const { Kafka } = require('kafkajs');
const config = require('./index');
const logger = require('../utils/logger');

let kafka = null;
let producer = null;
let consumers = new Map();

const connectKafka = async () => {
    try {
        kafka = new Kafka({
            clientId: config.kafka.clientId,
            brokers: config.kafka.brokers,
            logLevel: 1, // ERROR level
            logCreator: () => ({ level, log }) => {
                const { message, ...extra } = log;
                logger[level.toLowerCase()](message, extra);
            }
        });

        // Create producer
        producer = kafka.producer({
            maxInFlightRequests: 1,
            idempotent: true,
            transactionTimeout: 30000
        });

        await producer.connect();
        logger.info('Kafka producer connected');

        return { kafka, producer };
    } catch (error) {
        logger.error('Failed to connect to Kafka:', error);
        throw error;
    }
};

const disconnectKafka = async () => {
    try {
        // Disconnect all consumers
        for (const [topic, consumer] of consumers) {
            await consumer.disconnect();
            logger.info(`Kafka consumer disconnected for topic: ${topic}`);
        }
        consumers.clear();

        // Disconnect producer
        if (producer) {
            await producer.disconnect();
            logger.info('Kafka producer disconnected');
        }

        kafka = null;
        producer = null;
    } catch (error) {
        logger.error('Error disconnecting from Kafka:', error);
    }
};

const createConsumer = async (groupId, topics) => {
    if (!kafka) {
        throw new Error('Kafka not initialized');
    }

    const consumer = kafka.consumer({ groupId });
    await consumer.connect();
    await consumer.subscribe({ topics });

    // Store consumer reference
    topics.forEach(topic => consumers.set(topic, consumer));

    logger.info('Kafka consumer created', { groupId, topics });
    return consumer;
};

const getProducer = () => {
    if (!producer) {
        throw new Error('Kafka producer not initialized');
    }
    return producer;
};

module.exports = {
    connectKafka,
    disconnectKafka,
    createConsumer,
    getProducer
};