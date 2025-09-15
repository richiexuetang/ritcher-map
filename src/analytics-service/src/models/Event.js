const { getClickHouseClient } = require('../config/database');
const logger = require('../utils/logger');

class Event {
    constructor(data) {
        this.event_id = data.event_id;
        this.event_type = data.event_type;
        this.timestamp = data.timestamp || new Date();
        this.user_id = data.user_id;
        this.session_id = data.session_id;
        this.game_id = data.game_id;
        this.marker_id = data.marker_id || null;
        this.guide_id = data.guide_id || null;
        this.event_data = data.event_data || {};
        this.ip_address = data.ip_address;
        this.user_agent = data.user_agent;
        this.referrer = data.referrer || null;
        this.platform = data.platform;
        this.device_type = data.device_type;
        this.created_at = data.created_at || new Date();
    }

    static async insert(events) {
        const client = getClickHouseClient();

        try {
            const eventArray = Array.isArray(events) ? events : [events];

            await client.insert({
                table: 'events',
                values: eventArray.map(event => ({
                    event_id: event.event_id,
                    event_type: event.event_type,
                    timestamp: event.timestamp,
                    user_id: event.user_id || '',
                    session_id: event.session_id || '',
                    game_id: event.game_id || '',
                    marker_id: event.marker_id || '',
                    guide_id: event.guide_id || '',
                    event_data: JSON.stringify(event.event_data || {}),
                    ip_address: event.ip_address || '',
                    user_agent: event.user_agent || '',
                    referrer: event.referrer || '',
                    platform: event.platform || '',
                    device_type: event.device_type || '',
                    created_at: event.created_at || new Date()
                })),
                format: 'JSONEachRow'
            });

            logger.debug(`Inserted ${eventArray.length} events`);
            return true;
        } catch (error) {
            logger.error('Error inserting events:', error);
            throw error;
        }
    }

    static async findByFilters(filters = {}) {
        const client = getClickHouseClient();

        try {
            let query = `
        SELECT 
          event_id,
          event_type,
          timestamp,
          user_id,
          session_id,
          game_id,
          marker_id,
          guide_id,
          event_data,
          ip_address,
          user_agent,
          referrer,
          platform,
          device_type,
          created_at
        FROM events
        WHERE 1=1
      `;

            const params = [];

            if (filters.event_type) {
                query += ` AND event_type = {event_type:String}`;
                params.push(['event_type', filters.event_type]);
            }

            if (filters.user_id) {
                query += ` AND user_id = {user_id:String}`;
                params.push(['user_id', filters.user_id]);
            }

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

            query += ` ORDER BY timestamp DESC`;

            if (filters.limit) {
                query += ` LIMIT {limit:UInt32}`;
                params.push(['limit', filters.limit]);
            }

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
            return data.data.map(row => ({
                ...row,
                event_data: JSON.parse(row.event_data || '{}')
            }));
        } catch (error) {
            logger.error('Error finding events:', error);
            throw error;
        }
    }

    static async getEventCounts(filters = {}) {
        const client = getClickHouseClient();

        try {
            let query = `
        SELECT 
          event_type,
          count(*) as count
        FROM events
        WHERE 1=1
      `;

            const params = [];

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

            query += ` GROUP BY event_type ORDER BY count DESC`;

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
            logger.error('Error getting event counts:', error);
            throw error;
        }
    }
}

module.exports = Event;