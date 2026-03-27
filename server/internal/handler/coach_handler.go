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

type CoachHandler struct {
	coachService *service.CoachService
}

func NewCoachHandler(coachService *service.CoachService) *CoachHandler {
	return &CoachHandler{coachService: coachService}
}

// Invite godoc
// @Summary Invite a client by email
// @Tags coach
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param request body dto.InviteClientRequest true "Invite client request"
// @Success 200 {object} response.Response{data=dto.CoachInvitationResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 403 {object} response.Response
// @Failure 409 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /coach/invite [post]
func (h *CoachHandler) Invite(c *gin.Context) {
	coachID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	var req dto.InviteClientRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, err.Error())
		return
	}

	item, err := h.coachService.Invite(coachID, req)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, item)
}

// ListClients godoc
// @Summary List coach clients
// @Tags coach
// @Produce json
// @Security BearerAuth
// @Success 200 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 403 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /coach/clients [get]
func (h *CoachHandler) ListClients(c *gin.Context) {
	coachID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	items, err := h.coachService.ListClients(coachID)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, items)
}

// GetClientDetail godoc
// @Summary Get coach client detail
// @Tags coach
// @Produce json
// @Security BearerAuth
// @Param clientId path string true "Client ID"
// @Success 200 {object} response.Response{data=dto.CoachClientDetailResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 403 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /coach/clients/{clientId} [get]
func (h *CoachHandler) GetClientDetail(c *gin.Context) {
	coachID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	clientID, ok := middleware.GetCoachClientID(c)
	if !ok {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid client context")
		return
	}

	item, err := h.coachService.GetClientDetail(coachID, clientID)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, item)
}

// ListClientWorkouts godoc
// @Summary List coach client workouts
// @Tags coach
// @Produce json
// @Security BearerAuth
// @Param clientId path string true "Client ID"
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
// @Failure 403 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /coach/clients/{clientId}/workouts [get]
func (h *CoachHandler) ListClientWorkouts(c *gin.Context) {
	coachID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	clientID, ok := middleware.GetCoachClientID(c)
	if !ok {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid client context")
		return
	}

	var filter dto.WorkoutFilter
	if err := c.ShouldBindQuery(&filter); err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, err.Error())
		return
	}

	items, total, err := h.coachService.ListClientWorkouts(coachID, clientID, filter)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.PagedSuccess(c, items, total, filter.PageQuery.GetPage(), filter.PageQuery.GetPageSize())
}

// PushPlan godoc
// @Summary Push plan to client
// @Tags coach
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param clientId path string true "Client ID"
// @Param request body dto.PushPlanRequest true "Push plan request"
// @Success 200 {object} response.Response{data=dto.PlanDetailResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 403 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /coach/clients/{clientId}/plans [post]
func (h *CoachHandler) PushPlan(c *gin.Context) {
	coachID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	clientID, ok := middleware.GetCoachClientID(c)
	if !ok {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid client context")
		return
	}

	var req dto.PushPlanRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, err.Error())
		return
	}

	item, err := h.coachService.PushPlan(coachID, clientID, req)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, item)
}

// AddWorkoutComment godoc
// @Summary Add coach comment to workout
// @Tags coach
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param workoutId path string true "Workout ID"
// @Param request body dto.WorkoutCommentRequest true "Workout comment request"
// @Success 200 {object} response.Response{data=dto.WorkoutCommentResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 403 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /coach/workouts/{workoutId}/comment [post]
func (h *CoachHandler) AddWorkoutComment(c *gin.Context) {
	coachID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	workoutID, err := uuid.Parse(c.Param("workoutId"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid workout id")
		return
	}

	var req dto.WorkoutCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, err.Error())
		return
	}

	item, err := h.coachService.AddWorkoutComment(coachID, workoutID, req)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, item)
}

// Dashboard godoc
// @Summary Get coach dashboard
// @Tags coach
// @Produce json
// @Security BearerAuth
// @Success 200 {object} response.Response{data=dto.CoachDashboardResponse}
// @Failure 401 {object} response.Response
// @Failure 403 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /coach/dashboard [get]
func (h *CoachHandler) Dashboard(c *gin.Context) {
	coachID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	item, err := h.coachService.GetDashboard(coachID)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, item)
}
