package server

import (
	"net/http"

	"github.com/gorilla/websocket"

	"github.com/ritchermap/gateway/internal/auth"
	"github.com/ritchermap/gateway/internal/config"
	"github.com/ritchermap/gateway/internal/progress"
	"github.com/ritchermap/gateway/internal/proxy"
	"github.com/ritchermap/gateway/internal/realtimesync"
)

// Deps are the already-constructed collaborators the router needs.
type Deps struct {
	Cfg      config.Config
	Hub      *realtimesync.Hub
	Bridge   *realtimesync.Bridge
	Progress *progress.Handler
}

// New builds the gateway handler.
//
// Route map:
//
//	Local (this service):
//	  GET  /healthz
//	  GET  /ws                              realtime sync (auth via ?token=)
//	  GET  /api/v1/progress/{mapId}         user's found markers   (auth)
//	  POST /api/v1/progress/{mapId}         mark / unmark           (auth)
//
//	Proxied:
//	  /tiles/...                            -> tile-service (Rust)   public
//	  /maps/{mapId}/markers                 -> tile-service (Rust)   public (viewport read)
//	  /api/v1/maps,categories,markers ...   -> catalog (Java)        auth (admin/CMS)
//	  /auth/..., /account/..., /billing/... -> accounts (Rails)
//
// The local /api/v1/progress/{mapId} pattern is more specific than the proxied
// /api/v1/maps/ etc., and "maps|categories|markers" never collide with
// "progress", so Go 1.22's most-specific-wins routing keeps them separate.
func New(d Deps) (http.Handler, error) {
	mux := http.NewServeMux()
	secret := d.Cfg.JWTSecret
	requireAuth := auth.Middleware(secret)

	// --- health ---
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	// --- realtime sync ---
	upgrader := &websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin:     originChecker(d.Cfg.AllowedOrigins),
	}
	mux.Handle("GET /ws", requireAuth(http.HandlerFunc(
		func(w http.ResponseWriter, r *http.Request) {
			userID, _ := auth.UserID(r.Context()) // guaranteed present by middleware
			realtimesync.Serve(d.Hub, upgrader, w, r, userID)
		},
	)))

	// --- progress (local) ---
	mux.Handle("GET /api/v1/progress/{mapId}", requireAuth(http.HandlerFunc(d.Progress.Get)))
	mux.Handle("POST /api/v1/progress/{mapId}", requireAuth(http.HandlerFunc(d.Progress.Update)))

	// --- proxied: read path (public) ---
	tileProxy, err := proxy.New(d.Cfg.TileServiceURL, false)
	if err != nil {
		return nil, err
	}
	mux.Handle("/tiles/", tileProxy)
	mux.Handle("GET /maps/{mapId}/markers", tileProxy)

	// --- proxied: catalog write/CMS (auth; admin-role check belongs here) ---
	catalogProxy, err := proxy.New(d.Cfg.CatalogURL, true)
	if err != nil {
		return nil, err
	}
	mux.Handle("/api/v1/maps", requireAuth(catalogProxy))
	mux.Handle("/api/v1/maps/", requireAuth(catalogProxy))
	mux.Handle("/api/v1/categories", requireAuth(catalogProxy))
	mux.Handle("/api/v1/categories/", requireAuth(catalogProxy))
	mux.Handle("/api/v1/markers", requireAuth(catalogProxy))
	mux.Handle("/api/v1/markers/", requireAuth(catalogProxy))

	// --- proxied: accounts (handles its own auth/login) ---
	accountsProxy, err := proxy.New(d.Cfg.AccountsURL, true)
	if err != nil {
		return nil, err
	}
	mux.Handle("/auth/", accountsProxy)
	mux.Handle("/account/", accountsProxy)
	mux.Handle("/billing/", accountsProxy)

	return mux, nil
}

// originChecker returns a websocket origin predicate. "*" disables checking
// (dev only); otherwise the request Origin must be in the allow-list.
func originChecker(allowed []string) func(*http.Request) bool {
	allow := make(map[string]struct{}, len(allowed))
	star := false
	for _, o := range allowed {
		if o == "*" {
			star = true
		}
		allow[o] = struct{}{}
	}
	return func(r *http.Request) bool {
		if star {
			return true
		}
		_, ok := allow[r.Header.Get("Origin")]
		return ok
	}
}
 