package services

import (
	"sync"
	"time"

	"github.com/ritchermap/realtime/internal/models"
	"github.com/sirupsen/logrus"
)

type PresenceManager struct {
	users  map[string]*models.User
	mu     sync.RWMutex
	logger *logrus.Entry

	// Cleanup
	cleanupTicker *time.Ticker
	done          chan struct{}
}

func NewPresenceManager() *PresenceManager {
	pm := &PresenceManager{
		users:  make(map[string]*models.User),
		logger: logrus.WithField("component", "presence_manager"),
		done:   make(chan struct{}),
	}

	// Start cleanup routine for offline users
	pm.cleanupTicker = time.NewTicker(15 * time.Minute)
	go pm.cleanupOfflineUsers()

	return pm
}

func (pm *PresenceManager) UserJoined(userID, gameID, username string) *models.User {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	user, exists := pm.users[userID]
	if !exists {
		user = models.NewUser(userID, username)
		pm.users[userID] = user
	}

	user.UpdateStatus(models.UserStatusOnline, "")

	pm.logger.WithFields(logrus.Fields{
		"user_id":  userID,
		"game_id":  gameID,
		"username": username,
	}).Debug("User joined")

	return user
}

func (pm *PresenceManager) UserLeft(userID, gameID string) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	user, exists := pm.users[userID]
	if !exists {
		return
	}

	// Check if user has other active connections
	if user.ConnectionCount() == 0 {
		user.UpdateStatus(models.UserStatusOffline, "")
	}

	pm.logger.WithFields(logrus.Fields{
		"user_id": userID,
		"game_id": gameID,
	}).Debug("User left")
}

func (pm *PresenceManager) UpdateUserStatus(userID, gameID, status, customStatus string) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	user, exists := pm.users[userID]
	if !exists {
		return
	}

	userStatus := models.UserPresenceStatus(status)
	user.UpdateStatus(userStatus, customStatus)

	pm.logger.WithFields(logrus.Fields{
		"user_id":       userID,
		"game_id":       gameID,
		"status":        status,
		"custom_status": customStatus,
	}).Debug("User status updated")
}

func (pm *PresenceManager) UpdateUserLocation(userID, gameID string, location *models.LocationUpdate) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	user, exists := pm.users[userID]
	if !exists {
		return
	}

	user.UpdateLocation(location)

	pm.logger.WithFields(logrus.Fields{
		"user_id":   userID,
		"game_id":   gameID,
		"latitude":  location.Latitude,
		"longitude": location.Longitude,
	}).Debug("User location updated")
}

func (pm *PresenceManager) GetUser(userID string) (*models.User, bool) {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	user, exists := pm.users[userID]
	return user, exists
}

func (pm *PresenceManager) GetOnlineUsers() []*models.User {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	var onlineUsers []*models.User
	for _, user := range pm.users {
		if user.IsOnline() {
			onlineUsers = append(onlineUsers, user)
		}
	}
	return onlineUsers
}

func (pm *PresenceManager) GetGameUsers(gameID string, connections []*models.Connection) map[string]*models.User {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	gameUsers := make(map[string]*models.User)
	userIDs := make(map[string]bool)

	// Get unique user IDs from connections
	for _, conn := range connections {
		if conn.GameID == gameID {
			userIDs[conn.UserID] = true
		}
	}

	// Get user objects
	for userID := range userIDs {
		if user, exists := pm.users[userID]; exists {
			gameUsers[userID] = user
		}
	}

	return gameUsers
}

func (pm *PresenceManager) GetUserPresence(userID string) map[string]interface{} {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	user, exists := pm.users[userID]
	if !exists {
		return map[string]interface{}{
			"online": false,
			"status": "offline",
		}
	}

	status, customStatus := user.GetStatus()
	location := user.GetLastLocation()

	presence := map[string]interface{}{
		"user_id":       user.ID,
		"username":      user.Username,
		"online":        user.IsOnline(),
		"status":        string(status),
		"custom_status": customStatus,
		"last_seen":     user.LastSeen,
		"connections":   user.ConnectionCount(),
	}

	if location != nil {
		presence["location"] = map[string]interface{}{
			"latitude":  location.Latitude,
			"longitude": location.Longitude,
			"altitude":  location.Altitude,
			"heading":   location.Heading,
			"speed":     location.Speed,
			"timestamp": location.Timestamp,
		}
	}

	return presence
}

func (pm *PresenceManager) GetAllUsersPresence() map[string]interface{} {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	presence := make(map[string]interface{})

	for userID := range pm.users {
		pm.mu.RUnlock()
		presence[userID] = pm.GetUserPresence(userID)
		pm.mu.RLock()
	}

	return presence
}

func (pm *PresenceManager) AddConnectionToUser(userID string, conn *models.Connection) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	user, exists := pm.users[userID]
	if exists {
		user.AddConnection(conn)
	}
}

func (pm *PresenceManager) RemoveConnectionFromUser(userID, connectionID string) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	user, exists := pm.users[userID]
	if exists {
		user.RemoveConnection(connectionID)
	}
}

func (pm *PresenceManager) cleanupOfflineUsers() {
	defer pm.cleanupTicker.Stop()

	for {
		select {
		case <-pm.done:
			return
		case <-pm.cleanupTicker.C:
			pm.mu.Lock()

			var offlineUsers []string
			cutoff := time.Now().Add(-30 * time.Minute)

			for userID, user := range pm.users {
				if !user.IsOnline() && user.LastSeen.Before(cutoff) {
					offlineUsers = append(offlineUsers, userID)
				}
			}

			for _, userID := range offlineUsers {
				delete(pm.users, userID)
				pm.logger.WithField("user_id", userID).Debug("Cleaned up offline user")
			}

			pm.mu.Unlock()
		}
	}
}

func (pm *PresenceManager) Shutdown() {
	pm.logger.Info("Shutting down presence manager")
	close(pm.done)
}
