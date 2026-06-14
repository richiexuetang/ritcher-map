package auth

import (
	"context"
	"net/http"
	"strings"
)

type ctxKey int

const (
	userIDKey ctxKey = iota
	adminKey
)

// TokenFromRequest pulls a bearer token from the Authorization header, falling
// back to a `token` query parameter. The query fallback exists for browser
// WebSocket connections, which can't set custom headers on the handshake.
func TokenFromRequest(r *http.Request) string {
	if h := r.Header.Get("Authorization"); h != "" {
		if after, ok := strings.CutPrefix(h, "Bearer "); ok {
			return strings.TrimSpace(after)
		}
	}
	return r.URL.Query().Get("token")
}

// Middleware verifies the token and stores the user id plus the admin flag in
// the request context. Unauthenticated requests get 401 and never reach the
// handler.
func Middleware(secret []byte) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, admin, err := Validate(TokenFromRequest(r), secret)
			if err != nil {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			ctx := context.WithValue(r.Context(), userIDKey, userID)
			ctx = context.WithValue(ctx, adminKey, admin)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireAdmin rejects authenticated-but-not-admin sessions with 403. It must
// run inside Middleware (it reads the flag Middleware stored); an absent flag
// means not admin.
func RequireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if admin, _ := Admin(r.Context()); !admin {
			http.Error(w, `{"error":"admin required"}`, http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// UserID returns the authenticated user id from the context, if present.
func UserID(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(userIDKey).(string)
	return id, ok && id != ""
}

// Admin returns whether the authenticated session is an admin. ok is false
// when no admin flag was set on the context (e.g. unauthenticated request).
func Admin(ctx context.Context) (admin bool, ok bool) {
	a, ok := ctx.Value(adminKey).(bool)
	return a, ok
}
