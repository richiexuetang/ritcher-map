package server

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/ritchermap/gateway/internal/config"
)

var testSecret = []byte("test-secret")

// mintToken signs an HS256 session token the way the accounts service does.
func mintToken(t *testing.T, admin bool) string {
	t.Helper()
	now := time.Now()
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub":   "user-1",
		"iat":   now.Unix(),
		"exp":   now.Add(time.Hour).Unix(),
		"admin": admin,
	})
	s, err := tok.SignedString(testSecret)
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return s
}

// The catalog route policy has three tiers: anonymous GETs pass (public site
// content), writes need a token (401 without), and that token must carry the
// admin claim (403 without — writes are the CMS surface). The split rests on
// ServeMux precedence: "GET <path>" must win over the method-less "<path>"
// registration. A regression here either 401s the public site or, worse,
// opens catalog writes to anonymous or non-admin users.
func TestCatalogReadsPublicWritesAdmin(t *testing.T) {
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
		JWTSecret:      testSecret,
		AllowedOrigins: []string{"*"},
	}})
	if err != nil {
		t.Fatalf("New: %v", err)
	}

	userToken := mintToken(t, false)
	adminToken := mintToken(t, true)

	cases := []struct {
		name         string
		method, path string
		token        string
		want         int
	}{
		// Anonymous reads reach the backend.
		{"anon read games", http.MethodGet, "/api/v1/games", "", http.StatusOK},
		{"anon read game", http.MethodGet, "/api/v1/games/elden-ring", "", http.StatusOK},
		{"anon read maps", http.MethodGet, "/api/v1/maps", "", http.StatusOK},
		{"anon read map", http.MethodGet, "/api/v1/maps/1", "", http.StatusOK},
		{"anon read categories", http.MethodGet, "/api/v1/categories", "", http.StatusOK},
		{"anon read markers", http.MethodGet, "/api/v1/markers", "", http.StatusOK},
		// Anonymous writes are rejected at the edge.
		{"anon create game", http.MethodPost, "/api/v1/games", "", http.StatusUnauthorized},
		{"anon update game", http.MethodPut, "/api/v1/games/elden-ring", "", http.StatusUnauthorized},
		{"anon create map", http.MethodPost, "/api/v1/maps", "", http.StatusUnauthorized},
		{"anon tiling", http.MethodPost, "/api/v1/maps/1/tiling", "", http.StatusUnauthorized},
		{"anon update marker", http.MethodPut, "/api/v1/markers/5", "", http.StatusUnauthorized},
		{"anon delete category", http.MethodDelete, "/api/v1/categories/2", "", http.StatusUnauthorized},
		// A valid session without the admin claim cannot write.
		{"user create game", http.MethodPost, "/api/v1/games", userToken, http.StatusForbidden},
		{"user create map", http.MethodPost, "/api/v1/maps", userToken, http.StatusForbidden},
		{"user tiling", http.MethodPost, "/api/v1/maps/1/tiling", userToken, http.StatusForbidden},
		{"user delete marker", http.MethodDelete, "/api/v1/markers/5", userToken, http.StatusForbidden},
		// Admin writes reach the backend.
		{"admin create game", http.MethodPost, "/api/v1/games", adminToken, http.StatusOK},
		{"admin update game", http.MethodPut, "/api/v1/games/elden-ring", adminToken, http.StatusOK},
		{"admin delete game", http.MethodDelete, "/api/v1/games/elden-ring", adminToken, http.StatusOK},
		{"admin create map", http.MethodPost, "/api/v1/maps", adminToken, http.StatusOK},
		{"admin tiling", http.MethodPost, "/api/v1/maps/1/tiling", adminToken, http.StatusOK},
		{"admin delete category", http.MethodDelete, "/api/v1/categories/2", adminToken, http.StatusOK},
		// Progress stays fully authed, even for GET.
		{"anon progress", http.MethodGet, "/api/v1/progress/1", "", http.StatusUnauthorized},
	}
	for _, c := range cases {
		req := httptest.NewRequest(c.method, c.path, nil)
		if c.token != "" {
			req.Header.Set("Authorization", "Bearer "+c.token)
		}
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != c.want {
			t.Errorf("%s: %s %s = %d, want %d", c.name, c.method, c.path, rec.Code, c.want)
		}
	}
}
