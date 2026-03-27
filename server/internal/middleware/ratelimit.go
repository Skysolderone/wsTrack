package middleware

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"

	apperrors "wsTrack/server/internal/errors"
	"wsTrack/server/pkg/response"
)

var rateLimitClient *redis.Client

func SetRateLimitClient(client *redis.Client) {
	rateLimitClient = client
}

func RateLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		if rateLimitClient == nil {
			c.Next()
			return
		}

		key := fmt.Sprintf("ratelimit:%s:%s", c.ClientIP(), time.Now().UTC().Format("200601021504"))
		ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
		defer cancel()

		count, err := rateLimitClient.Incr(ctx, key).Result()
		if err != nil {
			zap.L().Warn("rate limit redis error", zap.Error(err))
			c.Next()
			return
		}

		if count == 1 {
			if err := rateLimitClient.Expire(ctx, key, time.Minute).Err(); err != nil {
				zap.L().Warn("rate limit expire error", zap.Error(err))
			}
		}

		if count > 100 {
			response.Error(c, http.StatusTooManyRequests, apperrors.CodeRateLimitExceeded, "rate limit exceeded")
			c.Abort()
			return
		}

		c.Next()
	}
}
