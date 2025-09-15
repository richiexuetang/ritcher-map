package utils

import (
	"fmt"
	"regexp"
	"strings"
)

var (
	uuidRegex = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
)

func ValidateUUID(uuid string) error {
	if !uuidRegex.MatchString(uuid) {
		return fmt.Errorf("invalid UUID format: %s", uuid)
	}
	return nil
}

func ValidateGameID(gameID string) error {
	if gameID == "" {
		return fmt.Errorf("game ID is required")
	}
	return ValidateUUID(gameID)
}

func ValidateUserID(userID string) error {
	if userID == "" {
		return fmt.Errorf("user ID is required")
	}
	return ValidateUUID(userID)
}

func ValidateUsername(username string) error {
	if username == "" {
		return fmt.Errorf("username is required")
	}
	if len(username) < 3 || len(username) > 50 {
		return fmt.Errorf("username must be between 3 and 50 characters")
	}
	return nil
}

func ValidateRoomID(roomID string) error {
	if roomID == "" {
		return fmt.Errorf("room ID is required")
	}
	if len(roomID) > 100 {
		return fmt.Errorf("room ID too long")
	}
	return nil
}

func SanitizeString(input string) string {
	// Remove potentially dangerous characters
	sanitized := strings.TrimSpace(input)
	sanitized = strings.ReplaceAll(sanitized, "\n", " ")
	sanitized = strings.ReplaceAll(sanitized, "\r", " ")
	sanitized = strings.ReplaceAll(sanitized, "\t", " ")

	// Limit length
	if len(sanitized) > 1000 {
		sanitized = sanitized[:1000]
	}

	return sanitized
}

func ValidateLatitude(lat float64) error {
	if lat < -90 || lat > 90 {
		return fmt.Errorf("latitude must be between -90 and 90")
	}
	return nil
}

func ValidateLongitude(lng float64) error {
	if lng < -180 || lng > 180 {
		return fmt.Errorf("longitude must be between -180 and 180")
	}
	return nil
}
