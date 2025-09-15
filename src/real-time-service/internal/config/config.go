package config

import (
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	Server    ServerConfig
	Redis     RedisConfig
	Auth      AuthConfig
	Metrics   MetricsConfig
	WebSocket WebSocketConfig
}

type ServerConfig struct {
	Host         string
	Port         int
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
	IdleTimeout  time.Duration
}

type RedisConfig struct {
	Host               string
	Port               string
	Password           string
	DB                 int
	PoolSize           int
	MinIdleConns       int
	DialTimeout        time.Duration
	ReadTimeout        time.Duration
	WriteTimeout       time.Duration
	PoolTimeout        time.Duration
	IdleCheckFrequency time.Duration
	IdleTimeout        time.Duration
	MaxConnAge         time.Duration
}

type AuthConfig struct {
	JWTSecret      string
	JWTExpiration  time.Duration
	AuthServiceURL string
	SkipAuth       bool
}

type MetricsConfig struct {
	Enabled bool
	Path    string
	Port    string
}

type WebSocketConfig struct {
	ReadBufferSize   int
	WriteBufferSize  int
	HandshakeTimeout time.Duration
	CheckOrigin      bool
	PingPeriod       time.Duration
	PongWait         time.Duration
	WriteWait        time.Duration
	MaxMessageSize   int64
	MaxConnections   int
}

func Load() (*Config, error) {
	// Load .env file if it exists
	_ = godotenv.Load()

	config := &Config{
		Server: ServerConfig{
			Host:         getEnv("SERVER_HOST", "0.0.0.0"),
			Port:         getIntEnv("SERVER_PORT", 8082),
			ReadTimeout:  getDurationEnv("SERVER_READ_TIMEOUT", 15*time.Second),
			WriteTimeout: getDurationEnv("SERVER_WRITE_TIMEOUT", 15*time.Second),
			IdleTimeout:  getDurationEnv("SERVER_IDLE_TIMEOUT", 60*time.Second),
		},
		Redis: RedisConfig{
			Host:               getEnv("REDIS_HOST", "localhost"),
			Port:               getEnv("REDIS_PORT", "6379"),
			Password:           getEnv("REDIS_PASSWORD", ""),
			DB:                 getIntEnv("REDIS_DB", 0),
			PoolSize:           getIntEnv("REDIS_POOL_SIZE", 10),
			MinIdleConns:       getIntEnv("REDIS_MIN_IDLE_CONNS", 5),
			DialTimeout:        getDurationEnv("REDIS_DIAL_TIMEOUT", 5*time.Second),
			ReadTimeout:        getDurationEnv("REDIS_READ_TIMEOUT", 3*time.Second),
			WriteTimeout:       getDurationEnv("REDIS_WRITE_TIMEOUT", 3*time.Second),
			PoolTimeout:        getDurationEnv("REDIS_POOL_TIMEOUT", 4*time.Second),
			IdleCheckFrequency: getDurationEnv("REDIS_IDLE_CHECK_FREQUENCY", time.Minute),
			IdleTimeout:        getDurationEnv("REDIS_IDLE_TIMEOUT", 5*time.Minute),
			MaxConnAge:         getDurationEnv("REDIS_MAX_CONN_AGE", 30*time.Minute),
		},
		Auth: AuthConfig{
			JWTSecret:      getEnv("JWT_SECRET", "your-secret-key"),
			JWTExpiration:  getDurationEnv("JWT_EXPIRATION", 24*time.Hour),
			AuthServiceURL: getEnv("AUTH_SERVICE_URL", "http://localhost:8081"),
			SkipAuth:       getBoolEnv("SKIP_AUTH", false),
		},
		Metrics: MetricsConfig{
			Enabled: getBoolEnv("METRICS_ENABLED", true),
			Path:    getEnv("METRICS_PATH", "/metrics"),
			Port:    getEnv("METRICS_PORT", "9090"),
		},
		WebSocket: WebSocketConfig{
			ReadBufferSize:   getIntEnv("WS_READ_BUFFER_SIZE", 1024),
			WriteBufferSize:  getIntEnv("WS_WRITE_BUFFER_SIZE", 1024),
			HandshakeTimeout: getDurationEnv("WS_HANDSHAKE_TIMEOUT", 10*time.Second),
			CheckOrigin:      getBoolEnv("WS_CHECK_ORIGIN", false),
			PingPeriod:       getDurationEnv("WS_PING_PERIOD", 54*time.Second),
			PongWait:         getDurationEnv("WS_PONG_WAIT", 60*time.Second),
			WriteWait:        getDurationEnv("WS_WRITE_WAIT", 10*time.Second),
			MaxMessageSize:   getInt64Env("WS_MAX_MESSAGE_SIZE", 512),
			MaxConnections:   getIntEnv("WS_MAX_CONNECTIONS", 10000),
		},
	}

	return config, nil
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getIntEnv(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}

func getInt64Env(key string, defaultValue int64) int64 {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.ParseInt(value, 10, 64); err == nil {
			return intValue
		}
	}
	return defaultValue
}

func getBoolEnv(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		if boolValue, err := strconv.ParseBool(value); err == nil {
			return boolValue
		}
	}
	return defaultValue
}

func getDurationEnv(key string, defaultValue time.Duration) time.Duration {
	if value := os.Getenv(key); value != "" {
		if duration, err := time.ParseDuration(value); err == nil {
			return duration
		}
	}
	return defaultValue
}

func (c *Config) Validate() error {
	if c.Redis.Host == "" {
		return fmt.Errorf("redis host is required")
	}
	if c.Auth.JWTSecret == "" {
		return fmt.Errorf("JWT secret is required")
	}
	return nil
}
