package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/ritchermap/realtime/internal/services"
	"github.com/sirupsen/logrus"
)

type HealthHandler struct {
	connectionManager *services.ConnectionManager
	roomManager       *services.RoomManager
	presenceManager   *services.PresenceManager
	messageBroker     *services.MessageBroker
	logger            *logrus.Entry
}

func NewHealthHandler(cm *services.ConnectionManager, rm *services.RoomManager, pm *services.PresenceManager, mb *services.MessageBroker) *HealthHandler {
	return &HealthHandler{
		connectionManager: cm,
		roomManager:       rm,
		presenceManager:   pm,
		messageBroker:     mb,
		logger:            logrus.WithField("component", "health_handler"),
	}
}

func (h *HealthHandler) HandleHealth(w http.ResponseWriter, r *http.Request) {
	status := h.getHealthStatus()

	w.Header().Set("Content-Type", "application/json")

	if status["status"] == "healthy" {
		w.WriteHeader(http.StatusOK)
	} else {
		w.WriteHeader(http.StatusServiceUnavailable)
	}

	json.NewEncoder(w).Encode(status)
}

func (h *HealthHandler) HandleReadiness(w http.ResponseWriter, r *http.Request) {
	// Simple readiness check
	ready := map[string]interface{}{
		"ready":     true,
		"timestamp": time.Now().UTC(),
		"service":   "realtime-service",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(ready)
}

func (h *HealthHandler) HandleLiveness(w http.ResponseWriter, r *http.Request) {
	// Simple liveness check
	alive := map[string]interface{}{
		"alive":     true,
		"timestamp": time.Now().UTC(),
		"uptime":    time.Since(time.Now().Add(-time.Hour)), // Placeholder
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(alive)
}

func (h *HealthHandler) HandleStats(w http.ResponseWriter, r *http.Request) {
	stats := h.getSystemStats()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(stats)
}

func (h *HealthHandler) getHealthStatus() map[string]interface{} {
	status := "healthy"
	checks := make(map[string]interface{})

	// Check connection manager
	connectionCount := h.connectionManager.ConnectionCount()
	checks["connections"] = map[string]interface{}{
		"status": "healthy",
		"count":  connectionCount,
	}

	// Check message broker subscriptions
	subscriptions := h.messageBroker.GetSubscriptionStatus()
	allSubscriptionsHealthy := true
	for _, healthy := range subscriptions {
		if !healthy {
			allSubscriptionsHealthy = false
			break
		}
	}

	checks["message_broker"] = map[string]interface{}{
		"status":        map[bool]string{true: "healthy", false: "unhealthy"}[allSubscriptionsHealthy],
		"subscriptions": subscriptions,
	}

	// Check room manager
	rooms := h.roomManager.GetAllRooms()
	checks["rooms"] = map[string]interface{}{
		"status": "healthy",
		"count":  len(rooms),
	}

	// Check presence manager
	onlineUsers := h.presenceManager.GetOnlineUsers()
	checks["presence"] = map[string]interface{}{
		"status":       "healthy",
		"online_users": len(onlineUsers),
	}

	// Determine overall status
	for _, check := range checks {
		if checkMap, ok := check.(map[string]interface{}); ok {
			if checkMap["status"] != "healthy" {
				status = "unhealthy"
				break
			}
		}
	}

	return map[string]interface{}{
		"status":    status,
		"timestamp": time.Now().UTC(),
		"service":   "realtime-service",
		"version":   "1.0.0",
		"checks":    checks,
	}
}

func (h *HealthHandler) getSystemStats() map[string]interface{} {
	stats := map[string]interface{}{
		"timestamp": time.Now().UTC(),
		"service":   "realtime-service",
		"version":   "1.0.0",
	}

	// Connection stats
	connectionCount := h.connectionManager.ConnectionCount()
	stats["connections"] = map[string]interface{}{
		"total":   connectionCount,
		"by_game": h.getConnectionsByGame(),
	}

	// Room stats
	rooms := h.roomManager.GetAllRooms()
	roomStats := make(map[string]interface{})
	totalUsers := 0

	for roomID, room := range rooms {
		roomInfo := map[string]interface{}{
			"type":             room.Type,
			"connection_count": room.ConnectionCount(),
			"user_count":       room.UserCount(),
		}
		roomStats[roomID] = roomInfo
		totalUsers += room.UserCount()
	}

	stats["rooms"] = map[string]interface{}{
		"total":   len(rooms),
		"details": roomStats,
	}

	// Presence stats
	onlineUsers := h.presenceManager.GetOnlineUsers()
	stats["presence"] = map[string]interface{}{
		"online_users": len(onlineUsers),
		"total_users":  totalUsers,
	}

	// Message broker stats
	subscriptions := h.messageBroker.GetSubscriptionStatus()
	stats["message_broker"] = map[string]interface{}{
		"subscriptions": subscriptions,
	}

	return stats
}

func (h *HealthHandler) getConnectionsByGame() map[string]int {
	connectionsByGame := make(map[string]int)

	// This would need to be implemented in ConnectionManager
	// For now, return empty map
	return connectionsByGame
}
