package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/ritchermap/gateway/internal/config"
	"github.com/ritchermap/gateway/internal/progress"
	"github.com/ritchermap/gateway/internal/realtimesync"
	"github.com/ritchermap/gateway/internal/server"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))

	cfg, err := config.Load()
	if err != nil {
		log.Error("config", "err", err)
		os.Exit(1)
	}

	rdb := redis.NewClient(&redis.Options{Addr: cfg.RedisAddr, Password: cfg.RedisPassword})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Error("redis ping", "addr", cfg.RedisAddr, "err", err)
		os.Exit(1)
	}

	// Realtime sync: hub event loop + Redis subscription, each in a goroutine.
	hub := realtimesync.NewHub()
	stopHub := make(chan struct{})
	go hub.Run(stopHub)

	bridge := realtimesync.NewBridge(rdb, hub, log)
	go bridge.Run(ctx)

	handler, err := server.New(server.Deps{
		Cfg:      cfg,
		Hub:      hub,
		Bridge:   bridge,
		Progress: progress.NewHandler(progress.NewStore(rdb), bridge, cfg.FreeTierMaxMarkersPerMap),
	})
	if err != nil {
		log.Error("router", "err", err)
		os.Exit(1)
	}

	srv := &http.Server{
		Addr:              cfg.BindAddr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		// No WriteTimeout: it would kill long-lived WebSocket connections.
	}

	go func() {
		log.Info("gateway listening", "addr", cfg.BindAddr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("serve", "err", err)
			os.Exit(1)
		}
	}()

	// Graceful shutdown on SIGINT/SIGTERM.
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig
	log.Info("shutting down")

	shutdownCtx, shCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shCancel()
	_ = srv.Shutdown(shutdownCtx)
	close(stopHub)
	cancel()
	_ = rdb.Close()
}
