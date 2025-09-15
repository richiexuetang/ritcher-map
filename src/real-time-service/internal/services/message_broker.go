package services

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/ritchermap/realtime/internal/models"
	"github.com/ritchermap/realtime/pkg/metrics"
	"github.com/sirupsen/logrus"
)

type MessageBroker struct {
	redisClient   *redis.Client
	roomManager   *RoomManager
	logger        *logrus.Entry
	subscriptions map[string]*redis.PubSub
	done          chan struct{}
}

func NewMessageBroker(redisClient *redis.Client, roomManager *RoomManager) *MessageBroker {
	mb := &MessageBroker{
		redisClient:   redisClient,
		roomManager:   roomManager,
		logger:        logrus.WithField("component", "message_broker"),
		subscriptions: make(map[string]*redis.PubSub),
		done:          make(chan struct{}),
	}

	// Subscribe to external events
	go mb.subscribeToExternalEvents()

	return mb
}

func (mb *MessageBroker) PublishToRoom(roomID, messageType string, data interface{}, senderUserID string) error {
	message := models.NewOutgoingMessage(messageType, "", senderUserID, data)
	message.Metadata["room_id"] = roomID

	messageData, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %w", err)
	}

	// Publish to local room
	if err := mb.roomManager.BroadcastToRoom(roomID, messageData); err != nil {
		mb.logger.WithError(err).WithField("room_id", roomID).Warn("Failed to broadcast to local room")
	}

	// Publish to Redis for other instances
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	channel := fmt.Sprintf("room:%s", roomID)
	if err := mb.redisClient.Publish(ctx, channel, messageData).Err(); err != nil {
		mb.logger.WithError(err).WithField("channel", channel).Error("Failed to publish to Redis")
		return fmt.Errorf("failed to publish to Redis: %w", err)
	}

	// Update metrics
	metrics.MessagesPublished.Inc()

	mb.logger.WithFields(logrus.Fields{
		"room_id":      roomID,
		"message_type": messageType,
		"sender":       senderUserID,
	}).Debug("Message published to room")

	return nil
}

func (mb *MessageBroker) PublishToUser(userID, messageType string, data interface{}) error {
	message := models.NewOutgoingMessage(messageType, "", "", data)
	message.Metadata["target_user"] = userID

	messageData, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %w", err)
	}

	// Publish to Redis for delivery to any instance where user is connected
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	channel := fmt.Sprintf("user:%s", userID)
	if err := mb.redisClient.Publish(ctx, channel, messageData).Err(); err != nil {
		mb.logger.WithError(err).WithField("channel", channel).Error("Failed to publish to Redis")
		return fmt.Errorf("failed to publish to Redis: %w", err)
	}

	// Update metrics
	metrics.MessagesPublished.Inc()

	mb.logger.WithFields(logrus.Fields{
		"user_id":      userID,
		"message_type": messageType,
	}).Debug("Message published to user")

	return nil
}

func (mb *MessageBroker) PublishGlobal(messageType string, data interface{}) error {
	message := models.NewOutgoingMessage(messageType, "", "", data)

	messageData, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %w", err)
	}

	// Publish to global channel
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := mb.redisClient.Publish(ctx, "global", messageData).Err(); err != nil {
		mb.logger.WithError(err).Error("Failed to publish global message")
		return fmt.Errorf("failed to publish global message: %w", err)
	}

	// Update metrics
	metrics.MessagesPublished.Inc()

	mb.logger.WithField("message_type", messageType).Debug("Global message published")

	return nil
}

func (mb *MessageBroker) subscribeToExternalEvents() {
	// Subscribe to external service events
	channels := []string{
		"marker-events",    // From marker service
		"user-events",      // From auth service
		"community-events", // From community service
		"system-events",    // System-wide events
	}

	for _, channel := range channels {
		go mb.subscribeToChannel(channel)
	}
}

func (mb *MessageBroker) subscribeToChannel(channel string) {
	ctx := context.Background()
	pubsub := mb.redisClient.Subscribe(ctx, channel)

	mb.subscriptions[channel] = pubsub

	mb.logger.WithField("channel", channel).Info("Subscribed to Redis channel")

	defer func() {
		pubsub.Close()
		delete(mb.subscriptions, channel)
		mb.logger.WithField("channel", channel).Info("Unsubscribed from Redis channel")
	}()

	ch := pubsub.Channel()

	for {
		select {
		case <-mb.done:
			return
		case msg := <-ch:
			if msg == nil {
				continue
			}

			if err := mb.handleExternalMessage(channel, msg.Payload); err != nil {
				mb.logger.WithError(err).WithFields(logrus.Fields{
					"channel": channel,
					"payload": msg.Payload,
				}).Error("Failed to handle external message")
			}
		}
	}
}

func (mb *MessageBroker) handleExternalMessage(channel, payload string) error {
	var message struct {
		EventType string      `json:"eventType"`
		GameID    string      `json:"gameId"`
		UserID    string      `json:"userId"`
		Data      interface{} `json:"data"`
	}

	if err := json.Unmarshal([]byte(payload), &message); err != nil {
		return fmt.Errorf("failed to unmarshal external message: %w", err)
	}

	// Update metrics
	metrics.ExternalMessagesReceived.Inc()

	mb.logger.WithFields(logrus.Fields{
		"channel":    channel,
		"event_type": message.EventType,
		"game_id":    message.GameID,
		"user_id":    message.UserID,
	}).Debug("Handling external message")

	// Route message based on event type and data
	switch channel {
	case "marker-events":
		return mb.handleMarkerEvent(message.EventType, message.GameID, message.Data)
	case "user-events":
		return mb.handleUserEvent(message.EventType, message.UserID, message.Data)
	case "community-events":
		return mb.handleCommunityEvent(message.EventType, message.GameID, message.Data)
	case "system-events":
		return mb.handleSystemEvent(message.EventType, message.Data)
	default:
		mb.logger.WithField("channel", channel).Warn("Unknown channel")
		return nil
	}
}

func (mb *MessageBroker) handleMarkerEvent(eventType, gameID string, data interface{}) error {
	// Broadcast marker events to game room
	gameRoom := fmt.Sprintf("game:%s", gameID)
	return mb.PublishToRoom(gameRoom, eventType, data, "system")
}

func (mb *MessageBroker) handleUserEvent(eventType, userID string, data interface{}) error {
	// Handle user-specific events
	switch eventType {
	case "user.banned", "user.suspended":
		// Disconnect user
		return mb.PublishToUser(userID, eventType, data)
	case "user.profile.updated":
		// Broadcast profile update to user's connections
		return mb.PublishToUser(userID, eventType, data)
	default:
		return nil
	}
}

func (mb *MessageBroker) handleCommunityEvent(eventType, gameID string, data interface{}) error {
	// Broadcast community events to game room
	gameRoom := fmt.Sprintf("game:%s", gameID)
	return mb.PublishToRoom(gameRoom, eventType, data, "system")
}

func (mb *MessageBroker) handleSystemEvent(eventType string, data interface{}) error {
	// Broadcast system events globally
	return mb.PublishGlobal(eventType, data)
}

func (mb *MessageBroker) GetSubscriptionStatus() map[string]bool {
	status := make(map[string]bool)

	for channel, pubsub := range mb.subscriptions {
		// Simple check - if pubsub exists, consider it active
		status[channel] = pubsub != nil
	}

	return status
}

func (mb *MessageBroker) Shutdown(ctx context.Context) error {
	mb.logger.Info("Shutting down message broker")

	close(mb.done)

	// Close all subscriptions
	for channel, pubsub := range mb.subscriptions {
		if err := pubsub.Close(); err != nil {
			mb.logger.WithError(err).WithField("channel", channel).Error("Failed to close subscription")
		}
	}

	return nil
}
