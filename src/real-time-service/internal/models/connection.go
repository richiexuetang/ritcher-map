package models

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/ritchermap/realtime/internal/proto"
	"github.com/sirupsen/logrus"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type Connection struct {
	ID          string            `json:"id"`
	UserID      string            `json:"user_id"`
	GameID      string            `json:"game_id"`
	Username    string            `json:"username"`
	Conn        *websocket.Conn   `json:"-"`
	Send        chan []byte       `json:"-"`
	Rooms       map[string]bool   `json:"rooms"`
	Metadata    map[string]string `json:"metadata"`
	ConnectedAt time.Time         `json:"connected_at"`
	LastPing    time.Time         `json:"last_ping"`
	ClientIP    string            `json:"client_ip"`
	UserAgent   string            `json:"user_agent"`
	Status      ConnectionStatus  `json:"status"`

	mu     sync.RWMutex
	ctx    context.Context
	cancel context.CancelFunc
	logger *logrus.Entry
}

type ConnectionStatus int

const (
	StatusConnecting ConnectionStatus = iota
	StatusConnected
	StatusDisconnecting
	StatusDisconnected
)

func (s ConnectionStatus) String() string {
	switch s {
	case StatusConnecting:
		return "connecting"
	case StatusConnected:
		return "connected"
	case StatusDisconnecting:
		return "disconnecting"
	case StatusDisconnected:
		return "disconnected"
	default:
		return "unknown"
	}
}

func NewConnection(conn *websocket.Conn, userID, gameID, username, clientIP, userAgent string) *Connection {
	ctx, cancel := context.WithCancel(context.Background())

	c := &Connection{
		ID:          uuid.New().String(),
		UserID:      userID,
		GameID:      gameID,
		Username:    username,
		Conn:        conn,
		Send:        make(chan []byte, 256),
		Rooms:       make(map[string]bool),
		Metadata:    make(map[string]string),
		ConnectedAt: time.Now(),
		LastPing:    time.Now(),
		ClientIP:    clientIP,
		UserAgent:   userAgent,
		Status:      StatusConnecting,
		ctx:         ctx,
		cancel:      cancel,
		logger: logrus.WithFields(logrus.Fields{
			"connection_id": userID,
			"user_id":       userID,
			"game_id":       gameID,
		}),
	}

	// Join game room by default
	c.JoinRoom(fmt.Sprintf("game:%s", gameID))

	return c
}

func (c *Connection) SetStatus(status ConnectionStatus) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.Status = status
}

func (c *Connection) GetStatus() ConnectionStatus {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.Status
}

func (c *Connection) JoinRoom(roomID string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.Rooms[roomID] = true
	c.logger.Debugf("Joined room: %s", roomID)
}

func (c *Connection) LeaveRoom(roomID string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.Rooms, roomID)
	c.logger.Debugf("Left room: %s", roomID)
}

func (c *Connection) IsInRoom(roomID string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.Rooms[roomID]
}

func (c *Connection) GetRooms() []string {
	c.mu.RLock()
	defer c.mu.RUnlock()

	rooms := make([]string, 0, len(c.Rooms))
	for room := range c.Rooms {
		rooms = append(rooms, room)
	}
	return rooms
}

func (c *Connection) SendMessage(message *proto.RealtimeMessage) error {
	data, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %w", err)
	}

	select {
	case c.Send <- data:
		return nil
	case <-c.ctx.Done():
		return fmt.Errorf("connection closed")
	default:
		c.logger.Warn("Send channel is full, dropping message")
		return fmt.Errorf("send buffer full")
	}
}

func (c *Connection) SendJSON(data interface{}) error {
	jsonData, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("failed to marshal JSON: %w", err)
	}

	select {
	case c.Send <- jsonData:
		return nil
	case <-c.ctx.Done():
		return fmt.Errorf("connection closed")
	default:
		c.logger.Warn("Send channel is full, dropping message")
		return fmt.Errorf("send buffer full")
	}
}

func (c *Connection) SendError(code, message, details string) error {
	errorEvent := &proto.ErrorEvent{
		Code:        code,
		Message:     message,
		Details:     details,
		Recoverable: true,
	}

	errorData, err := json.Marshal(errorEvent)
	if err != nil {
		return fmt.Errorf("failed to marshal error: %w", err)
	}

	realtimeMessage := &proto.RealtimeMessage{
		Id:        uuid.New().String(),
		Type:      proto.MessageType_ERROR,
		UserId:    c.UserID,
		GameId:    c.GameID,
		Timestamp: timestamppb.Now(),
		Payload:   errorData,
	}

	return c.SendMessage(realtimeMessage)
}

func (c *Connection) Ping() error {
	pingEvent := &proto.PingEvent{
		Timestamp: timestamppb.Now(),
	}

	pingData, err := json.Marshal(pingEvent)
	if err != nil {
		return fmt.Errorf("failed to marshal ping: %w", err)
	}

	realtimeMessage := &proto.RealtimeMessage{
		Id:        uuid.New().String(),
		Type:      proto.MessageType_PING,
		UserId:    c.UserID,
		GameId:    c.GameID,
		Timestamp: timestamppb.Now(),
		Payload:   pingData,
	}

	c.mu.Lock()
	c.LastPing = time.Now()
	c.mu.Unlock()

	return c.SendMessage(realtimeMessage)
}

func (c *Connection) UpdateLastPing() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.LastPing = time.Now()
}

func (c *Connection) Close() error {
	c.SetStatus(StatusDisconnecting)
	c.cancel()

	// Close send channel
	select {
	case <-c.Send:
	default:
		close(c.Send)
	}

	// Close WebSocket connection
	if c.Conn != nil {
		return c.Conn.Close()
	}

	c.SetStatus(StatusDisconnected)
	return nil
}

func (c *Connection) Context() context.Context {
	return c.ctx
}

func (c *Connection) Logger() *logrus.Entry {
	return c.logger
}

func (c *Connection) ToConnectionInfo() *proto.ConnectionInfo {
	c.mu.RLock()
	defer c.mu.RUnlock()

	return &proto.ConnectionInfo{
		ConnectionId: c.ID,
		UserId:       c.UserID,
		GameId:       c.GameID,
		ConnectedAt:  timestamppb.New(c.ConnectedAt),
		ClientIp:     c.ClientIP,
		UserAgent:    c.UserAgent,
		Metadata:     c.Metadata,
	}
}
