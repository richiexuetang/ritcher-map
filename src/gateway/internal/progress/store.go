package progress

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"
)

type Store struct {
	rdb *redis.Client
}

func NewStore(rdb *redis.Client) *Store {
	return &Store{rdb: rdb}
}

// key namespaces by user and map: progress:{userID}:{mapID}
func key(userID, mapID string) string {
	return fmt.Sprintf("progress:%s:%s", userID, mapID)
}

// Mark records a marker as found. Returns true if it was newly added (false if
// already present) so the caller can skip the sync broadcast on a no-op.
func (s *Store) Mark(ctx context.Context, userID, mapID, markerID string) (bool, error) {
	n, err := s.rdb.SAdd(ctx, key(userID, mapID), markerID).Result()
	return n > 0, err
}

// Unmark removes a marker. Returns true if it was actually present.
func (s *Store) Unmark(ctx context.Context, userID, mapID, markerID string) (bool, error) {
	n, err := s.rdb.SRem(ctx, key(userID, mapID), markerID).Result()
	return n > 0, err
}

// Found returns all found marker ids for a user on a map.
func (s *Store) Found(ctx context.Context, userID, mapID string) ([]string, error) {
	ids, err := s.rdb.SMembers(ctx, key(userID, mapID)).Result()
	if err != nil {
		return nil, err
	}
	if ids == nil {
		ids = []string{}
	}
	return ids, nil
}

// Count returns how many markers a user has found on a map.
func (s *Store) Count(ctx context.Context, userID, mapID string) (int64, error) {
	return s.rdb.SCard(ctx, key(userID, mapID)).Result()
}
 