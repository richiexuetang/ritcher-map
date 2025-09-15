package models

import (
	"sync"
	"time"

	"github.com/sirupsen/logrus"
)

type Room struct {
	ID          string                 `json:"id"`
	GameID      string                 `json:"game_id"`
	Type        RoomType               `json:"type"`
	Connections map[string]*Connection `json:"-"`
	Metadata    map[string]string      `json:"metadata"`
	CreatedAt   time.Time              `json:"created_at"`
	UpdatedAt   time.Time              `json:"updated_at"`

	mu     sync.RWMutex
	logger *logrus.Entry
}

type RoomType string

const (
	RoomTypeGame          RoomType = "game"
	RoomTypeMarker        RoomType = "marker"
	RoomTypeCollaboration RoomType = "collaboration"
	RoomTypePrivate       RoomType = "private"
)

func NewRoom(id, gameID string, roomType RoomType) *Room {
	return &Room{
		ID:          id,
		GameID:      gameID,
		Type:        roomType,
		Connections: make(map[string]*Connection),
		Metadata:    make(map[string]string),
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
		logger: logrus.WithFields(logrus.Fields{
			"room_id": id,
			"game_id": gameID,
			"type":    roomType,
		}),
	}
}

func (r *Room) AddConnection(conn *Connection) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.Connections[conn.ID] = conn
	r.UpdatedAt = time.Now()

	r.logger.WithField("user_id", conn.UserID).Debug("Connection added to room")
}

func (r *Room) RemoveConnection(connectionID string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if conn, exists := r.Connections[connectionID]; exists {
		delete(r.Connections, connectionID)
		r.UpdatedAt = time.Now()

		r.logger.WithField("user_id", conn.UserID).Debug("Connection removed from room")
	}
}

func (r *Room) GetConnection(connectionID string) (*Connection, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	conn, exists := r.Connections[connectionID]
	return conn, exists
}

func (r *Room) GetConnections() []*Connection {
	r.mu.RLock()
	defer r.mu.RUnlock()

	connections := make([]*Connection, 0, len(r.Connections))
	for _, conn := range r.Connections {
		connections = append(connections, conn)
	}
	return connections
}

func (r *Room) GetConnectionsByUserID(userID string) []*Connection {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var connections []*Connection
	for _, conn := range r.Connections {
		if conn.UserID == userID {
			connections = append(connections, conn)
		}
	}
	return connections
}

func (r *Room) ConnectionCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()

	return len(r.Connections)
}

func (r *Room) UserCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()

	users := make(map[string]bool)
	for _, conn := range r.Connections {
		users[conn.UserID] = true
	}
	return len(users)
}

func (r *Room) GetUsers() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	users := make(map[string]bool)
	for _, conn := range r.Connections {
		users[conn.UserID] = true
	}

	userList := make([]string, 0, len(users))
	for userID := range users {
		userList = append(userList, userID)
	}
	return userList
}

func (r *Room) BroadcastToAll(message []byte, excludeConnections ...string) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	excludeMap := make(map[string]bool)
	for _, connID := range excludeConnections {
		excludeMap[connID] = true
	}

	for connID, conn := range r.Connections {
		if !excludeMap[connID] {
			select {
			case conn.Send <- message:
			default:
				r.logger.WithField("connection_id", connID).Warn("Failed to send message to connection")
			}
		}
	}
}

func (r *Room) BroadcastToUser(userID string, message []byte) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for _, conn := range r.Connections {
		if conn.UserID == userID {
			select {
			case conn.Send <- message:
			default:
				r.logger.WithField("connection_id", conn.ID).Warn("Failed to send message to user connection")
			}
		}
	}
}

func (r *Room) IsEmpty() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()

	return len(r.Connections) == 0
}

func (r *Room) SetMetadata(key, value string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	r.Metadata[key] = value
	r.UpdatedAt = time.Now()
}

func (r *Room) GetMetadata(key string) (string, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	value, exists := r.Metadata[key]
	return value, exists
}

func (r *Room) Logger() *logrus.Entry {
	return r.logger
}
