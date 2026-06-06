package config

import (
	"fmt"
	"os"
	"strings"
)

type Config struct {
	BindAddr string

	// Backend service base URLs to reverse-proxy to.
	TileServiceURL string // Rust read path (tiles + viewport queries)
	CatalogURL     string // Java write path / CMS
	AccountsURL    string // Rails users + billing

	RedisAddr     string
	RedisPassword string

	// HS256 secret the accounts service signs session JWTs with; the gateway
	// validates them at the edge. (Swap for an RS256 public key in production.)
	JWTSecret []byte

	// Allowed Origins for browser WebSocket/CORS. "*" disables the check (dev only).
	AllowedOrigins []string
}

func Load() (Config, error) {
	c := Config{
		BindAddr:       getenv("BIND_ADDR", "0.0.0.0:8080"),
		TileServiceURL: getenv("TILE_SERVICE_URL", "http://localhost:8082"),
		CatalogURL:     getenv("CATALOG_URL", "http://localhost:8081"),
		AccountsURL:    getenv("ACCOUNTS_URL", "http://localhost:8083"),
		RedisAddr:      getenv("REDIS_ADDR", "localhost:6379"),
		RedisPassword:  os.Getenv("REDIS_PASSWORD"),
		AllowedOrigins: splitCSV(getenv("ALLOWED_ORIGINS", "http://localhost:5173")),
	}

	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		return Config{}, fmt.Errorf("JWT_SECRET is required")
	}
	c.JWTSecret = []byte(secret)

	return c, nil
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func splitCSV(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
