package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
	"gorm.io/gorm"

	"wsTrack/server/internal/dto"
	apperrors "wsTrack/server/internal/errors"
	"wsTrack/server/internal/middleware"
	"wsTrack/server/internal/model"
	"wsTrack/server/internal/repository"
	"wsTrack/server/internal/service"
	"wsTrack/server/internal/testutil"
	appvalidator "wsTrack/server/pkg/validator"
)

type authAPIResponse[T any] struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    T      `json:"data"`
}

type AuthHandlerSuite struct {
	suite.Suite
	authHandler *AuthHandler
	authService *service.AuthService
	db          *gorm.DB
	redisClient *redis.Client
	router      *gin.Engine
}

func TestAuthHandlerSuite(t *testing.T) {
	suite.Run(t, new(AuthHandlerSuite))
}

func (s *AuthHandlerSuite) SetupSuite() {
	gin.SetMode(gin.TestMode)
	require.NoError(s.T(), appvalidator.RegisterCustomValidators())

	s.db = testutil.SetupTestDB(s.T())
	s.redisClient = testutil.SetupTestRedis(s.T())
	userRepo := repository.NewUserRepository(s.db)
	s.authService = service.NewAuthService(userRepo, s.redisClient, testutil.TestJWTConfig())
	s.authHandler = NewAuthHandler(s.authService)
	s.router = buildAuthTestRouter(s.authHandler)
}

func (s *AuthHandlerSuite) TearDownSuite() {
	if s.redisClient != nil {
		_ = s.redisClient.Close()
	}

	if s.db != nil {
		sqlDB, err := s.db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	}

	testutil.TearDown()
}

func (s *AuthHandlerSuite) SetupTest() {
	s.resetState()
	s.T().Cleanup(s.resetState)
}

func (s *AuthHandlerSuite) TestRegisterHandler() {
	recorder := s.performJSONRequest(
		http.MethodPost,
		"/api/v1/auth/register",
		map[string]string{
			"email":    "handler-register@example.com",
			"password": "StrongPass123",
			"nickname": "处理器注册",
		},
		"",
	)

	require.Equal(s.T(), http.StatusCreated, recorder.Code)

	var resp authAPIResponse[dto.AuthResponse]
	require.NoError(s.T(), json.Unmarshal(recorder.Body.Bytes(), &resp))
	assert.Equal(s.T(), apperrors.CodeSuccess, resp.Code)
	assert.NotEmpty(s.T(), resp.Data.AccessToken)
	assert.Equal(s.T(), "handler-register@example.com", resp.Data.User.Email)
}

func (s *AuthHandlerSuite) TestLoginHandler() {
	_, err := testutil.CreateTestUser(s.db, "handler-login@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	recorder := s.performJSONRequest(
		http.MethodPost,
		"/api/v1/auth/login",
		map[string]string{
			"email":    "handler-login@example.com",
			"password": "StrongPass123",
		},
		"",
	)

	require.Equal(s.T(), http.StatusOK, recorder.Code)

	var resp authAPIResponse[dto.AuthResponse]
	require.NoError(s.T(), json.Unmarshal(recorder.Body.Bytes(), &resp))
	assert.Equal(s.T(), apperrors.CodeSuccess, resp.Code)
	assert.NotEmpty(s.T(), resp.Data.AccessToken)
	assert.NotEmpty(s.T(), resp.Data.RefreshToken)
}

func (s *AuthHandlerSuite) TestProfileHandler_Unauthorized() {
	recorder := s.performJSONRequest(http.MethodGet, "/api/v1/auth/profile", nil, "")
	require.Equal(s.T(), http.StatusUnauthorized, recorder.Code)
}

func (s *AuthHandlerSuite) TestProfileHandler_InvalidToken() {
	recorder := s.performJSONRequest(
		http.MethodGet,
		"/api/v1/auth/profile",
		nil,
		"Bearer invalid.token.value",
	)
	require.Equal(s.T(), http.StatusUnauthorized, recorder.Code)
}

func (s *AuthHandlerSuite) TestProfileHandler_Success() {
	user, err := testutil.CreateTestUser(s.db, "handler-profile@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	token, err := testutil.GetAuthToken(user.ID)
	require.NoError(s.T(), err)

	recorder := s.performJSONRequest(
		http.MethodGet,
		"/api/v1/auth/profile",
		nil,
		"Bearer "+token,
	)

	require.Equal(s.T(), http.StatusOK, recorder.Code)

	var resp authAPIResponse[dto.UserInfo]
	require.NoError(s.T(), json.Unmarshal(recorder.Body.Bytes(), &resp))
	assert.Equal(s.T(), apperrors.CodeSuccess, resp.Code)
	assert.Equal(s.T(), user.Email, resp.Data.Email)
	assert.Equal(s.T(), user.Nickname, resp.Data.Nickname)
}

func (s *AuthHandlerSuite) resetState() {
	if s.redisClient != nil {
		require.NoError(s.T(), s.redisClient.FlushDB(context.Background()).Err())
	}

	if s.db != nil {
		require.NoError(
			s.T(),
			s.db.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&model.User{}).Error,
		)
	}
}

func (s *AuthHandlerSuite) performJSONRequest(method, path string, body interface{}, authHeader string) *httptest.ResponseRecorder {
	s.T().Helper()

	var payload []byte
	if body != nil {
		raw, err := json.Marshal(body)
		require.NoError(s.T(), err)
		payload = raw
	}

	req := httptest.NewRequest(method, path, bytes.NewReader(payload))
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if authHeader != "" {
		req.Header.Set("Authorization", authHeader)
	}

	recorder := httptest.NewRecorder()
	s.router.ServeHTTP(recorder, req)
	return recorder
}

func buildAuthTestRouter(authHandler *AuthHandler) *gin.Engine {
	router := gin.New()

	authGroup := router.Group("/api/v1/auth")
	{
		authGroup.POST("/register", authHandler.Register)
		authGroup.POST("/login", authHandler.Login)
		authGroup.POST("/refresh", authHandler.RefreshToken)
	}

	authProtected := router.Group("/api/v1/auth")
	authProtected.Use(middleware.Auth())
	{
		authProtected.GET("/profile", authHandler.GetProfile)
		authProtected.PUT("/profile", authHandler.UpdateProfile)
		authProtected.PUT("/password", authHandler.ChangePassword)
	}

	return router
}
