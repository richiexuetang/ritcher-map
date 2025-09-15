package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gorilla/mux"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/ritchermap/realtime/internal/config"
	"github.com/ritchermap/realtime/internal/handlers"
	"github.com/ritchermap/realtime/internal/services"
	"github.com/ritchermap/realtime/internal/utils"
	"github.com/ritchermap/realtime/pkg/redis"
	"github.com/sirupsen/logrus"
)

func main() {
	// Setup logger
	logger := utils.SetupLogger()

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		logger.WithError(err).Fatal("Failed to load configuration")
	}

	if err := cfg.Validate(); err != nil {
		logger.WithError(err).Fatal("Invalid configuration")
	}

	logger.WithFields(logrus.Fields{
		"server_host": cfg.Server.Host,
		"server_port": cfg.Server.Port,
		"redis_host":  cfg.Redis.Host,
		"redis_port":  cfg.Redis.Port,
	}).Info("Starting Realtime Service")

	// Setup Redis client
	redisClient, err := redis.NewClient(&cfg.Redis)
	if err != nil {
		logger.WithError(err).Fatal("Failed to connect to Redis")
	}
	defer redisClient.Close()

	redis.SetupRedisHooks(redisClient)

	// Initialize services
	roomManager := services.NewRoomManager()
	presenceManager := services.NewPresenceManager()
	messageBroker := services.NewMessageBroker(redisClient, roomManager)
	connectionManager := services.NewConnectionManager(&cfg.WebSocket, roomManager, presenceManager, messageBroker)

	// Initialize handlers
	authValidator := utils.NewAuthValidator(cfg.Auth.JWTSecret, cfg.Auth.SkipAuth)
	wsHandler := handlers.NewWebSocketHandler(connectionManager, authValidator, &cfg.WebSocket)
	healthHandler := handlers.NewHealthHandler(connectionManager, roomManager, presenceManager, messageBroker)

	// Setup HTTP router
	router := mux.NewRouter()

	// WebSocket endpoint
	router.HandleFunc("/ws", wsHandler.HandleConnection)

	// Health endpoints
	router.HandleFunc("/health", healthHandler.HandleHealth).Methods("GET")
	router.HandleFunc("/health/readiness", healthHandler.HandleReadiness).Methods("GET")
	router.HandleFunc("/health/liveness", healthHandler.HandleLiveness).Methods("GET")
	router.HandleFunc("/stats", healthHandler.HandleStats).Methods("GET")

	// Metrics endpoint
	if cfg.Metrics.Enabled {
		router.Handle(cfg.Metrics.Path, promhttp.Handler()).Methods("GET")
	}

	// Apply middleware
	handler := handlers.CORSMiddleware(router)
	handler = handlers.LoggingMiddleware(logger)(handler)
	handler = handlers.RecoveryMiddleware(logger)(handler)

	// Create HTTP server
	server := &http.Server{
		Addr:         fmt.Sprintf("%s:%s", cfg.Server.Host, cfg.Server.Port),
		Handler:      handler,
		ReadTimeout:  cfg.Server.ReadTimeout,
		WriteTimeout: cfg.Server.WriteTimeout,
		IdleTimeout:  cfg.Server.IdleTimeout,
	}

	// Start metrics server if enabled
	var metricsServer *http.Server
	if cfg.Metrics.Enabled {
		metricsRouter := mux.NewRouter()
		metricsRouter.Handle(cfg.Metrics.Path, promhttp.Handler()).Methods("GET")

		metricsServer = &http.Server{
			Addr:    fmt.Sprintf(":%s", cfg.Metrics.Port),
			Handler: metricsRouter,
		}

		go func() {
			logger.WithField("port", cfg.Metrics.Port).Info("Starting metrics server")
			if err := metricsServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				logger.WithError(err).Error("Metrics server error")
			}
		}()
	}

	// Start server
	go func() {
		logger.WithField("addr", server.Addr).Info("Starting HTTP server")
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.WithError(err).Fatal("Server error")
		}
	}()

	// Wait for interrupt signal to gracefully shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down servers...")

	// Graceful shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Shutdown services
	go func() {
		connectionManager.Shutdown(ctx)
		roomManager.Shutdown()
		presenceManager.Shutdown()
		messageBroker.Shutdown(ctx)
	}()

	// Shutdown HTTP server
	if err := server.Shutdown(ctx); err != nil {
		logger.WithError(err).Error("Server forced to shutdown")
	}

	// Shutdown metrics server
	if metricsServer != nil {
		if err := metricsServer.Shutdown(ctx); err != nil {
			logger.WithError(err).Error("Metrics server forced to shutdown")
		}
	}

	logger.Info("Servers shutdown complete")
}
