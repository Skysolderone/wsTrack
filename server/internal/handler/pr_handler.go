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

type PRHandler struct {
	prService *service.PRService
}

func NewPRHandler(prService *service.PRService) *PRHandler {
	return &PRHandler{prService: prService}
}

// List godoc
// @Summary List personal records
// @Tags prs
// @Produce json
// @Security BearerAuth
// @Param exercise_id query string false "Filter by exercise ID"
// @Success 200 {object} response.Response
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /prs [get]
func (h *PRHandler) List(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	var exerciseID *uuid.UUID
	if rawExerciseID := c.Query("exercise_id"); rawExerciseID != "" {
		parsed, err := uuid.Parse(rawExerciseID)
		if err != nil {
			response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid exercise id")
			return
		}
		exerciseID = &parsed
	}

	items, err := h.prService.List(userID, exerciseID)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, items)
}

// ListByExercise godoc
// @Summary List personal records by exercise
// @Tags prs
// @Produce json
// @Security BearerAuth
// @Param exerciseId path string true "Exercise ID"
// @Success 200 {object} response.Response
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /prs/exercise/{exerciseId} [get]
func (h *PRHandler) ListByExercise(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	exerciseID, err := uuid.Parse(c.Param("exerciseId"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid exercise id")
		return
	}

	items, err := h.prService.List(userID, &exerciseID)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, items)
}
