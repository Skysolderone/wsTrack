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

type ExerciseHandler struct {
	exerciseService *service.ExerciseService
}

func NewExerciseHandler(exerciseService *service.ExerciseService) *ExerciseHandler {
	return &ExerciseHandler{exerciseService: exerciseService}
}

// List godoc
// @Summary List exercises
// @Tags exercises
// @Produce json
// @Security BearerAuth
// @Param category query string false "Exercise category"
// @Param muscle query string false "Primary muscle"
// @Param equipment query string false "Equipment"
// @Param search query string false "Search by name or name_en"
// @Param is_custom query boolean false "Only custom or preset exercises"
// @Param page query int false "Page number"
// @Param page_size query int false "Page size"
// @Param sort_by query string false "Sort field"
// @Param sort_dir query string false "Sort direction"
// @Success 200 {object} response.Response
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /exercises [get]
func (h *ExerciseHandler) List(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	var filter dto.ExerciseFilter
	if err := c.ShouldBindQuery(&filter); err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, err.Error())
		return
	}

	items, total, err := h.exerciseService.List(userID, filter)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.PagedSuccess(c, items, total, filter.PageQuery.GetPage(), filter.PageQuery.GetPageSize())
}

// Get godoc
// @Summary Get exercise detail
// @Tags exercises
// @Produce json
// @Security BearerAuth
// @Param id path string true "Exercise ID"
// @Success 200 {object} response.Response{data=dto.ExerciseResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /exercises/{id} [get]
func (h *ExerciseHandler) Get(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid exercise id")
		return
	}

	item, err := h.exerciseService.GetByID(id, userID)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, item)
}

// Create godoc
// @Summary Create custom exercise
// @Tags exercises
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body dto.CreateExerciseRequest true "Create exercise request"
// @Success 200 {object} response.Response{data=dto.ExerciseResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /exercises [post]
func (h *ExerciseHandler) Create(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	var req dto.CreateExerciseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, err.Error())
		return
	}

	item, err := h.exerciseService.Create(userID, req)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, item)
}

// Update godoc
// @Summary Update custom exercise
// @Tags exercises
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Exercise ID"
// @Param request body dto.UpdateExerciseRequest true "Update exercise request"
// @Success 200 {object} response.Response{data=dto.ExerciseResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 403 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /exercises/{id} [put]
func (h *ExerciseHandler) Update(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid exercise id")
		return
	}

	var req dto.UpdateExerciseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, err.Error())
		return
	}

	item, err := h.exerciseService.Update(id, userID, req)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, item)
}

// Delete godoc
// @Summary Archive custom exercise
// @Tags exercises
// @Produce json
// @Security BearerAuth
// @Param id path string true "Exercise ID"
// @Success 200 {object} response.Response
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 403 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /exercises/{id} [delete]
func (h *ExerciseHandler) Delete(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid exercise id")
		return
	}

	if err := h.exerciseService.Delete(id, userID); err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, nil)
}
