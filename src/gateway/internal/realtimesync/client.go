package realtimesync

import (
	"net/http"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10 // must be < pongWait
	maxMessageSize = 4096                // inbound client messages are tiny (pings/acks)
	sendBuffer     = 32
)

// Client is a single device's WebSocket connection.
type Client struct {
	hub    *Hub
	conn   *websocket.Conn
	userID string
	send   chan []byte
}

// Serve upgrades an authenticated HTTP request to a WebSocket and runs the
// connection until either side closes. userID must already be authenticated.
func Serve(hub *Hub, upgrader *websocket.Upgrader, w http.ResponseWriter, r *http.Request, userID string) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		// Upgrade already wrote an error response.
		return
	}
	c := &Client{hub: hub, conn: conn, userID: userID, send: make(chan []byte, sendBuffer)}
	hub.Register(c)

	// Two goroutines per connection: one reads, one writes. They coordinate
	// teardown through the hub (unregister closes c.send, which ends writePump).
	go c.writePump()
	go c.readPump()
}

// readPump drains inbound frames. The client mostly sends nothing (the channel
// is server -> client), but we must read to process control frames (pong/close)
// and to enforce the read deadline. On any error we unregister and close.
func (c *Client) readPump() {
	defer func() {
		c.hub.Unregister(c)
		_ = c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(pongWait))
	})

	for {
		if _, _, err := c.conn.ReadMessage(); err != nil {
			return // includes normal close, timeout, and protocol errors
		}
		// Inbound messages are currently ignored; the sync channel is one-way.
		// A client->server "subscribe to map N" filter could be handled here.
	}
}

// writePump sends queued payloads and periodic pings. It exits when the hub
// closes c.send (on unregister) or a write fails.
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		_ = c.conn.Close()
	}()

	for {
		select {
		case payload, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Hub closed the channel: send a clean close frame and stop.
				_ = c.conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(
					websocket.CloseNormalClosure, ""))
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, payload); err != nil {
				return
			}

		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
