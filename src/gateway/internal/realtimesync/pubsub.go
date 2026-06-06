package realtimesync

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/redis/go-redis/v9"
)

// Channel is the single Redis pub/sub channel all gateway instances share.
//
// One channel (rather than one-per-user) means each instance receives every
// event and filters to its locally-connected users. That keeps subscription
// management trivial at the cost of cross-instance fan-out traffic. The upgrade
// for very high scale is to shard by hash(userID) into N channels and have each
// instance subscribe to all N.
const Channel = "sync.events"

// envelope wraps a payload with its target user for transport over Redis.
type envelope struct {
	UserID  string          `json:"user_id"`
	Payload json.RawMessage `json:"payload"`
}

// Bridge connects the Redis channel to the local Hub.
type Bridge struct {
	rdb *redis.Client
	hub *Hub
	log *slog.Logger
}

func NewBridge(rdb *redis.Client, hub *Hub, log *slog.Logger) *Bridge {
	return &Bridge{rdb: rdb, hub: hub, log: log}
}

// Publish broadcasts a payload to all of a user's devices, wherever they're
// connected. Called by the progress handler after a successful write.
func (b *Bridge) Publish(ctx context.Context, userID string, payload []byte) error {
	env, err := json.Marshal(envelope{UserID: userID, Payload: payload})
	if err != nil {
		return err
	}
	return b.rdb.Publish(ctx, Channel, env).Err()
}

// Run subscribes to the channel and feeds decoded messages into the hub until
// ctx is cancelled. Call it once in its own goroutine.
func (b *Bridge) Run(ctx context.Context) {
	sub := b.rdb.Subscribe(ctx, Channel)
	defer func() { _ = sub.Close() }()

	ch := sub.Channel()
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			var env envelope
			if err := json.Unmarshal([]byte(msg.Payload), &env); err != nil {
				b.log.Warn("drop malformed sync envelope", "err", err)
				continue
			}
			b.hub.Deliver(Message{UserID: env.UserID, Payload: env.Payload})
		}
	}
}
