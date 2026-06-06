package proxy

import (
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"

	"github.com/ritchermap/gateway/internal/auth"
)

// userHeader is the trusted identity header injected for downstream services.
// Backends behind the gateway trust it; the gateway therefore MUST strip any
// inbound copy so a client can't spoof another user.
const userHeader = "X-User-Id"

// New builds a reverse proxy to target. If injectUser is set, the authenticated
// user id (from the request context) is forwarded as X-User-Id; any client-
// supplied X-User-Id is always removed first.
func New(target string, injectUser bool) (*httputil.ReverseProxy, error) {
	u, err := url.Parse(target)
	if err != nil {
		return nil, fmt.Errorf("bad backend url %q: %w", target, err)
	}

	rp := httputil.NewSingleHostReverseProxy(u)

	base := rp.Director
	rp.Director = func(r *http.Request) {
		base(r)
		r.Header.Set("X-Forwarded-Host", r.Host)
		r.Host = u.Host

		// Anti-spoofing: drop whatever the client sent, then set the real one.
		r.Header.Del(userHeader)
		if injectUser {
			if uid, ok := auth.UserID(r.Context()); ok {
				r.Header.Set(userHeader, uid)
			}
		}
	}

	rp.ErrorHandler = func(w http.ResponseWriter, _ *http.Request, _ error) {
		// Backend down / unreachable — don't leak internals.
		http.Error(w, `{"error":"upstream unavailable"}`, http.StatusBadGateway)
	}

	return rp, nil
}
