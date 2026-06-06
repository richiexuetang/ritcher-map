package progress

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/ritchermap/gateway/internal/auth"
)

// publisher is the subset of the sync bridge the handler needs (kept as an
// interface so the handler is testable without Redis).
type publisher interface {
	Publish(ctx context.Context, userID string, payload []byte) error
}

type Handler struct {
	store *Store
	pub   publisher
}

func NewHandler(store *Store, pub publisher) *Handler {
	return &Handler{store: store, pub: pub}
}

// updateRequest is the POST body: toggle one marker's found state.
type updateRequest struct {
	MarkerID string `json:"marker_id"`
	Found    bool   `json:"found"`
}

// event is what we broadcast to the user's other devices. `type` lets the
// client multiplex several event kinds over the one socket later.
type event struct {
	Type     string `json:"type"`
	MapID    string `json:"map_id"`
	MarkerID string `json:"marker_id"`
	Found    bool   `json:"found"`
}

type foundResponse struct {
	MapID string   `json:"map_id"`
	Found []string `json:"found"`
	Count int      `json:"count"`
}

// Get handles GET /api/v1/progress/{mapId} — the user's found markers.
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	mapID := r.PathValue("mapId")

	found, err := h.store.Found(r.Context(), userID, mapID)
	if err != nil {
		http.Error(w, `{"error":"internal"}`, http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, foundResponse{MapID: mapID, Found: found, Count: len(found)})
}

// Update handles POST /api/v1/progress/{mapId} — mark or unmark a marker, then
// broadcast the change to the user's other devices.
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserID(r.Context())
	if !ok {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	mapID := r.PathValue("mapId")

	var req updateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.MarkerID == "" {
		http.Error(w, `{"error":"marker_id required"}`, http.StatusBadRequest)
		return
	}

	var changed bool
	var err error
	if req.Found {
		changed, err = h.store.Mark(r.Context(), userID, mapID, req.MarkerID)
	} else {
		changed, err = h.store.Unmark(r.Context(), userID, mapID, req.MarkerID)
	}
	if err != nil {
		http.Error(w, `{"error":"internal"}`, http.StatusInternalServerError)
		return
	}

	// Only broadcast when state actually changed — a duplicate "mark found"
	// shouldn't wake up every device for nothing.
	if changed {
		payload, _ := json.Marshal(event{
			Type: "progress", MapID: mapID, MarkerID: req.MarkerID, Found: req.Found,
		})
		// Fire-and-forget: the write already succeeded; a publish failure
		// degrades realtime sync but not correctness (other devices catch up
		// on next load).
		_ = h.pub.Publish(r.Context(), userID, payload)
	}

	w.WriteHeader(http.StatusNoContent)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
