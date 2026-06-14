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
// puts the user id in the standard `sub` claim and includes `exp`. The custom
// `admin` claim marks CMS operators; it is absent on older tokens and defaults
// to false (zero value), keeping validation backward compatible.
type Claims struct {
	jwt.RegisteredClaims
	Admin bool `json:"admin"`
}

// Validate parses and verifies an HS256 token and returns the user id (`sub`)
// plus the admin flag. A missing/absent flag yields false.
func Validate(tokenString string, secret []byte) (userID string, admin bool, err error) {
	if tokenString == "" {
		return "", false, ErrMissingToken
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
		return "", false, ErrInvalidToken
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || claims.Subject == "" {
		return "", false, ErrInvalidToken
	}
	return claims.Subject, claims.Admin, nil
}
