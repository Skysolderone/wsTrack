package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
	"gorm.io/gorm"

	"wsTrack/server/internal/dto"
	"wsTrack/server/internal/enum"
	apperrors "wsTrack/server/internal/errors"
	"wsTrack/server/internal/model"
	"wsTrack/server/internal/repository"
	"wsTrack/server/internal/testutil"
	appauth "wsTrack/server/pkg/auth"
	"wsTrack/server/pkg/hash"
)

type AuthServiceSuite struct {
	suite.Suite
	authService *AuthService
	db          *gorm.DB
	redisClient *redis.Client
	userRepo    repository.UserRepository
}

func TestAuthServiceSuite(t *testing.T) {
	suite.Run(t, new(AuthServiceSuite))
}

func (s *AuthServiceSuite) SetupSuite() {
	s.db = testutil.SetupTestDB(s.T())
	s.redisClient = testutil.SetupTestRedis(s.T())
	s.userRepo = repository.NewUserRepository(s.db)
	s.authService = NewAuthService(s.userRepo, s.redisClient, testutil.TestJWTConfig())
}

func (s *AuthServiceSuite) TearDownSuite() {
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

func (s *AuthServiceSuite) SetupTest() {
	s.resetState()
	s.T().Cleanup(s.resetState)
}

func (s *AuthServiceSuite) TestRegister_Success() {
	resp, err := s.authService.Register(dto.RegisterRequest{
		Email:    "register@example.com",
		Password: "StrongPass123",
		Nickname: "注册用户",
	})
	require.NoError(s.T(), err)
	require.NotNil(s.T(), resp)
	assert.NotEmpty(s.T(), resp.AccessToken)
	assert.NotEmpty(s.T(), resp.RefreshToken)
	assert.Equal(s.T(), "register@example.com", resp.User.Email)
	assert.Equal(s.T(), "注册用户", resp.User.Nickname)

	user, err := s.userRepo.FindByEmail("register@example.com")
	require.NoError(s.T(), err)
	require.NotNil(s.T(), user)
	assert.NotEqual(s.T(), "StrongPass123", user.PasswordHash)
	assert.NoError(s.T(), hash.ComparePassword(user.PasswordHash, "StrongPass123"))

	storedToken, err := s.redisClient.Get(context.Background(), refreshTokenKey(user.ID)).Result()
	require.NoError(s.T(), err)
	assert.Equal(s.T(), resp.RefreshToken, storedToken)
}

func (s *AuthServiceSuite) TestRegister_DuplicateEmail() {
	_, err := testutil.CreateTestUser(s.db, "duplicate@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	resp, err := s.authService.Register(dto.RegisterRequest{
		Email:    "duplicate@example.com",
		Password: "StrongPass123",
		Nickname: "重复用户",
	})
	require.Nil(s.T(), resp)
	appErr := requireAppError(s.T(), err)
	assert.Equal(s.T(), 409, appErr.HTTPStatus)

	var count int64
	require.NoError(s.T(), s.db.Model(&model.User{}).Where("email = ?", "duplicate@example.com").Count(&count).Error)
	assert.Equal(s.T(), int64(1), count)
}

func (s *AuthServiceSuite) TestRegister_WeakPassword() {
	resp, err := s.authService.Register(dto.RegisterRequest{
		Email:    "weak@example.com",
		Password: "short",
		Nickname: "弱密码用户",
	})
	require.Nil(s.T(), resp)
	appErr := requireAppError(s.T(), err)
	assert.Equal(s.T(), 400, appErr.HTTPStatus)

	var count int64
	require.NoError(s.T(), s.db.Model(&model.User{}).Count(&count).Error)
	assert.Zero(s.T(), count)
}

func (s *AuthServiceSuite) TestRegister_InvalidEmail() {
	resp, err := s.authService.Register(dto.RegisterRequest{
		Email:    "notanemail",
		Password: "StrongPass123",
		Nickname: "非法邮箱",
	})
	require.Nil(s.T(), resp)
	appErr := requireAppError(s.T(), err)
	assert.Equal(s.T(), 400, appErr.HTTPStatus)

	var count int64
	require.NoError(s.T(), s.db.Model(&model.User{}).Count(&count).Error)
	assert.Zero(s.T(), count)
}

func (s *AuthServiceSuite) TestLogin_Success() {
	user, err := testutil.CreateTestUser(s.db, "login@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	resp, err := s.authService.Login(dto.LoginRequest{
		Email:    "login@example.com",
		Password: "StrongPass123",
	})
	require.NoError(s.T(), err)
	require.NotNil(s.T(), resp)
	assert.NotEmpty(s.T(), resp.AccessToken)
	assert.NotEmpty(s.T(), resp.RefreshToken)

	storedToken, err := s.redisClient.Get(context.Background(), refreshTokenKey(user.ID)).Result()
	require.NoError(s.T(), err)
	assert.Equal(s.T(), resp.RefreshToken, storedToken)
}

func (s *AuthServiceSuite) TestLogin_WrongPassword() {
	_, err := testutil.CreateTestUser(s.db, "wrongpass@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	resp, err := s.authService.Login(dto.LoginRequest{
		Email:    "wrongpass@example.com",
		Password: "WrongPass123",
	})
	require.Nil(s.T(), resp)
	appErr := requireAppError(s.T(), err)
	assert.Equal(s.T(), 401, appErr.HTTPStatus)
	assert.Equal(s.T(), "invalid email or password", appErr.Message)
}

func (s *AuthServiceSuite) TestLogin_NonExistentUser() {
	resp, err := s.authService.Login(dto.LoginRequest{
		Email:    "missing@example.com",
		Password: "StrongPass123",
	})
	require.Nil(s.T(), resp)
	appErr := requireAppError(s.T(), err)
	assert.Equal(s.T(), 401, appErr.HTTPStatus)
	assert.Equal(s.T(), "invalid email or password", appErr.Message)
}

func (s *AuthServiceSuite) TestRefreshToken_Success() {
	resp, err := s.authService.Register(dto.RegisterRequest{
		Email:    "refresh@example.com",
		Password: "StrongPass123",
		Nickname: "刷新用户",
	})
	require.NoError(s.T(), err)
	require.NotNil(s.T(), resp)

	user, err := s.userRepo.FindByEmail("refresh@example.com")
	require.NoError(s.T(), err)
	require.NotNil(s.T(), user)

	refreshed, err := s.authService.RefreshToken(dto.RefreshRequest{
		RefreshToken: resp.RefreshToken,
	})
	require.NoError(s.T(), err)
	require.NotNil(s.T(), refreshed)
	assert.NotEqual(s.T(), resp.RefreshToken, refreshed.RefreshToken)
	assert.NotEqual(s.T(), resp.AccessToken, refreshed.AccessToken)

	storedToken, err := s.redisClient.Get(context.Background(), refreshTokenKey(user.ID)).Result()
	require.NoError(s.T(), err)
	assert.Equal(s.T(), refreshed.RefreshToken, storedToken)
	assert.NotEqual(s.T(), resp.RefreshToken, storedToken)

	reused, err := s.authService.RefreshToken(dto.RefreshRequest{
		RefreshToken: resp.RefreshToken,
	})
	require.Nil(s.T(), reused)
	appErr := requireAppError(s.T(), err)
	assert.Equal(s.T(), 401, appErr.HTTPStatus)
}

func (s *AuthServiceSuite) TestRefreshToken_Expired() {
	user, err := testutil.CreateTestUser(s.db, "expired@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	expiredToken := generateRefreshToken(s.T(), user.ID, time.Now().Add(-1*time.Minute))
	resp, err := s.authService.RefreshToken(dto.RefreshRequest{
		RefreshToken: expiredToken,
	})
	require.Nil(s.T(), resp)
	appErr := requireAppError(s.T(), err)
	assert.Equal(s.T(), 401, appErr.HTTPStatus)
}

func (s *AuthServiceSuite) TestRefreshToken_Revoked() {
	resp, err := s.authService.Register(dto.RegisterRequest{
		Email:    "revoked@example.com",
		Password: "StrongPass123",
		Nickname: "撤销用户",
	})
	require.NoError(s.T(), err)

	user, err := s.userRepo.FindByEmail("revoked@example.com")
	require.NoError(s.T(), err)
	require.NotNil(s.T(), user)
	require.NoError(s.T(), s.redisClient.Del(context.Background(), refreshTokenKey(user.ID)).Err())

	refreshed, err := s.authService.RefreshToken(dto.RefreshRequest{
		RefreshToken: resp.RefreshToken,
	})
	require.Nil(s.T(), refreshed)
	appErr := requireAppError(s.T(), err)
	assert.Equal(s.T(), 401, appErr.HTTPStatus)
	assert.Equal(s.T(), "refresh token expired or revoked", appErr.Message)
}

func (s *AuthServiceSuite) TestChangePassword_Success() {
	user, err := testutil.CreateTestUser(s.db, "changepass@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	err = s.authService.ChangePassword(user.ID, dto.ChangePasswordRequest{
		OldPassword: "StrongPass123",
		NewPassword: "NewStrongPass123",
	})
	require.NoError(s.T(), err)

	oldLogin, err := s.authService.Login(dto.LoginRequest{
		Email:    "changepass@example.com",
		Password: "StrongPass123",
	})
	require.Nil(s.T(), oldLogin)
	oldLoginErr := requireAppError(s.T(), err)
	assert.Equal(s.T(), 401, oldLoginErr.HTTPStatus)

	newLogin, err := s.authService.Login(dto.LoginRequest{
		Email:    "changepass@example.com",
		Password: "NewStrongPass123",
	})
	require.NoError(s.T(), err)
	require.NotNil(s.T(), newLogin)
}

func (s *AuthServiceSuite) TestChangePassword_WrongOldPassword() {
	user, err := testutil.CreateTestUser(s.db, "wrongold@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	err = s.authService.ChangePassword(user.ID, dto.ChangePasswordRequest{
		OldPassword: "WrongPass123",
		NewPassword: "NewStrongPass123",
	})
	appErr := requireAppError(s.T(), err)
	assert.Equal(s.T(), 401, appErr.HTTPStatus)

	loginResp, err := s.authService.Login(dto.LoginRequest{
		Email:    "wrongold@example.com",
		Password: "StrongPass123",
	})
	require.NoError(s.T(), err)
	require.NotNil(s.T(), loginResp)
}

func (s *AuthServiceSuite) TestUpdateProfile_Success() {
	user, err := testutil.CreateTestUser(s.db, "profile@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	nickname := "更新昵称"
	weightUnit := string(enum.WeightUnitLBS)
	language := "en"

	info, err := s.authService.UpdateProfile(user.ID, dto.UpdateProfileRequest{
		Nickname:   &nickname,
		WeightUnit: &weightUnit,
		Language:   &language,
	})
	require.NoError(s.T(), err)
	require.NotNil(s.T(), info)
	assert.Equal(s.T(), nickname, info.Nickname)
	assert.Equal(s.T(), weightUnit, info.WeightUnit)
	assert.Equal(s.T(), language, info.Language)

	updatedUser, err := s.userRepo.FindByID(user.ID)
	require.NoError(s.T(), err)
	require.NotNil(s.T(), updatedUser)
	assert.Equal(s.T(), nickname, updatedUser.Nickname)
	assert.Equal(s.T(), enum.WeightUnit(weightUnit), updatedUser.WeightUnit)
	assert.Equal(s.T(), language, updatedUser.Language)
}

func (s *AuthServiceSuite) resetState() {
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

func requireAppError(t *testing.T, err error) *apperrors.AppError {
	t.Helper()

	require.Error(t, err)
	var appErr *apperrors.AppError
	require.True(t, errors.As(err, &appErr))
	return appErr
}

func generateRefreshToken(t *testing.T, userID uuid.UUID, expiresAt time.Time) string {
	t.Helper()

	cfg := testutil.TestJWTConfig()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, appauth.Claims{
		UserID:    userID,
		TokenType: appauth.TokenTypeRefresh,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			ID:        uuid.NewString(),
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-5 * time.Minute)),
			Subject:   userID.String(),
		},
	})

	signed, err := token.SignedString([]byte(cfg.Secret))
	require.NoError(t, err)
	return signed
}
