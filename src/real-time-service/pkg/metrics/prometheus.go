package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	// Connection metrics
	ConnectedClients = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "realtime_connected_clients_total",
		Help: "The total number of connected WebSocket clients",
	})

	TotalConnections = promauto.NewCounter(prometheus.CounterOpts{
		Name: "realtime_connections_total",
		Help: "The total number of WebSocket connections created",
	})

	ConnectionDuration = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "realtime_connection_duration_seconds",
		Help:    "The duration of WebSocket connections",
		Buckets: prometheus.ExponentialBuckets(1, 2, 10),
	})

	// Message metrics
	MessagesReceived = promauto.NewCounter(prometheus.CounterOpts{
		Name: "realtime_messages_received_total",
		Help: "The total number of messages received from clients",
	})

	MessagesSent = promauto.NewCounter(prometheus.CounterOpts{
		Name: "realtime_messages_sent_total",
		Help: "The total number of messages sent to clients",
	})

	MessagesPublished = promauto.NewCounter(prometheus.CounterOpts{
		Name: "realtime_messages_published_total",
		Help: "The total number of messages published to Redis",
	})

	ExternalMessagesReceived = promauto.NewCounter(prometheus.CounterOpts{
		Name: "realtime_external_messages_received_total",
		Help: "The total number of external messages received from Redis",
	})

	MessageProcessingDuration = promauto.NewHistogram(prometheus.HistogramOpts{
		Name:    "realtime_message_processing_duration_seconds",
		Help:    "The time it takes to process incoming messages",
		Buckets: prometheus.ExponentialBuckets(0.001, 2, 10),
	})

	// Room metrics
	ActiveRooms = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "realtime_active_rooms_total",
		Help: "The total number of active rooms",
	})

	RoomConnections = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "realtime_room_connections",
		Help: "The number of connections per room",
	}, []string{"room_type"})

	// Presence metrics
	OnlineUsers = promauto.NewGauge(prometheus.GaugeOpts{
		Name: "realtime_online_users_total",
		Help: "The total number of online users",
	})

	UsersByGame = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "realtime_users_by_game",
		Help: "The number of users per game",
	}, []string{"game_id"})

	// Error metrics
	Errors = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "realtime_errors_total",
		Help: "The total number of errors",
	}, []string{"type", "component"})

	// Redis metrics
	RedisOperations = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "realtime_redis_operations_total",
		Help: "The total number of Redis operations",
	}, []string{"operation", "status"})

	RedisOperationDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "realtime_redis_operation_duration_seconds",
		Help:    "The duration of Redis operations",
		Buckets: prometheus.ExponentialBuckets(0.001, 2, 10),
	}, []string{"operation"})
)

func RecordError(errorType, component string) {
	Errors.WithLabelValues(errorType, component).Inc()
}

func RecordRedisOperation(operation, status string, duration float64) {
	RedisOperations.WithLabelValues(operation, status).Inc()
	RedisOperationDuration.WithLabelValues(operation).Observe(duration)
}

func UpdateRoomMetrics(roomType string, connections int) {
	RoomConnections.WithLabelValues(roomType).Set(float64(connections))
}

func UpdateGameUserCount(gameID string, count int) {
	UsersByGame.WithLabelValues(gameID).Set(float64(count))
}
