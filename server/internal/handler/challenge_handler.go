package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"wsTrack/server/internal/dto"
	apperrors "wsTrack/server/internal/errors"
	"wsTrack/server/internal/middleware"
	"wsTrack/server/internal/service"
	"wsTrack/server/pkg/response"
)

type ChallengeHandler struct {
	challengeService *service.ChallengeService
}

func NewChallengeHandler(challengeService *service.ChallengeService) *ChallengeHandler {
	return &ChallengeHandler{challengeService: challengeService}
}

// List godoc
// @Summary List challenges
// @Tags challenges
// @Produce json
// @Security BearerAuth
// @Param status query string false "active / completed"
// @Success 200 {object} response.Response
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /challenges [get]
func (h *ChallengeHandler) List(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	var filter dto.ChallengeFilter
	if err := c.ShouldBindQuery(&filter); err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, err.Error())
		return
	}

	items, err := h.challengeService.List(userID, filter)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, items)
}

// Create godoc
// @Summary Create challenge
// @Tags challenges
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body dto.CreateChallengeRequest true "Create challenge request"
// @Success 200 {object} response.Response{data=dto.ChallengeResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /challenges [post]
func (h *ChallengeHandler) Create(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	var req dto.CreateChallengeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, err.Error())
		return
	}

	item, err := h.challengeService.Create(userID, req)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, item)
}

// Update godoc
// @Summary Update challenge
// @Tags challenges
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Challenge ID"
// @Param request body dto.UpdateChallengeRequest true "Update challenge request"
// @Success 200 {object} response.Response{data=dto.ChallengeResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /challenges/{id} [put]
func (h *ChallengeHandler) Update(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid challenge id")
		return
	}

	var req dto.UpdateChallengeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, err.Error())
		return
	}

	item, err := h.challengeService.Update(id, userID, req)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, item)
}

// Delete godoc
// @Summary Delete challenge
// @Tags challenges
// @Produce json
// @Security BearerAuth
// @Param id path string true "Challenge ID"
// @Success 200 {object} response.Response
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /challenges/{id} [delete]
func (h *ChallengeHandler) Delete(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid challenge id")
		return
	}

	if err := h.challengeService.Delete(id, userID); err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, nil)
}
