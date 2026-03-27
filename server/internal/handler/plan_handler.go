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

type PlanHandler struct {
	planService *service.PlanService
}

func NewPlanHandler(planService *service.PlanService) *PlanHandler {
	return &PlanHandler{planService: planService}
}

// List godoc
// @Summary List plans
// @Tags plans
// @Produce json
// @Security BearerAuth
// @Success 200 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /plans [get]
func (h *PlanHandler) List(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	plans, err := h.planService.List(userID)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, plans)
}

// Get godoc
// @Summary Get plan detail
// @Tags plans
// @Produce json
// @Security BearerAuth
// @Param id path string true "Plan ID"
// @Success 200 {object} response.Response{data=dto.PlanDetailResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /plans/{id} [get]
func (h *PlanHandler) Get(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid plan id")
		return
	}

	plan, err := h.planService.GetByID(id, userID)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, plan)
}

// Create godoc
// @Summary Create plan
// @Tags plans
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body dto.CreatePlanRequest true "Create plan request"
// @Success 200 {object} response.Response{data=dto.PlanDetailResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /plans [post]
func (h *PlanHandler) Create(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	var req dto.CreatePlanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, err.Error())
		return
	}

	plan, err := h.planService.Create(userID, req)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, plan)
}

// Update godoc
// @Summary Update plan
// @Tags plans
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Plan ID"
// @Param request body dto.UpdatePlanRequest true "Update plan request"
// @Success 200 {object} response.Response{data=dto.PlanDetailResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /plans/{id} [put]
func (h *PlanHandler) Update(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid plan id")
		return
	}

	var req dto.UpdatePlanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, err.Error())
		return
	}

	plan, err := h.planService.Update(id, userID, req)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, plan)
}

// Delete godoc
// @Summary Delete plan
// @Tags plans
// @Produce json
// @Security BearerAuth
// @Param id path string true "Plan ID"
// @Success 200 {object} response.Response
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /plans/{id} [delete]
func (h *PlanHandler) Delete(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid plan id")
		return
	}

	if err := h.planService.Delete(id, userID); err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, nil)
}

// Duplicate godoc
// @Summary Duplicate plan
// @Tags plans
// @Produce json
// @Security BearerAuth
// @Param id path string true "Plan ID"
// @Success 200 {object} response.Response{data=dto.PlanDetailResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /plans/{id}/duplicate [post]
func (h *PlanHandler) Duplicate(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid plan id")
		return
	}

	plan, err := h.planService.Duplicate(id, userID)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, plan)
}

// Activate godoc
// @Summary Activate plan
// @Tags plans
// @Produce json
// @Security BearerAuth
// @Param id path string true "Plan ID"
// @Success 200 {object} response.Response{data=dto.PlanDetailResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /plans/{id}/activate [post]
func (h *PlanHandler) Activate(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid plan id")
		return
	}

	plan, err := h.planService.Activate(id, userID)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, plan)
}

// AddDay godoc
// @Summary Add plan day
// @Tags plans
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param id path string true "Plan ID"
// @Param request body dto.AddPlanDayRequest true "Add plan day request"
// @Success 200 {object} response.Response{data=dto.PlanDayResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /plans/{id}/days [post]
func (h *PlanHandler) AddDay(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	planID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid plan id")
		return
	}

	var req dto.AddPlanDayRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, err.Error())
		return
	}

	day, err := h.planService.AddDay(planID, userID, req)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, day)
}

// UpdateDay godoc
// @Summary Update plan day
// @Tags plans
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param dayId path string true "Plan Day ID"
// @Param request body dto.AddPlanDayRequest true "Update plan day request"
// @Success 200 {object} response.Response{data=dto.PlanDayResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /plans/days/{dayId} [put]
func (h *PlanHandler) UpdateDay(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	dayID, err := uuid.Parse(c.Param("dayId"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid plan day id")
		return
	}

	var req dto.AddPlanDayRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, err.Error())
		return
	}

	day, err := h.planService.UpdateDay(dayID, userID, req)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, day)
}

// DeleteDay godoc
// @Summary Delete plan day
// @Tags plans
// @Produce json
// @Security BearerAuth
// @Param dayId path string true "Plan Day ID"
// @Success 200 {object} response.Response
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /plans/days/{dayId} [delete]
func (h *PlanHandler) DeleteDay(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	dayID, err := uuid.Parse(c.Param("dayId"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid plan day id")
		return
	}

	if err := h.planService.DeleteDay(dayID, userID); err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, nil)
}

// ReorderDays godoc
// @Summary Reorder plan days
// @Tags plans
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param dayId path string true "Any Plan Day ID in the target plan"
// @Param request body dto.ReorderRequest true "Reorder request"
// @Success 200 {object} response.Response
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /plans/days/{dayId}/reorder [put]
func (h *PlanHandler) ReorderDays(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	dayID, err := uuid.Parse(c.Param("dayId"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid plan day id")
		return
	}

	var req dto.ReorderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, err.Error())
		return
	}

	if err := h.planService.ReorderDays(dayID, userID, req.OrderedIDs); err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, nil)
}

// AddExercise godoc
// @Summary Add exercise to plan day
// @Tags plans
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param dayId path string true "Plan Day ID"
// @Param request body dto.AddPlanExerciseRequest true "Add plan exercise request"
// @Success 200 {object} response.Response{data=dto.PlanExerciseResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /plans/days/{dayId}/exercises [post]
func (h *PlanHandler) AddExercise(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	dayID, err := uuid.Parse(c.Param("dayId"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid plan day id")
		return
	}

	var req dto.AddPlanExerciseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, err.Error())
		return
	}

	planExercise, err := h.planService.AddExercise(dayID, userID, req)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, planExercise)
}

// UpdateExercise godoc
// @Summary Update plan exercise
// @Tags plans
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param exerciseId path string true "Plan Exercise ID"
// @Param request body dto.AddPlanExerciseRequest true "Update plan exercise request"
// @Success 200 {object} response.Response{data=dto.PlanExerciseResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /plans/exercises/{exerciseId} [put]
func (h *PlanHandler) UpdateExercise(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	exerciseID, err := uuid.Parse(c.Param("exerciseId"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid plan exercise id")
		return
	}

	var req dto.AddPlanExerciseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, err.Error())
		return
	}

	planExercise, err := h.planService.UpdateExercise(exerciseID, userID, req)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, planExercise)
}

// DeleteExercise godoc
// @Summary Delete plan exercise
// @Tags plans
// @Produce json
// @Security BearerAuth
// @Param exerciseId path string true "Plan Exercise ID"
// @Success 200 {object} response.Response
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /plans/exercises/{exerciseId} [delete]
func (h *PlanHandler) DeleteExercise(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	exerciseID, err := uuid.Parse(c.Param("exerciseId"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid plan exercise id")
		return
	}

	if err := h.planService.DeleteExercise(exerciseID, userID); err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, nil)
}

// ReorderExercises godoc
// @Summary Reorder plan exercises within a day
// @Tags plans
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param dayId path string true "Plan Day ID"
// @Param request body dto.ReorderRequest true "Reorder request"
// @Success 200 {object} response.Response
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /plans/days/{dayId}/exercises/reorder [put]
func (h *PlanHandler) ReorderExercises(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	dayID, err := uuid.Parse(c.Param("dayId"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid plan day id")
		return
	}

	var req dto.ReorderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, err.Error())
		return
	}

	if err := h.planService.ReorderExercises(dayID, userID, req.OrderedIDs); err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, nil)
}
