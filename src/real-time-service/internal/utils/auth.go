package utils

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var (
	ErrMissingAuth   = errors.New("missing authentication")
	ErrInvalidToken  = errors.New("invalid token")
	ErrExpiredToken  = errors.New("token expired")
	ErrInvalidClaims = errors.New("invalid token claims")
)

type Claims struct {
	UserID   string   `json:"user_id"`
	GameID   string   `json:"game_id"`
	Username string   `json:"username"`
	Roles    []string `json:"roles"`
	jwt.RegisteredClaims
}

type AuthValidator struct {
	jwtSecret []byte
	skipAuth  bool
}

func NewAuthValidator(secret string, skipAuth bool) *AuthValidator {
	return &AuthValidator{
		jwtSecret: []byte(secret),
		skipAuth:  skipAuth,
	}
}

func (av *AuthValidator) ValidateToken(tokenString string) (*Claims, error) {
	if av.skipAuth {
		// Return dummy claims for development
		return &Claims{
			UserID:   "dev-user-123",
			GameID:   "dev-game-456",
			Username: "developer",
			Roles:    []string{"user"},
		}, nil
	}

	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return av.jwtSecret, nil
	})

	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrExpiredToken
		}
		return nil, ErrInvalidToken
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, ErrInvalidClaims
	}

	if claims.UserID == "" || claims.GameID == "" {
		return nil, ErrInvalidClaims
	}

	return claims, nil
}

func (av *AuthValidator) GenerateToken(userID, gameID, username string, roles []string) (string, error) {
	claims := &Claims{
		UserID:   userID,
		GameID:   gameID,
		Username: username,
		Roles:    roles,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			NotBefore: jwt.NewNumericDate(time.Now()),
			Issuer:    "ritcher-realtime-service",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(av.jwtSecret)
}

func (c *Claims) HasRole(role string) bool {
	for _, r := range c.Roles {
		if r == role {
			return true
		}
	}
	return false
}

func (c *Claims) IsAdmin() bool {
	return c.HasRole("admin")
}

func (c *Claims) IsModerator() bool {
	return c.HasRole("moderator") || c.IsAdmin()
}
