package models

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/ritchermap/realtime/internal/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type IncomingMessage struct {
	Type     string            `json:"type"`
	GameID   string            `json:"game_id"`
	RoomID   string            `json:"room_id,omitempty"`
	Data     json.RawMessage   `json:"data"`
	Metadata map[string]string `json:"metadata,omitempty"`
}

type OutgoingMessage struct {
	ID        string            `json:"id"`
	Type      string            `json:"type"`
	GameID    string            `json:"game_id"`
	UserID    string            `json:"user_id"`
	Timestamp time.Time         `json:"timestamp"`
	Data      interface{}       `json:"data"`
	Metadata  map[string]string `json:"metadata,omitempty"`
}

type LocationUpdate struct {
	Latitude  float64   `json:"latitude"`
	Longitude float64   `json:"longitude"`
	Altitude  float64   `json:"altitude,omitempty"`
	Heading   float64   `json:"heading,omitempty"`
	Speed     float64   `json:"speed,omitempty"`
	Timestamp time.Time `json:"timestamp"`
}

type MarkerData struct {
	MarkerID        string                 `json:"marker_id"`
	CategoryID      string                 `json:"category_id,omitempty"`
	Position        LocationUpdate         `json:"position"`
	Title           string                 `json:"title"`
	Description     string                 `json:"description,omitempty"`
	Metadata        map[string]interface{} `json:"metadata,omitempty"`
	VisibilityLevel int32                  `json:"visibility_level"`
}

type PresenceData struct {
	UserID       string         `json:"user_id"`
	Username     string         `json:"username"`
	Status       string         `json:"status"`
	CustomStatus string         `json:"custom_status,omitempty"`
	Location     LocationUpdate `json:"location,omitempty"`
}

type CollaborationData struct {
	SessionID    string      `json:"session_id"`
	ResourceType string      `json:"resource_type"`
	ResourceID   string      `json:"resource_id"`
	Operation    string      `json:"operation"`
	Data         interface{} `json:"data"`
	Revision     int64       `json:"revision"`
}

func NewOutgoingMessage(msgType, gameID, userID string, data interface{}) *OutgoingMessage {
	return &OutgoingMessage{
		ID:        uuid.New().String(),
		Type:      msgType,
		GameID:    gameID,
		UserID:    userID,
		Timestamp: time.Now(),
		Data:      data,
		Metadata:  make(map[string]string),
	}
}

func (m *IncomingMessage) Validate() error {
	if m.Type == "" {
		return fmt.Errorf("message type is required")
	}
	if m.GameID == "" {
		return fmt.Errorf("game_id is required")
	}
	return nil
}

func (m *OutgoingMessage) ToRealtimeMessage() (*proto.RealtimeMessage, error) {
	payload, err := json.Marshal(m.Data)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload: %w", err)
	}

	msgType := parseMessageType(m.Type)

	return &proto.RealtimeMessage{
		Id:        m.ID,
		Type:      msgType,
		GameId:    m.GameID,
		UserId:    m.UserID,
		Timestamp: timestamppb.New(m.Timestamp),
		Payload:   payload,
		Metadata:  m.Metadata,
	}, nil
}

func parseMessageType(msgType string) proto.MessageType {
	switch msgType {
	case "marker.created":
		return proto.MessageType_MARKER_CREATED
	case "marker.updated":
		return proto.MessageType_MARKER_UPDATED
	case "marker.deleted":
		return proto.MessageType_MARKER_DELETED
	case "user.joined":
		return proto.MessageType_USER_JOINED
	case "user.left":
		return proto.MessageType_USER_LEFT
	case "user.location":
		return proto.MessageType_USER_LOCATION_UPDATE
	case "user.status":
		return proto.MessageType_USER_STATUS_UPDATE
	case "collaboration.sync":
		return proto.MessageType_COLLABORATION_SYNC
	case "collaboration.cursor":
		return proto.MessageType_COLLABORATION_CURSOR
	case "ping":
		return proto.MessageType_PING
	case "pong":
		return proto.MessageType_PONG
	case "error":
		return proto.MessageType_ERROR
	default:
		return proto.MessageType_UNKNOWN
	}
}

func (l *LocationUpdate) ToProtoPosition() *proto.Position {
	return &proto.Position{
		Latitude:  l.Latitude,
		Longitude: l.Longitude,
		Altitude:  l.Altitude,
	}
}

func (m *MarkerData) ToProtoMarkerCreated(createdBy string) *proto.MarkerCreatedEvent {
	metadata := make(map[string]string)
	for k, v := range m.Metadata {
		if str, ok := v.(string); ok {
			metadata[k] = str
		}
	}

	return &proto.MarkerCreatedEvent{
		MarkerId:        m.MarkerID,
		CategoryId:      m.CategoryID,
		Position:        m.Position.ToProtoPosition(),
		Title:           m.Title,
		Description:     m.Description,
		Metadata:        metadata,
		VisibilityLevel: m.VisibilityLevel,
		CreatedBy:       createdBy,
	}
}

func (p *PresenceData) ToProtoUserJoined(gameID string) *proto.UserJoinedEvent {
	status := parseUserStatus(p.Status)

	return &proto.UserJoinedEvent{
		UserId:          p.UserID,
		Username:        p.Username,
		GameId:          gameID,
		InitialLocation: p.Location.ToProtoPosition(),
		Status:          status,
		Metadata:        make(map[string]string),
	}
}

func parseUserStatus(status string) proto.UserStatus {
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
