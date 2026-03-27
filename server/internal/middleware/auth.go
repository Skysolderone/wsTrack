package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	appauth "wsTrack/server/pkg/auth"
	"wsTrack/server/pkg/response"

	apperrors "wsTrack/server/internal/errors"
)

const (
	ContextUserID = "userID"
	ContextRole   = "role"
	ContextClaims = "claims"
)

func Auth() gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" {
			response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "missing authorization header")
			c.Abort()
			return
		}

		parts := strings.SplitN(header, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid authorization header")
			c.Abort()
			return
		}

		claims, err := appauth.ParseToken(parts[1])
		if err != nil || claims.TokenType != appauth.TokenTypeAccess {
			response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid access token")
			c.Abort()
			return
		}

		c.Set(ContextUserID, claims.UserID)
		c.Set(ContextRole, claims.Role)
		c.Set(ContextClaims, claims)
		c.Next()
	}
}

func GetUserID(c *gin.Context) (uuid.UUID, bool) {
	value, ok := c.Get(ContextUserID)
	if !ok {
		return uuid.Nil, false
	}

	userID, ok := value.(uuid.UUID)
	if !ok {
		return uuid.Nil, false
	}

	return userID, true
}

func GetUserRole(c *gin.Context) (string, bool) {
	value, ok := c.Get(ContextRole)
	if !ok {
		return "", false
	}

	role, ok := value.(string)
	if !ok {
		return "", false
	}

	return role, true
}
