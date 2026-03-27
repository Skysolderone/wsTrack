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

type WorkoutHandler struct {
	workoutService *service.WorkoutService
}

func NewWorkoutHandler(workoutService *service.WorkoutService) *WorkoutHandler {
	return &WorkoutHandler{workoutService: workoutService}
}

// List godoc
// @Summary List workouts
// @Tags workouts
// @Produce json
// @Security BearerAuth
// @Param date_from query string false "Start datetime"
// @Param date_to query string false "End datetime"
// @Param exercise_id query string false "Exercise ID"
// @Param page query int false "Page number"
// @Param page_size query int false "Page size"
// @Param sort_by query string false "Sort field"
// @Param sort_dir query string false "Sort direction"
// @Success 200 {object} response.Response
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /workouts [get]
func (h *WorkoutHandler) List(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	var filter dto.WorkoutFilter
	if err := c.ShouldBindQuery(&filter); err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, err.Error())
		return
	}

	items, total, err := h.workoutService.List(userID, filter)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.PagedSuccess(c, items, total, filter.PageQuery.GetPage(), filter.PageQuery.GetPageSize())
}

// Get godoc
// @Summary Get workout detail
// @Tags workouts
// @Produce json
// @Security BearerAuth
// @Param id path string true "Workout ID"
// @Success 200 {object} response.Response{data=dto.WorkoutDetailResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /workouts/{id} [get]
func (h *WorkoutHandler) Get(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid workout id")
		return
	}

	item, err := h.workoutService.GetByID(id, userID)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, item)
}

// Create godoc
// @Summary Create a workout
// @Tags workouts
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body dto.WorkoutFullData true "Workout payload"
// @Success 200 {object} response.Response{data=dto.WorkoutDetailResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 409 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /workouts [post]
func (h *WorkoutHandler) Create(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	var req dto.WorkoutFullData
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, err.Error())
		return
	}

	item, err := h.workoutService.Create(userID, req)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, item)
}

// Update godoc
// @Summary Update workout rating and notes
// @Tags workouts
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Workout ID"
// @Param request body dto.UpdateWorkoutRequest true "Update workout request"
// @Success 200 {object} response.Response{data=dto.WorkoutDetailResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /workouts/{id} [put]
func (h *WorkoutHandler) Update(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid workout id")
		return
	}

	var req dto.UpdateWorkoutRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, err.Error())
		return
	}

	item, err := h.workoutService.Update(id, userID, req)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, item)
}

// Delete godoc
// @Summary Delete workout
// @Tags workouts
// @Produce json
// @Security BearerAuth
// @Param id path string true "Workout ID"
// @Success 200 {object} response.Response
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /workouts/{id} [delete]
func (h *WorkoutHandler) Delete(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid workout id")
		return
	}

	if err := h.workoutService.Delete(id, userID); err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, nil)
}

// Sync godoc
// @Summary Batch sync workouts
// @Tags workouts
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body dto.SyncWorkoutRequest true "Sync workout request"
// @Success 200 {object} response.Response{data=dto.SyncWorkoutResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /workouts/sync [post]
func (h *WorkoutHandler) Sync(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	var req dto.SyncWorkoutRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, err.Error())
		return
	}

	item, err := h.workoutService.Sync(userID, req)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, item)
}
