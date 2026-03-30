package service

import (
	"context"
	"errors"
	"fmt"
	"net/mail"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"wsTrack/server/internal/config"
	"wsTrack/server/internal/dto"
	"wsTrack/server/internal/enum"
	apperrors "wsTrack/server/internal/errors"
	"wsTrack/server/internal/model"
	"wsTrack/server/internal/repository"
	appauth "wsTrack/server/pkg/auth"
	"wsTrack/server/pkg/hash"
)

type AuthService struct {
	users       repository.UserRepository
	redisClient *redis.Client
	jwtCfg      config.JWTConfig
}

func NewAuthService(users repository.UserRepository, redisClient *redis.Client, jwtCfg config.JWTConfig) *AuthService {
	return &AuthService{
		users:       users,
		redisClient: redisClient,
		jwtCfg:      jwtCfg,
	}
}

func (s *AuthService) Register(req dto.RegisterRequest) (*dto.AuthResponse, error) {
	email := strings.TrimSpace(strings.ToLower(req.Email))
	nickname := strings.TrimSpace(req.Nickname)
	if err := validateRegisterInput(email, req.Password, nickname); err != nil {
		return nil, err
	}
	if nickname == "" {
		return nil, apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "nickname cannot be empty")
	}

	exists, err := s.users.ExistsByEmail(email)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query user")
	}
	if exists {
		return nil, apperrors.New(http.StatusConflict, apperrors.CodeConflict, "email already registered")
	}

	passwordHash, err := hash.HashPassword(req.Password)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to hash password")
	}

	user := &model.User{
		Email:        email,
		PasswordHash: passwordHash,
		Nickname:     nickname,
		WeightUnit:   enum.WeightUnitKG,
		Language:     "zh",
		Role:         "user",
	}

	if err := s.users.Create(user); err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to create user")
	}

	return s.issueTokens(user)
}

func (s *AuthService) Login(req dto.LoginRequest) (*dto.AuthResponse, error) {
	email := strings.TrimSpace(strings.ToLower(req.Email))

	user, err := s.users.FindByEmail(email)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query user")
	}
	if user == nil {
		return nil, apperrors.New(http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid email or password")
	}

	if err := hash.ComparePassword(user.PasswordHash, req.Password); err != nil {
		return nil, apperrors.New(http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid email or password")
	}

	return s.issueTokens(user)
}

func (s *AuthService) RefreshToken(req dto.RefreshRequest) (*dto.AuthResponse, error) {
	refreshToken := strings.TrimSpace(req.RefreshToken)
	claims, err := appauth.ParseToken(refreshToken)
	if err != nil {
		return nil, apperrors.New(http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid refresh token")
	}
	if claims.TokenType != appauth.TokenTypeRefresh {
		return nil, apperrors.New(http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid token type")
	}

	if err := s.validateRefreshToken(claims.UserID, refreshToken); err != nil {
		return nil, err
	}

	user, err := s.users.FindByID(claims.UserID)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query user")
	}
	if user == nil {
		return nil, apperrors.New(http.StatusUnauthorized, apperrors.CodeUnauthorized, "user not found")
	}

	return s.issueTokens(user)
}

func (s *AuthService) GetProfile(userID uuid.UUID) (*dto.UserInfo, error) {
	user, err := s.users.FindByID(userID)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query user")
	}
	if user == nil {
		return nil, apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "user not found")
	}

	userInfo := toUserInfo(user)
	return &userInfo, nil
}

func (s *AuthService) UpdateProfile(userID uuid.UUID, req dto.UpdateProfileRequest) (*dto.UserInfo, error) {
	user, err := s.users.FindByID(userID)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query user")
	}
	if user == nil {
		return nil, apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "user not found")
	}

	if req.Nickname != nil {
		nickname := strings.TrimSpace(*req.Nickname)
		if nickname == "" {
			return nil, apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "nickname cannot be empty")
		}
		user.Nickname = nickname
	}
	if req.WeightUnit != nil {
		user.WeightUnit = enum.WeightUnit(strings.TrimSpace(*req.WeightUnit))
	}
	if req.Language != nil {
		user.Language = strings.TrimSpace(*req.Language)
	}

	if err := s.users.Update(user); err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to update profile")
	}

	userInfo := toUserInfo(user)
	return &userInfo, nil
}

func (s *AuthService) ChangePassword(userID uuid.UUID, req dto.ChangePasswordRequest) error {
	user, err := s.users.FindByID(userID)
	if err != nil {
		return apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query user")
	}
	if user == nil {
		return apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "user not found")
	}

	if err := hash.ComparePassword(user.PasswordHash, req.OldPassword); err != nil {
		return apperrors.New(http.StatusUnauthorized, apperrors.CodeUnauthorized, "old password is incorrect")
	}

	newPasswordHash, err := hash.HashPassword(req.NewPassword)
	if err != nil {
		return apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to hash password")
	}

	user.PasswordHash = newPasswordHash
	if err := s.users.Update(user); err != nil {
		return apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to update password")
	}

	if err := s.deleteRefreshToken(userID); err != nil {
		return err
	}

	return nil
}

func (s *AuthService) issueTokens(user *model.User) (*dto.AuthResponse, error) {
	accessToken, err := appauth.GenerateAccessToken(user.ID, user.Role)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to generate access token")
	}

	refreshToken, err := appauth.GenerateRefreshToken(user.ID)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to generate refresh token")
	}

	if err := s.storeRefreshToken(user.ID, refreshToken); err != nil {
		return nil, err
	}

	return &dto.AuthResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		ExpiresIn:    int64(s.jwtCfg.AccessTokenTTL.Seconds()),
		User:         toUserInfo(user),
	}, nil
}

func (s *AuthService) storeRefreshToken(userID uuid.UUID, token string) error {
	if s.redisClient == nil {
		return nil
	}

	if err := s.redisClient.Set(context.Background(), refreshTokenKey(userID), token, s.jwtCfg.RefreshTokenTTL).Err(); err != nil {
		return apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to store refresh token")
	}

	return nil
}

func (s *AuthService) validateRefreshToken(userID uuid.UUID, token string) error {
	if s.redisClient == nil {
		return nil
	}

	storedToken, err := s.redisClient.Get(context.Background(), refreshTokenKey(userID)).Result()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return apperrors.New(http.StatusUnauthorized, apperrors.CodeUnauthorized, "refresh token expired or revoked")
		}
		return apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to validate refresh token")
	}

	if storedToken == "" || storedToken != token {
		return apperrors.New(http.StatusUnauthorized, apperrors.CodeUnauthorized, "refresh token expired or revoked")
	}

	return nil
}

func (s *AuthService) deleteRefreshToken(userID uuid.UUID) error {
	if s.redisClient == nil {
		return nil
	}

	if err := s.redisClient.Del(context.Background(), refreshTokenKey(userID)).Err(); err != nil {
		return apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to revoke refresh token")
	}

	return nil
}

func refreshTokenKey(userID uuid.UUID) string {
	return fmt.Sprintf("refresh:%s", userID.String())
}

func validateRegisterInput(email, password, nickname string) error {
	parsedEmail, err := mail.ParseAddress(email)
	if err != nil || !strings.EqualFold(parsedEmail.Address, email) {
		return apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "invalid email address")
	}

	if len(password) < 8 || len(password) > 64 {
		return apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "password must be between 8 and 64 characters")
	}

	nicknameLength := utf8.RuneCountInString(nickname)
	if nicknameLength < 2 || nicknameLength > 50 {
		return apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "nickname must be between 2 and 50 characters")
	}

	return nil
}

func toUserInfo(user *model.User) dto.UserInfo {
	return dto.UserInfo{
		ID:         user.ID,
		Email:      user.Email,
		Nickname:   user.Nickname,
		WeightUnit: string(user.WeightUnit),
		Language:   user.Language,
		Role:       user.Role,
	}
}
