package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	apperrors "wsTrack/server/internal/errors"
	"wsTrack/server/internal/repository"
	"wsTrack/server/pkg/response"
)

const ContextCoachClientID = "coachClientID"

var coachRelationChecker repository.CoachRelationChecker

func SetCoachRelationChecker(checker repository.CoachRelationChecker) {
	coachRelationChecker = checker
}

func CoachOnly() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, ok := GetUserRole(c)
		if !ok || role != "coach" {
			response.Error(c, http.StatusForbidden, apperrors.CodeForbidden, "coach role required")
			c.Abort()
			return
		}

		c.Next()
	}
}

func ActiveCoachClient() gin.HandlerFunc {
	return func(c *gin.Context) {
		if coachRelationChecker == nil {
			response.Error(c, http.StatusInternalServerError, apperrors.CodeInternal, "coach relation checker not configured")
			c.Abort()
			return
		}

		coachID, ok := GetUserID(c)
		if !ok {
			response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
			c.Abort()
			return
		}

		clientID, err := uuid.Parse(c.Param("clientId"))
		if err != nil {
			response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid client id")
			c.Abort()
			return
		}

		allowed, err := coachRelationChecker.HasActiveClientRelation(coachID, clientID)
		if err != nil {
			response.Error(c, http.StatusInternalServerError, apperrors.CodeInternal, "failed to verify coach-client relationship")
			c.Abort()
			return
		}
		if !allowed {
			response.Error(c, http.StatusForbidden, apperrors.CodeForbidden, "active coach-client relationship required")
			c.Abort()
			return
		}

		c.Set(ContextCoachClientID, clientID)
		c.Next()
	}
}

func GetCoachClientID(c *gin.Context) (uuid.UUID, bool) {
	value, ok := c.Get(ContextCoachClientID)
	if !ok {
		return uuid.Nil, false
	}

	clientID, ok := value.(uuid.UUID)
	if !ok {
		return uuid.Nil, false
	}

	return clientID, true
}
