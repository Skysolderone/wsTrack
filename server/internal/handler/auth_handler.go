package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"wsTrack/server/internal/dto"
	apperrors "wsTrack/server/internal/errors"
	"wsTrack/server/internal/middleware"
	"wsTrack/server/internal/service"
	"wsTrack/server/pkg/response"
)

type AuthHandler struct {
	authService *service.AuthService
}

func NewAuthHandler(authService *service.AuthService) *AuthHandler {
	return &AuthHandler{authService: authService}
}

// Register godoc
// @Summary Register a new user
// @Tags auth
// @Accept json
// @Produce json
// @Param request body dto.RegisterRequest true "Register request"
// @Success 201 {object} response.Response{data=dto.AuthResponse}
// @Failure 400 {object} response.Response
// @Failure 409 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /auth/register [post]
func (h *AuthHandler) Register(c *gin.Context) {
	var req dto.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, err.Error())
		return
	}

	res, err := h.authService.Register(req)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Created(c, res)
}

// Login godoc
// @Summary Login
// @Tags auth
// @Accept json
// @Produce json
// @Param request body dto.LoginRequest true "Login request"
// @Success 200 {object} response.Response{data=dto.AuthResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /auth/login [post]
func (h *AuthHandler) Login(c *gin.Context) {
	var req dto.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, err.Error())
		return
	}

	res, err := h.authService.Login(req)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, res)
}

// RefreshToken godoc
// @Summary Refresh token pair
// @Tags auth
// @Accept json
// @Produce json
// @Param request body dto.RefreshRequest true "Refresh token request"
// @Success 200 {object} response.Response{data=dto.AuthResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /auth/refresh [post]
func (h *AuthHandler) RefreshToken(c *gin.Context) {
	var req dto.RefreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, err.Error())
		return
	}

	res, err := h.authService.RefreshToken(req)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, res)
}

// GetProfile godoc
// @Summary Get current user profile
// @Tags auth
// @Produce json
// @Security BearerAuth
// @Success 200 {object} response.Response{data=dto.UserInfo}
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /auth/profile [get]
func (h *AuthHandler) GetProfile(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	userInfo, err := h.authService.GetProfile(userID)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, userInfo)
}

// UpdateProfile godoc
// @Summary Update current user profile
// @Tags auth
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body dto.UpdateProfileRequest true "Update profile request"
// @Success 200 {object} response.Response{data=dto.UserInfo}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /auth/profile [put]
func (h *AuthHandler) UpdateProfile(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	var req dto.UpdateProfileRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, err.Error())
		return
	}

	userInfo, err := h.authService.UpdateProfile(userID, req)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, userInfo)
}

// ChangePassword godoc
// @Summary Change current user password
// @Tags auth
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body dto.ChangePasswordRequest true "Change password request"
// @Success 200 {object} response.Response
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /auth/password [put]
func (h *AuthHandler) ChangePassword(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	var req dto.ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, err.Error())
		return
	}

	if err := h.authService.ChangePassword(userID, req); err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, nil)
}

func writeAppError(c *gin.Context, err error) {
	var appErr *apperrors.AppError
	if errors.As(err, &appErr) {
		response.Error(c, appErr.HTTPStatus, appErr.Code, appErr.Message)
		return
	}

	response.Error(c, http.StatusInternalServerError, apperrors.CodeInternal, "internal server error")
}
