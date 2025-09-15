const { getClickHouseClient } = require('../config/database');
const logger = require('../utils/logger');

class Metric {
    constructor(data) {
        this.metric_id = data.metric_id;
        this.metric_name = data.metric_name;
        this.metric_value = data.metric_value;
        this.metric_type = data.metric_type; // counter, gauge, histogram
        this.dimensions = data.dimensions || {};
        this.timestamp = data.timestamp || new Date();
        this.game_id = data.game_id;
        this.user_id = data.user_id || null;
        this.created_at = data.created_at || new Date();
    }

    static async insert(metrics) {
        const client = getClickHouseClient();

        try {
            const metricArray = Array.isArray(metrics) ? metrics : [metrics];

            await client.insert({
                table: 'metrics',
                values: metricArray.map(metric => ({
                    metric_id: metric.metric_id,
                    metric_name: metric.metric_name,
                    metric_value: metric.metric_value,
                    metric_type: metric.metric_type,
                    dimensions: JSON.stringify(metric.dimensions || {}),
                    timestamp: metric.timestamp,
                    game_id: metric.game_id || '',
                    user_id: metric.user_id || '',
                    created_at: metric.created_at || new Date()
                })),
                format: 'JSONEachRow'
            });

            logger.debug(`Inserted ${metricArray.length} metrics`);
            return true;
        } catch (error) {
            logger.error('Error inserting metrics:', error);
            throw error;
        }
    }

    static async getAggregated(metricName, aggregation = 'sum', filters = {}) {
        const client = getClickHouseClient();

        try {
            let query = `
        SELECT 
          ${aggregation}(metric_value) as value,
          toStartOfHour(timestamp) as hour
        FROM metrics
        WHERE metric_name = {metric_name:String}
      `;

            const params = [['metric_name', metricName]];

            if (filters.game_id) {
                query += ` AND game_id = {game_id:String}`;
                params.push(['game_id', filters.game_id]);
            }

            if (filters.start_date) {
                query += ` AND timestamp >= {start_date:DateTime}`;
                params.push(['start_date', filters.start_date]);
            }

            if (filters.end_date) {
                query += ` AND timestamp <= {end_date:DateTime}`;
                params.push(['end_date', filters.end_date]);
            }

            query += ` GROUP BY hour ORDER BY hour`;

            const queryParams = {};
            params.forEach(([key, value]) => {
                queryParams[key] = value;
            });

            const result = await client.query({
                query,
                query_params: queryParams,
                format: 'JSON'
            });

            const data = await result.json();
            return data.data;
        } catch (error) {
            logger.error('Error getting aggregated metrics:', error);
            throw error;
        }
    }

    static async getTopMetrics(metricName, groupBy, limit = 10, filters = {}) {
        const client = getClickHouseClient();

        try {
            let query = `
        SELECT 
          JSONExtractString(dimensions, '${groupBy}') as group_key,
          sum(metric_value) as total_value,
          count(*) as count
        FROM metrics
        WHERE metric_name = {metric_name:String}
          AND JSONHas(dimensions, '${groupBy}')
      `;

            const params = [['metric_name', metricName]];

            if (filters.game_id) {
                query += ` AND game_id = {game_id:String}`;
                params.push(['game_id', filters.game_id]);
            }

            if (filters.start_date) {
                query += ` AND timestamp >= {start_date:DateTime}`;
                params.push(['start_date', filters.start_date]);
            }

            if (filters.end_date) {
                query += ` AND timestamp <= {end_date:DateTime}`;
                params.push(['end_date', filters.end_date]);
            }

            query += ` 
        GROUP BY group_key 
        ORDER BY total_value DESC 
        LIMIT {limit:UInt32}
      `;
            params.push(['limit', limit]);

            const queryParams = {};
            params.forEach(([key, value]) => {
                queryParams[key] = value;
            });

            const result = await client.query({
                query,
                query_params: queryParams,
                format: 'JSON'
            });

            const data = await result.json();
            return data.data;
        } catch (error) {
            logger.error('Error getting top metrics:', error);
            throw error;
        }
    }
}

module.exports = Metric;