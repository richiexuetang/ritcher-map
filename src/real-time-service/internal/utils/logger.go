package utils

import (
	"os"

	"github.com/sirupsen/logrus"
)

func SetupLogger() *logrus.Logger {
	logger := logrus.New()

	// Set log level
	level, err := logrus.ParseLevel(os.Getenv("LOG_LEVEL"))
	if err != nil {
		level = logrus.InfoLevel
	}
	logger.SetLevel(level)

	// Set formatter
	if os.Getenv("LOG_FORMAT") == "json" {
		logger.SetFormatter(&logrus.JSONFormatter{
			TimestampFormat: "2006-01-02T15:04:05.000Z07:00",
		})
	} else {
		logger.SetFormatter(&logrus.TextFormatter{
			FullTimestamp:   true,
			TimestampFormat: "2006-01-02T15:04:05.000Z07:00",
		})
	}

	// Set output
	logger.SetOutput(os.Stdout)

	return logger
}
