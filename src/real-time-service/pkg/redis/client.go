package redis

import (
	"context"
	"fmt"
	"net"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/ritchermap/realtime/internal/config"
	"github.com/sirupsen/logrus"
)

func NewClient(cfg *config.RedisConfig) (*redis.Client, error) {
	opts := &redis.Options{
		Addr:         fmt.Sprintf("%s:%s", cfg.Host, cfg.Port),
		Password:     cfg.Password,
		DB:           cfg.DB,
		PoolSize:     cfg.PoolSize,
		MinIdleConns: cfg.MinIdleConns,
		DialTimeout:  cfg.DialTimeout,
		ReadTimeout:  cfg.ReadTimeout,
		WriteTimeout: cfg.WriteTimeout,
		PoolTimeout:  cfg.PoolTimeout,
	}

	client := redis.NewClient(opts)

	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to Redis: %w", err)
	}

	logrus.WithFields(logrus.Fields{
		"host": cfg.Host,
		"port": cfg.Port,
		"db":   cfg.DB,
	}).Info("Connected to Redis")

	return client, nil
}

func SetupRedisHooks(client *redis.Client) {
	client.AddHook(&loggingHook{})
}

type loggingHook struct{}

func (h *loggingHook) DialHook(next redis.DialHook) redis.DialHook {
	return func(ctx context.Context, network, addr string) (net.Conn, error) {
		start := time.Now()
		conn, err := next(ctx, network, addr)

		logrus.WithFields(logrus.Fields{
			"network":  network,
			"addr":     addr,
			"duration": time.Since(start),
			"error":    err,
		}).Debug("Redis dial")

		return conn, err
	}
}

func (h *loggingHook) ProcessHook(next redis.ProcessHook) redis.ProcessHook {
	return func(ctx context.Context, cmd redis.Cmder) error {
		start := time.Now()
		err := next(ctx, cmd)

		logrus.WithFields(logrus.Fields{
			"cmd":      cmd.Name(),
			"duration": time.Since(start),
			"error":    err,
		}).Debug("Redis command")

		return err
	}
}

func (h *loggingHook) ProcessPipelineHook(next redis.ProcessPipelineHook) redis.ProcessPipelineHook {
	return func(ctx context.Context, cmds []redis.Cmder) error {
		start := time.Now()
		err := next(ctx, cmds)

		logrus.WithFields(logrus.Fields{
			"cmd_count": len(cmds),
			"duration":  time.Since(start),
			"error":     err,
		}).Debug("Redis pipeline")

		return err
	}
}
