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
//	  /api/v1/maps,categories,markers ...   -> catalog (Java)        GET public, writes admin
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

	// --- proxied: catalog (GET public; writes/CMS require an ADMIN token) ---
	// Game/map/category data IS the public site's content, so anonymous reads
	// must pass. A "GET <path>" pattern is more specific than the bare "<path>"
	// in the 1.22 mux, so reads bypass auth while every other verb on the same
	// path falls through to the admin-gated registration: writes are the CMS
	// surface, and any registered user being able to mutate the catalog was a
	// hole (the admin claim comes from accounts' users.admin flag).
	catalogProxy, err := proxy.New(d.Cfg.CatalogURL, true)
	if err != nil {
		return nil, err
	}
	for _, p := range []string{
		"/api/v1/maps", "/api/v1/maps/",
		"/api/v1/categories", "/api/v1/categories/",
		"/api/v1/markers", "/api/v1/markers/",
	} {
		mux.Handle("GET "+p, catalogProxy)
		mux.Handle(p, requireAuth(auth.RequireAdmin(catalogProxy)))
	}

	// --- proxied: accounts (handles its own auth/login) ---
	accountsProxy, err := proxy.New(d.Cfg.AccountsURL, true)
	if err != nil {
		return nil, err
	}
	mux.Handle("/auth/", accountsProxy)
	mux.Handle("/account/", accountsProxy)
	mux.Handle("/billing/", accountsProxy)

	// CORS wraps everything: the gateway is the single origin-policy authority,
	// so backends (Rails/Java/Rust) never see preflights or need CORS of their own.
	return corsMiddleware(d.Cfg.AllowedOrigins, mux), nil
}

// corsMiddleware answers browser preflights and stamps Access-Control headers
// on allowed cross-origin requests. Non-browser traffic (no Origin header)
// passes through untouched. Disallowed origins get no CORS headers, which
// makes the browser block the response — no need to reject server-side.
func corsMiddleware(allowed []string, next http.Handler) http.Handler {
	allowOrigin := originChecker(allowed)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "" {
			next.ServeHTTP(w, r)
			return
		}
		if allowOrigin(r) {
			h := w.Header()
			// Echo the origin (not "*"): Authorization-bearing requests are
			// credentialed in practice, and echo+Vary is cache-correct.
			h.Set("Access-Control-Allow-Origin", origin)
			h.Add("Vary", "Origin")
			if r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != "" {
				// Preflight: answer here; never forward OPTIONS to backends.
				h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
				h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
				h.Set("Access-Control-Max-Age", "86400")
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
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
 