package services

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/ritchermap/realtime/internal/config"
	"github.com/ritchermap/realtime/internal/models"
	"github.com/ritchermap/realtime/internal/proto"
	"github.com/ritchermap/realtime/pkg/metrics"
	"github.com/sirupsen/logrus"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type ConnectionManager struct {
	connections     map[string]*models.Connection
	mu              sync.RWMutex
	config          *config.WebSocketConfig
	roomManager     *RoomManager
	presenceManager *PresenceManager
	messageBroker   *MessageBroker
	logger          *logrus.Entry

	// Ping/Pong handling
	pingTicker *time.Ticker
	done       chan struct{}
}

func NewConnectionManager(cfg *config.WebSocketConfig, roomManager *RoomManager, presenceManager *PresenceManager, messageBroker *MessageBroker) *ConnectionManager {
	cm := &ConnectionManager{
		connections:     make(map[string]*models.Connection),
		config:          cfg,
		roomManager:     roomManager,
		presenceManager: presenceManager,
		messageBroker:   messageBroker,
		logger:          logrus.WithField("component", "connection_manager"),
		done:            make(chan struct{}),
	}

	// Start ping ticker
	cm.pingTicker = time.NewTicker(cfg.PingPeriod)
	go cm.pingConnections()

	return cm
}

func (cm *ConnectionManager) AddConnection(conn *models.Connection) error {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	// Check max connections limit
	if len(cm.connections) >= cm.config.MaxConnections {
		return fmt.Errorf("maximum connections reached")
	}

	cm.connections[conn.ID] = conn
	conn.SetStatus(models.StatusConnected)

	// Update metrics
	metrics.ConnectedClients.Inc()
	metrics.TotalConnections.Inc()

	// Add to presence
	cm.presenceManager.UserJoined(conn.UserID, conn.GameID, conn.Username)

	// Join game room
	gameRoom := fmt.Sprintf("game:%s", conn.GameID)
	cm.roomManager.JoinRoom(gameRoom, conn)

	cm.logger.WithFields(logrus.Fields{
		"connection_id": conn.ID,
		"user_id":       conn.UserID,
		"game_id":       conn.GameID,
	}).Info("Connection added")

	// Start connection handlers
	go cm.handleConnection(conn)

	return nil
}

func (cm *ConnectionManager) RemoveConnection(connectionID string) {
	cm.mu.Lock()
	conn, exists := cm.connections[connectionID]
	if !exists {
		cm.mu.Unlock()
		return
	}
	delete(cm.connections, connectionID)
	cm.mu.Unlock()

	// Update metrics
	metrics.ConnectedClients.Dec()

	// Remove from all rooms
	for _, roomID := range conn.GetRooms() {
		cm.roomManager.LeaveRoom(roomID, conn)
	}

	// Update presence
	cm.presenceManager.UserLeft(conn.UserID, conn.GameID)

	// Close connection
	conn.Close()

	cm.logger.WithFields(logrus.Fields{
		"connection_id": conn.ID,
		"user_id":       conn.UserID,
		"game_id":       conn.GameID,
	}).Info("Connection removed")
}

func (cm *ConnectionManager) GetConnection(connectionID string) (*models.Connection, bool) {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	conn, exists := cm.connections[connectionID]
	return conn, exists
}

func (cm *ConnectionManager) GetConnectionsByUser(userID string) []*models.Connection {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	var userConnections []*models.Connection
	for _, conn := range cm.connections {
		if conn.UserID == userID {
			userConnections = append(userConnections, conn)
		}
	}
	return userConnections
}

func (cm *ConnectionManager) GetConnectionsByGame(gameID string) []*models.Connection {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	var gameConnections []*models.Connection
	for _, conn := range cm.connections {
		if conn.GameID == gameID {
			gameConnections = append(gameConnections, conn)
		}
	}
	return gameConnections
}

func (cm *ConnectionManager) ConnectionCount() int {
	cm.mu.RLock()
	defer cm.mu.RUnlock()

	return len(cm.connections)
}

func (cm *ConnectionManager) handleConnection(conn *models.Connection) {
	defer cm.RemoveConnection(conn.ID)

	// Configure WebSocket connection
	conn.Conn.SetReadLimit(cm.config.MaxMessageSize)
	conn.Conn.SetReadDeadline(time.Now().Add(cm.config.PongWait))
	conn.Conn.SetPongHandler(func(string) error {
		conn.Conn.SetReadDeadline(time.Now().Add(cm.config.PongWait))
		conn.UpdateLastPing()
		return nil
	})

	// Start read and write pumps
	go cm.writePump(conn)
	cm.readPump(conn)
}

func (cm *ConnectionManager) readPump(conn *models.Connection) {
	defer func() {
		conn.Close()
	}()

	for {
		select {
		case <-conn.Context().Done():
			return
		default:
			_, messageData, err := conn.Conn.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					conn.Logger().WithError(err).Error("WebSocket read error")
				}
				return
			}

			// Update metrics
			metrics.MessagesReceived.Inc()

			// Handle message
			if err := cm.handleIncomingMessage(conn, messageData); err != nil {
				conn.Logger().WithError(err).Error("Failed to handle incoming message")
				conn.SendError("MESSAGE_ERROR", "Failed to process message", err.Error())
			}
		}
	}
}

func (cm *ConnectionManager) writePump(conn *models.Connection) {
	ticker := time.NewTicker(cm.config.PingPeriod)
	defer func() {
		ticker.Stop()
		conn.Close()
	}()

	for {
		select {
		case <-conn.Context().Done():
			return
		case message, ok := <-conn.Send:
			conn.Conn.SetWriteDeadline(time.Now().Add(cm.config.WriteWait))
			if !ok {
				conn.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := conn.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			// Add queued messages to the current writer
			n := len(conn.Send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-conn.Send)
			}

			if err := w.Close(); err != nil {
				return
			}

			// Update metrics
			metrics.MessagesSent.Inc()

		case <-ticker.C:
			conn.Conn.SetWriteDeadline(time.Now().Add(cm.config.WriteWait))
			if err := conn.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (cm *ConnectionManager) handleIncomingMessage(conn *models.Connection, messageData []byte) error {
	var incomingMsg models.IncomingMessage
	if err := json.Unmarshal(messageData, &incomingMsg); err != nil {
		return fmt.Errorf("invalid JSON: %w", err)
	}

	if err := incomingMsg.Validate(); err != nil {
		return fmt.Errorf("invalid message: %w", err)
	}

	conn.Logger().WithFields(logrus.Fields{
		"message_type": incomingMsg.Type,
		"game_id":      incomingMsg.GameID,
		"room_id":      incomingMsg.RoomID,
	}).Debug("Handling incoming message")

	switch incomingMsg.Type {
	case "user.location":
		return cm.handleLocationUpdate(conn, incomingMsg.Data)
	case "user.status":
		return cm.handleStatusUpdate(conn, incomingMsg.Data)
	case "marker.create":
		return cm.handleMarkerCreate(conn, incomingMsg.Data)
	case "collaboration.sync":
		return cm.handleCollaborationSync(conn, incomingMsg.Data)
	case "room.join":
		return cm.handleRoomJoin(conn, incomingMsg.Data)
	case "room.leave":
		return cm.handleRoomLeave(conn, incomingMsg.Data)
	case "pong":
		return cm.handlePong(conn, incomingMsg.Data)
	default:
		return fmt.Errorf("unknown message type: %s", incomingMsg.Type)
	}
}

func (cm *ConnectionManager) handleLocationUpdate(conn *models.Connection, data json.RawMessage) error {
	var location models.LocationUpdate
	if err := json.Unmarshal(data, &location); err != nil {
		return fmt.Errorf("invalid location data: %w", err)
	}

	// Update presence
	cm.presenceManager.UpdateUserLocation(conn.UserID, conn.GameID, &location)

	// Broadcast to game room
	gameRoom := fmt.Sprintf("game:%s", conn.GameID)
	event := &proto.UserLocationUpdateEvent{
		UserId:    conn.UserID,
		GameId:    conn.GameID,
		Position:  location.ToProtoPosition(),
		Heading:   location.Heading,
		Speed:     location.Speed,
		Timestamp: timestamppb.New(location.Timestamp),
	}

	return cm.messageBroker.PublishToRoom(gameRoom, "user.location", event, conn.UserID)
}

func (cm *ConnectionManager) handleStatusUpdate(conn *models.Connection, data json.RawMessage) error {
	var status models.PresenceData
	if err := json.Unmarshal(data, &status); err != nil {
		return fmt.Errorf("invalid status data: %w", err)
	}

	// Update presence
	cm.presenceManager.UpdateUserStatus(conn.UserID, conn.GameID, status.Status, status.CustomStatus)

	// Broadcast to game room
	gameRoom := fmt.Sprintf("game:%s", conn.GameID)
	event := &proto.UserStatusUpdateEvent{
		UserId:       conn.UserID,
		GameId:       conn.GameID,
		Status:       parseProtoUserStatus(status.Status),
		CustomStatus: status.CustomStatus,
	}

	return cm.messageBroker.PublishToRoom(gameRoom, "user.status", event, conn.UserID)
}

func (cm *ConnectionManager) handleMarkerCreate(conn *models.Connection, data json.RawMessage) error {
	var marker models.MarkerData
	if err := json.Unmarshal(data, &marker); err != nil {
		return fmt.Errorf("invalid marker data: %w", err)
	}

	// Broadcast marker creation to game room
	gameRoom := fmt.Sprintf("game:%s", conn.GameID)
	event := marker.ToProtoMarkerCreated(conn.UserID)

	return cm.messageBroker.PublishToRoom(gameRoom, "marker.created", event, conn.UserID)
}

func (cm *ConnectionManager) handleCollaborationSync(conn *models.Connection, data json.RawMessage) error {
	var collab models.CollaborationData
	if err := json.Unmarshal(data, &collab); err != nil {
		return fmt.Errorf("invalid collaboration data: %w", err)
	}

	// Broadcast to collaboration room
	collabRoom := fmt.Sprintf("collab:%s:%s", collab.ResourceType, collab.ResourceID)
	event := &proto.CollaborationSyncEvent{
		SessionId:    collab.SessionID,
		UserId:       conn.UserID,
		ResourceType: collab.ResourceType,
		ResourceId:   collab.ResourceID,
		Operation:    collab.Operation,
		Data:         []byte(fmt.Sprintf("%v", collab.Data)),
		Revision:     collab.Revision,
	}

	return cm.messageBroker.PublishToRoom(collabRoom, "collaboration.sync", event, conn.UserID)
}

func (cm *ConnectionManager) handleRoomJoin(conn *models.Connection, data json.RawMessage) error {
	var roomData struct {
		RoomID string `json:"room_id"`
	}
	if err := json.Unmarshal(data, &roomData); err != nil {
		return fmt.Errorf("invalid room data: %w", err)
	}

	cm.roomManager.JoinRoom(roomData.RoomID, conn)
	return nil
}

func (cm *ConnectionManager) handleRoomLeave(conn *models.Connection, data json.RawMessage) error {
	var roomData struct {
		RoomID string `json:"room_id"`
	}
	if err := json.Unmarshal(data, &roomData); err != nil {
		return fmt.Errorf("invalid room data: %w", err)
	}

	cm.roomManager.LeaveRoom(roomData.RoomID, conn)
	return nil
}

func (cm *ConnectionManager) handlePong(conn *models.Connection, data json.RawMessage) error {
	var pong proto.PongEvent
	if err := json.Unmarshal(data, &pong); err != nil {
		return fmt.Errorf("invalid pong data: %w", err)
	}

	conn.UpdateLastPing()
	return nil
}

func (cm *ConnectionManager) pingConnections() {
	defer cm.pingTicker.Stop()

	for {
		select {
		case <-cm.done:
			return
		case <-cm.pingTicker.C:
			cm.mu.RLock()
			for _, conn := range cm.connections {
				if time.Since(conn.LastPing) > cm.config.PongWait {
					conn.Logger().Warn("Connection ping timeout")
					go cm.RemoveConnection(conn.ID)
				}
			}
			cm.mu.RUnlock()
		}
	}
}

func (cm *ConnectionManager) Shutdown(ctx context.Context) error {
	cm.logger.Info("Shutting down connection manager")

	close(cm.done)

	// Close all connections
	cm.mu.Lock()
	connections := make([]*models.Connection, 0, len(cm.connections))
	for _, conn := range cm.connections {
		connections = append(connections, conn)
	}
	cm.mu.Unlock()

	for _, conn := range connections {
		conn.Close()
	}

	return nil
}

func parseProtoUserStatus(status string) proto.UserStatus {
	switch status {
	case "online":
		return proto.UserStatus_ONLINE
	case "away":
		return proto.UserStatus_AWAY
	case "busy":
		return proto.UserStatus_BUSY
	case "invisible":
		return proto.UserStatus_INVISIBLE
	case "offline":
		return proto.UserStatus_OFFLINE
	default:
		return proto.UserStatus_UNKNOWN_STATUS
	}
}
