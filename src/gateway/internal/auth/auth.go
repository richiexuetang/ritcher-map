package auth

import (
	"errors"
	"fmt"

	"github.com/golang-jwt/jwt/v5"
)

var (
	ErrMissingToken = errors.New("missing token")
	ErrInvalidToken = errors.New("invalid token")
)

// Claims is the subset of the session token we rely on. The accounts service
// puts the user id in the standard `sub` claim and includes `exp`.
type Claims struct {
	jwt.RegisteredClaims
}

// Validate parses and verifies an HS256 token and returns the user id (`sub`).
func Validate(tokenString string, secret []byte) (userID string, err error) {
	if tokenString == "" {
		return "", ErrMissingToken
	}

	token, err := jwt.ParseWithClaims(
		tokenString,
		&Claims{},
		func(t *jwt.Token) (any, error) {
			// Pin the algorithm — never accept "none" or an unexpected alg.
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			return secret, nil
		},
		jwt.WithExpirationRequired(),
	)
	if err != nil || !token.Valid {
		return "", ErrInvalidToken
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || claims.Subject == "" {
		return "", ErrInvalidToken
	}
	return claims.Subject, nil
}
