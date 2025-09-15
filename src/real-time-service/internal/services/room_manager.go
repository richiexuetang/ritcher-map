package services

import (
	"fmt"
	"sync"
	"time"

	"github.com/ritchermap/realtime/internal/models"
	"github.com/sirupsen/logrus"
)

type RoomManager struct {
	rooms  map[string]*models.Room
	mu     sync.RWMutex
	logger *logrus.Entry

	// Cleanup
	cleanupTicker *time.Ticker
	done          chan struct{}
}

func NewRoomManager() *RoomManager {
	rm := &RoomManager{
		rooms:  make(map[string]*models.Room),
		logger: logrus.WithField("component", "room_manager"),
		done:   make(chan struct{}),
	}

	// Start cleanup routine
	rm.cleanupTicker = time.NewTicker(5 * time.Minute)
	go rm.cleanupEmptyRooms()

	return rm
}

func (rm *RoomManager) GetOrCreateRoom(roomID, gameID string, roomType models.RoomType) *models.Room {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	if room, exists := rm.rooms[roomID]; exists {
		return room
	}

	room := models.NewRoom(roomID, gameID, roomType)
	rm.rooms[roomID] = room

	rm.logger.WithFields(logrus.Fields{
		"room_id": roomID,
		"game_id": gameID,
		"type":    roomType,
	}).Debug("Room created")

	return room
}

func (rm *RoomManager) GetRoom(roomID string) (*models.Room, bool) {
	rm.mu.RLock()
	defer rm.mu.RUnlock()

	room, exists := rm.rooms[roomID]
	return room, exists
}

func (rm *RoomManager) JoinRoom(roomID string, conn *models.Connection) {
	// Determine room type based on ID pattern
	roomType := rm.determineRoomType(roomID)

	room := rm.GetOrCreateRoom(roomID, conn.GameID, roomType)
	room.AddConnection(conn)
	conn.JoinRoom(roomID)

	rm.logger.WithFields(logrus.Fields{
		"room_id":       roomID,
		"connection_id": conn.ID,
		"user_id":       conn.UserID,
	}).Debug("Connection joined room")
}

func (rm *RoomManager) LeaveRoom(roomID string, conn *models.Connection) {
	room, exists := rm.GetRoom(roomID)
	if !exists {
		return
	}

	room.RemoveConnection(conn.ID)
	conn.LeaveRoom(roomID)

	rm.logger.WithFields(logrus.Fields{
		"room_id":       roomID,
		"connection_id": conn.ID,
		"user_id":       conn.UserID,
	}).Debug("Connection left room")
}

func (rm *RoomManager) BroadcastToRoom(roomID string, message []byte, excludeConnections ...string) error {
	room, exists := rm.GetRoom(roomID)
	if !exists {
		return fmt.Errorf("room not found: %s", roomID)
	}

	room.BroadcastToAll(message, excludeConnections...)
	return nil
}

func (rm *RoomManager) BroadcastToUser(roomID, userID string, message []byte) error {
	room, exists := rm.GetRoom(roomID)
	if !exists {
		return fmt.Errorf("room not found: %s", roomID)
	}

	room.BroadcastToUser(userID, message)
	return nil
}

func (rm *RoomManager) GetRoomUsers(roomID string) []string {
	room, exists := rm.GetRoom(roomID)
	if !exists {
		return nil
	}

	return room.GetUsers()
}

func (rm *RoomManager) GetRoomInfo(roomID string) map[string]interface{} {
	room, exists := rm.GetRoom(roomID)
	if !exists {
		return nil
	}

	return map[string]interface{}{
		"id":               room.ID,
		"game_id":          room.GameID,
		"type":             room.Type,
		"connection_count": room.ConnectionCount(),
		"user_count":       room.UserCount(),
		"created_at":       room.CreatedAt,
		"updated_at":       room.UpdatedAt,
		"users":            room.GetUsers(),
	}
}

func (rm *RoomManager) GetAllRooms() map[string]*models.Room {
	rm.mu.RLock()
	defer rm.mu.RUnlock()

	roomsCopy := make(map[string]*models.Room)
	for id, room := range rm.rooms {
		roomsCopy[id] = room
	}
	return roomsCopy
}

func (rm *RoomManager) GetGameRooms(gameID string) []*models.Room {
	rm.mu.RLock()
	defer rm.mu.RUnlock()

	var gameRooms []*models.Room
	for _, room := range rm.rooms {
		if room.GameID == gameID {
			gameRooms = append(gameRooms, room)
		}
	}
	return gameRooms
}

func (rm *RoomManager) RemoveRoom(roomID string) {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	if room, exists := rm.rooms[roomID]; exists {
		delete(rm.rooms, roomID)

		rm.logger.WithFields(logrus.Fields{
			"room_id": roomID,
			"game_id": room.GameID,
		}).Debug("Room removed")
	}
}

func (rm *RoomManager) determineRoomType(roomID string) models.RoomType {
	switch {
	case len(roomID) > 5 && roomID[:5] == "game:":
		return models.RoomTypeGame
	case len(roomID) > 7 && roomID[:7] == "marker:":
		return models.RoomTypeMarker
	case len(roomID) > 7 && roomID[:7] == "collab:":
		return models.RoomTypeCollaboration
	case len(roomID) > 8 && roomID[:8] == "private:":
		return models.RoomTypePrivate
	default:
		return models.RoomTypeGame
	}
}

func (rm *RoomManager) cleanupEmptyRooms() {
	defer rm.cleanupTicker.Stop()

	for {
		select {
		case <-rm.done:
			return
		case <-rm.cleanupTicker.C:
			rm.mu.Lock()
			var emptyRooms []string

			for roomID, room := range rm.rooms {
				if room.IsEmpty() && time.Since(room.UpdatedAt) > 10*time.Minute {
					emptyRooms = append(emptyRooms, roomID)
				}
			}

			for _, roomID := range emptyRooms {
				delete(rm.rooms, roomID)
				rm.logger.WithField("room_id", roomID).Debug("Cleaned up empty room")
			}

			rm.mu.Unlock()
		}
	}
}

func (rm *RoomManager) Shutdown() {
	rm.logger.Info("Shutting down room manager")
	close(rm.done)
}
