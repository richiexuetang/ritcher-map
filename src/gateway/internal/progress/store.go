package progress

import (
	"context"
	"fmt"
	"strconv"

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
//
// Marker ids are carried as int64 (the contract's wire type) and stored in
// Redis as their decimal string form.
func (s *Store) Mark(ctx context.Context, userID, mapID string, markerID int64) (bool, error) {
	n, err := s.rdb.SAdd(ctx, key(userID, mapID), strconv.FormatInt(markerID, 10)).Result()
	return n > 0, err
}

// Unmark removes a marker. Returns true if it was actually present.
func (s *Store) Unmark(ctx context.Context, userID, mapID string, markerID int64) (bool, error) {
	n, err := s.rdb.SRem(ctx, key(userID, mapID), strconv.FormatInt(markerID, 10)).Result()
	return n > 0, err
}

// Found returns all found marker ids for a user on a map. Members are parsed
// back to int64; any unparseable members are skipped defensively (they should
// never occur, but we never want a single bad value to fail the whole read).
func (s *Store) Found(ctx context.Context, userID, mapID string) ([]int64, error) {
	members, err := s.rdb.SMembers(ctx, key(userID, mapID)).Result()
	if err != nil {
		return nil, err
	}
	ids := make([]int64, 0, len(members))
	for _, m := range members {
		id, err := strconv.ParseInt(m, 10, 64)
		if err != nil {
			continue
		}
		ids = append(ids, id)
	}
	return ids, nil
}
 