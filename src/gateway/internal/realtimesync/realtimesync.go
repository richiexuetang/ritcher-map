package realtimesync

// Message is a payload destined for all of one user's devices.
type Message struct {
	UserID  string
	Payload []byte
}

// Hub tracks connections per user and fans messages out to them.
type Hub struct {
	register   chan *Client
	unregister chan *Client
	deliver    chan Message

	// Owned exclusively by Run. userID -> set of that user's local clients.
	clients map[string]map[*Client]struct{}
}

func NewHub() *Hub {
	return &Hub{
		register:   make(chan *Client),
		unregister: make(chan *Client),
		deliver:    make(chan Message, 256),
		clients:    make(map[string]map[*Client]struct{}),
	}
}

// Run is the hub's event loop. Call it once in its own goroutine; it returns
// when ctx-like done channel (provided by caller via Stop) closes. We use an
// explicit stop channel rather than context to keep the hot loop allocation-free.
func (h *Hub) Run(stop <-chan struct{}) {
	for {
		select {
		case c := <-h.register:
			set := h.clients[c.userID]
			if set == nil {
				set = make(map[*Client]struct{})
				h.clients[c.userID] = set
			}
			set[c] = struct{}{}

		case c := <-h.unregister:
			if set, ok := h.clients[c.userID]; ok {
				if _, ok := set[c]; ok {
					delete(set, c)
					close(c.send)
					if len(set) == 0 {
						delete(h.clients, c.userID)
					}
				}
			}

		case m := <-h.deliver:
			for c := range h.clients[m.UserID] {
				select {
				case c.send <- m.Payload:
				default:
					// Client's buffer is full (slow/stalled consumer). Drop it;
					// the write pump will see the closed channel and tear down.
					delete(h.clients[m.UserID], c)
					close(c.send)
					if len(h.clients[m.UserID]) == 0 {
						delete(h.clients, m.UserID)
					}
				}
			}

		case <-stop:
			return
		}
	}
}

// Register/Unregister are called by Client lifecycle. Deliver is called by the
// pub/sub bridge. All three just hand off to the Run goroutine.
func (h *Hub) Register(c *Client)   { h.register <- c }
func (h *Hub) Unregister(c *Client) { h.unregister <- c }
func (h *Hub) Deliver(m Message)    { h.deliver <- m }

// LocalConnections reports how many devices for a user are connected to THIS
// instance. Exposed for tests and metrics.
func (h *Hub) localConnections(userID string) int {
	return len(h.clients[userID])
}
