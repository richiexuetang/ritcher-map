package models

import (
	"sync"
	"time"
)

type User struct {
	ID           string                 `json:"id"`
	Username     string                 `json:"username"`
	Status       UserPresenceStatus     `json:"status"`
	CustomStatus string                 `json:"custom_status"`
	LastLocation *LocationUpdate        `json:"last_location"`
	LastSeen     time.Time              `json:"last_seen"`
	Connections  map[string]*Connection `json:"-"`
	Metadata     map[string]string      `json:"metadata"`

	mu sync.RWMutex
}

type UserPresenceStatus string

const (
	UserStatusOnline    UserPresenceStatus = "online"
	UserStatusAway      UserPresenceStatus = "away"
	UserStatusBusy      UserPresenceStatus = "busy"
	UserStatusInvisible UserPresenceStatus = "invisible"
	UserStatusOffline   UserPresenceStatus = "offline"
)

func NewUser(id, username string) *User {
	return &User{
		ID:          id,
		Username:    username,
		Status:      UserStatusOffline,
		Connections: make(map[string]*Connection),
		Metadata:    make(map[string]string),
		LastSeen:    time.Now(),
	}
}

func (u *User) AddConnection(conn *Connection) {
	u.mu.Lock()
	defer u.mu.Unlock()

	u.Connections[conn.ID] = conn
	u.Status = UserStatusOnline
	u.LastSeen = time.Now()
}

func (u *User) RemoveConnection(connectionID string) {
	u.mu.Lock()
	defer u.mu.Unlock()

	delete(u.Connections, connectionID)

	// Set status to offline if no more connections
	if len(u.Connections) == 0 {
		u.Status = UserStatusOffline
	}

	u.LastSeen = time.Now()
}

func (u *User) GetConnections() []*Connection {
	u.mu.RLock()
	defer u.mu.RUnlock()

	connections := make([]*Connection, 0, len(u.Connections))
	for _, conn := range u.Connections {
		connections = append(connections, conn)
	}
	return connections
}

func (u *User) ConnectionCount() int {
	u.mu.RLock()
	defer u.mu.RUnlock()

	return len(u.Connections)
}

func (u *User) IsOnline() bool {
	u.mu.RLock()
	defer u.mu.RUnlock()

	return len(u.Connections) > 0 && u.Status != UserStatusOffline
}

func (u *User) UpdateStatus(status UserPresenceStatus, customStatus string) {
	u.mu.Lock()
	defer u.mu.Unlock()

	u.Status = status
	u.CustomStatus = customStatus
	u.LastSeen = time.Now()
}

func (u *User) UpdateLocation(location *LocationUpdate) {
	u.mu.Lock()
	defer u.mu.Unlock()

	u.LastLocation = location
	u.LastSeen = time.Now()
}

func (u *User) GetStatus() (UserPresenceStatus, string) {
	u.mu.RLock()
	defer u.mu.RUnlock()

	return u.Status, u.CustomStatus
}

func (u *User) GetLastLocation() *LocationUpdate {
	u.mu.RLock()
	defer u.mu.RUnlock()

	return u.LastLocation
}

func (u *User) SetMetadata(key, value string) {
	u.mu.Lock()
	defer u.mu.Unlock()

	u.Metadata[key] = value
}

func (u *User) GetMetadata(key string) (string, bool) {
	u.mu.RLock()
	defer u.mu.RUnlock()

	value, exists := u.Metadata[key]
	return value, exists
}
