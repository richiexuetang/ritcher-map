package server

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ritchermap/gateway/internal/config"
)

// The public/auth split on catalog routes rests on ServeMux precedence:
// "GET <path>" must win over the method-less "<path>" registration. This
// pins that behavior — a regression here either 401s the public site or,
// worse, opens catalog writes to anonymous users.
func TestCatalogReadsPublicWritesAuthed(t *testing.T) {
	backend := httptest.NewServer(http.HandlerFunc(
		func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusOK)
		},
	))
	defer backend.Close()

	h, err := New(Deps{Cfg: config.Config{
		TileServiceURL: backend.URL,
		CatalogURL:     backend.URL,
		AccountsURL:    backend.URL,
		JWTSecret:      []byte("test-secret"),
		AllowedOrigins: []string{"*"},
	}})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	cases := []struct {
		method, path string
		want         int
	}{
		// Anonymous reads reach the backend.
		{http.MethodGet, "/api/v1/maps", http.StatusOK},
		{http.MethodGet, "/api/v1/maps/1", http.StatusOK},
		{http.MethodGet, "/api/v1/categories", http.StatusOK},
		{http.MethodGet, "/api/v1/markers", http.StatusOK},
		// Anonymous writes are rejected at the edge.
		{http.MethodPost, "/api/v1/maps", http.StatusUnauthorized},
		{http.MethodPost, "/api/v1/maps/1/tiling", http.StatusUnauthorized},
		{http.MethodPut, "/api/v1/markers/5", http.StatusUnauthorized},
		{http.MethodDelete, "/api/v1/categories/2", http.StatusUnauthorized},
		// Progress stays fully authed, even for GET.
		{http.MethodGet, "/api/v1/progress/1", http.StatusUnauthorized},
	}
	for _, c := range cases {
		req := httptest.NewRequest(c.method, c.path, nil)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != c.want {
			t.Errorf("%s %s = %d, want %d", c.method, c.path, rec.Code, c.want)
		}
	}
}
