package handlers

import (
	"net/http"
	"strings"

	"github.com/gorilla/websocket"
	"github.com/ritchermap/realtime/internal/config"
	"github.com/ritchermap/realtime/internal/models"
	"github.com/ritchermap/realtime/internal/services"
	"github.com/ritchermap/realtime/internal/utils"
	"github.com/sirupsen/logrus"
)

type WebSocketHandler struct {
	upgrader          websocket.Upgrader
	connectionManager *services.ConnectionManager
	authValidator     *utils.AuthValidator
	config            *config.WebSocketConfig
	logger            *logrus.Entry
}

func NewWebSocketHandler(cm *services.ConnectionManager, authValidator *utils.AuthValidator, cfg *config.WebSocketConfig) *WebSocketHandler {
	upgrader := websocket.Upgrader{
		ReadBufferSize:   cfg.ReadBufferSize,
		WriteBufferSize:  cfg.WriteBufferSize,
		HandshakeTimeout: cfg.HandshakeTimeout,
		CheckOrigin: func(r *http.Request) bool {
			if !cfg.CheckOrigin {
				return true
			}
			origin := r.Header.Get("Origin")
			// Add your origin validation logic here
			return isAllowedOrigin(origin)
		},
	}

	return &WebSocketHandler{
		upgrader:          upgrader,
		connectionManager: cm,
		authValidator:     authValidator,
		config:            cfg,
		logger:            logrus.WithField("component", "websocket_handler"),
	}
}

func (h *WebSocketHandler) HandleConnection(w http.ResponseWriter, r *http.Request) {
	// Extract authentication information
	userID, gameID, username, err := h.extractAuthInfo(r)
	if err != nil {
		h.logger.WithError(err).Warn("Authentication failed")
		http.Error(w, "Authentication required", http.StatusUnauthorized)
		return
	}

	// Upgrade connection to WebSocket
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		h.logger.WithError(err).Error("Failed to upgrade connection")
		return
	}

	// Get client info
	clientIP := getClientIP(r)
	userAgent := r.Header.Get("User-Agent")

	// Create connection object
	connection := models.NewConnection(conn, userID, gameID, username, clientIP, userAgent)

	h.logger.WithFields(logrus.Fields{
		"connection_id": connection.ID,
		"user_id":       userID,
		"game_id":       gameID,
		"client_ip":     clientIP,
	}).Info("New WebSocket connection")

	// Add to connection manager
	if err := h.connectionManager.AddConnection(connection); err != nil {
		h.logger.WithError(err).Error("Failed to add connection")
		connection.Close()
		return
	}
}

func (h *WebSocketHandler) extractAuthInfo(r *http.Request) (userID, gameID, username string, err error) {
	// Try JWT token first
	token := extractToken(r)
	if token != "" {
		claims, err := h.authValidator.ValidateToken(token)
		if err == nil {
			return claims.UserID, claims.GameID, claims.Username, nil
		}
		h.logger.WithError(err).Debug("JWT validation failed, trying query params")
	}

	// Fallback to query parameters (for development/testing)
	userID = r.URL.Query().Get("user_id")
	gameID = r.URL.Query().Get("game_id")
	username = r.URL.Query().Get("username")

	if userID == "" || gameID == "" {
		return "", "", "", utils.ErrMissingAuth
	}

	if username == "" {
		username = userID // Use userID as username fallback
	}

	return userID, gameID, username, nil
}

func extractToken(r *http.Request) string {
	// Check Authorization header
	authHeader := r.Header.Get("Authorization")
	if authHeader != "" {
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) == 2 && parts[0] == "Bearer" {
			return parts[1]
		}
	}

	// Check query parameter
	if token := r.URL.Query().Get("token"); token != "" {
		return token
	}

	// Check cookie
	if cookie, err := r.Cookie("auth_token"); err == nil {
		return cookie.Value
	}

	return ""
}

func getClientIP(r *http.Request) string {
	// Check X-Forwarded-For header
	xForwardedFor := r.Header.Get("X-Forwarded-For")
	if xForwardedFor != "" {
		// Take the first IP if multiple are present
		ips := strings.Split(xForwardedFor, ",")
		return strings.TrimSpace(ips[0])
	}

	// Check X-Real-IP header
	xRealIP := r.Header.Get("X-Real-IP")
	if xRealIP != "" {
		return xRealIP
	}

	// Fall back to RemoteAddr
	ip := r.RemoteAddr
	if colon := strings.LastIndex(ip, ":"); colon != -1 {
		ip = ip[:colon]
	}

	return ip
}

func isAllowedOrigin(origin string) bool {
	// Define allowed origins
	allowedOrigins := []string{
		"http://localhost:3000",
		"https://ritcher.dev",
		"https://app.ritcher.dev",
	}

	for _, allowed := range allowedOrigins {
		if origin == allowed {
			return true
		}
	}

	return false
}
