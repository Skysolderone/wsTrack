package auth

import (
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const (
	TokenTypeAccess  = "access"
	TokenTypeRefresh = "refresh"
)

type Settings struct {
	Secret          string
	AccessTokenTTL  time.Duration
	RefreshTokenTTL time.Duration
}

type Claims struct {
	UserID    uuid.UUID `json:"user_id"`
	Role      string    `json:"role,omitempty"`
	TokenType string    `json:"token_type"`
	jwt.RegisteredClaims
}

var (
	settingsMu sync.RWMutex
	settings   = Settings{
		Secret:          "change-me-in-production",
		AccessTokenTTL:  15 * time.Minute,
		RefreshTokenTTL: 7 * 24 * time.Hour,
	}
)

func Configure(cfg Settings) {
	settingsMu.Lock()
	defer settingsMu.Unlock()
	settings = cfg
}

func GenerateAccessToken(userID uuid.UUID, role string) (string, error) {
	cfg := currentSettings()
	if cfg.Secret == "" {
		return "", errors.New("jwt secret is empty")
	}

	claims := Claims{
		UserID:    userID,
		Role:      role,
		TokenType: TokenTypeAccess,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(cfg.AccessTokenTTL)),
			ID:        uuid.NewString(),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Subject:   userID.String(),
		},
	}

	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(cfg.Secret))
}

func GenerateRefreshToken(userID uuid.UUID) (string, error) {
	cfg := currentSettings()
	if cfg.Secret == "" {
		return "", errors.New("jwt secret is empty")
	}

	claims := Claims{
		UserID:    userID,
		TokenType: TokenTypeRefresh,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(cfg.RefreshTokenTTL)),
			ID:        uuid.NewString(),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Subject:   userID.String(),
		},
	}

	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(cfg.Secret))
}

func ParseToken(tokenString string) (*Claims, error) {
	cfg := currentSettings()
	if cfg.Secret == "" {
		return nil, errors.New("jwt secret is empty")
	}

	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, fmt.Errorf("unexpected signing method: %s", token.Method.Alg())
		}

		return []byte(cfg.Secret), nil
	})
	if err != nil {
		return nil, fmt.Errorf("parse token: %w", err)
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token claims")
	}

	return claims, nil
}

func currentSettings() Settings {
	settingsMu.RLock()
	defer settingsMu.RUnlock()
	return settings
}
