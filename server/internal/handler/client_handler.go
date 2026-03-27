package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	apperrors "wsTrack/server/internal/errors"
	"wsTrack/server/internal/middleware"
	"wsTrack/server/internal/service"
	"wsTrack/server/pkg/response"
)

type ClientHandler struct {
	coachService *service.CoachService
}

func NewClientHandler(coachService *service.CoachService) *ClientHandler {
	return &ClientHandler{coachService: coachService}
}

// ListInvitations godoc
// @Summary List received coach invitations
// @Tags client
// @Produce json
// @Security BearerAuth
// @Success 200 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /client/invitations [get]
func (h *ClientHandler) ListInvitations(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	items, err := h.coachService.ListInvitations(userID)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, items)
}

// AcceptInvitation godoc
// @Summary Accept coach invitation
// @Tags client
// @Produce json
// @Security BearerAuth
// @Param id path string true "Invitation ID"
// @Success 200 {object} response.Response{data=dto.ClientCoachResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 409 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /client/invitations/{id}/accept [post]
func (h *ClientHandler) AcceptInvitation(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid invitation id")
		return
	}

	item, err := h.coachService.AcceptInvitation(userID, id)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, item)
}

// RejectInvitation godoc
// @Summary Reject coach invitation
// @Tags client
// @Produce json
// @Security BearerAuth
// @Param id path string true "Invitation ID"
// @Success 200 {object} response.Response
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 409 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /client/invitations/{id}/reject [post]
func (h *ClientHandler) RejectInvitation(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid invitation id")
		return
	}

	if err := h.coachService.RejectInvitation(userID, id); err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, nil)
}

// ListCoaches godoc
// @Summary List my coaches
// @Tags client
// @Produce json
// @Security BearerAuth
// @Success 200 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /client/coaches [get]
func (h *ClientHandler) ListCoaches(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	items, err := h.coachService.ListCoaches(userID)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, items)
}

// ListComments godoc
// @Summary List coach comments
// @Tags client
// @Produce json
// @Security BearerAuth
// @Success 200 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /client/comments [get]
func (h *ClientHandler) ListComments(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	items, err := h.coachService.ListComments(userID)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, items)
}
