package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"wsTrack/server/internal/dto"
	apperrors "wsTrack/server/internal/errors"
	"wsTrack/server/internal/middleware"
	"wsTrack/server/internal/service"
	"wsTrack/server/pkg/response"
)

type StatsHandler struct {
	statsService *service.StatsService
}

func NewStatsHandler(statsService *service.StatsService) *StatsHandler {
	return &StatsHandler{statsService: statsService}
}

// Dashboard godoc
// @Summary Get dashboard stats
// @Tags stats
// @Produce json
// @Security BearerAuth
// @Success 200 {object} response.Response{data=dto.DashboardResponse}
// @Failure 401 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /stats/dashboard [get]
func (h *StatsHandler) Dashboard(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	item, err := h.statsService.GetDashboard(userID)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, item)
}

// Volume godoc
// @Summary Get volume history
// @Tags stats
// @Produce json
// @Security BearerAuth
// @Param period query string true "daily / weekly / monthly"
// @Param date_from query string true "RFC3339 datetime"
// @Param date_to query string true "RFC3339 datetime"
// @Param muscle query string false "Muscle group"
// @Success 200 {object} response.Response
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /stats/volume [get]
func (h *StatsHandler) Volume(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	var req dto.VolumeStatsRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, err.Error())
		return
	}

	item, err := h.statsService.GetVolumeHistory(userID, req)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, item)
}

// Muscles godoc
// @Summary Get muscle distribution
// @Tags stats
// @Produce json
// @Security BearerAuth
// @Param date_from query string true "RFC3339 datetime"
// @Param date_to query string true "RFC3339 datetime"
// @Success 200 {object} response.Response
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /stats/muscles [get]
func (h *StatsHandler) Muscles(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	dateFrom, err := time.Parse(time.RFC3339, c.Query("date_from"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid date_from")
		return
	}
	dateTo, err := time.Parse(time.RFC3339, c.Query("date_to"))
	if err != nil {
		response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid date_to")
		return
	}

	item, err := h.statsService.GetMuscleDistribution(userID, dateFrom, dateTo)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, item)
}

// PRs godoc
// @Summary Get PR history
// @Tags stats
// @Produce json
// @Security BearerAuth
// @Param limit query int false "Limit"
// @Success 200 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /stats/prs [get]
func (h *StatsHandler) PRs(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	limit := 20
	if rawLimit := c.Query("limit"); rawLimit != "" {
		parsed, err := strconv.Atoi(rawLimit)
		if err != nil || parsed <= 0 {
			response.Error(c, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid limit")
			return
		}
		limit = parsed
	}

	item, err := h.statsService.GetPRHistory(userID, limit)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, item)
}

// Frequency godoc
// @Summary Get workout frequency stats
// @Tags stats
// @Produce json
// @Security BearerAuth
// @Success 200 {object} response.Response{data=dto.FrequencyStats}
// @Failure 401 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /stats/frequency [get]
func (h *StatsHandler) Frequency(c *gin.Context) {
	userID, ok := middleware.GetUserID(c)
	if !ok {
		response.Error(c, http.StatusUnauthorized, apperrors.CodeUnauthorized, "invalid auth context")
		return
	}

	item, err := h.statsService.GetFrequencyStats(userID)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, item)
}

// Exercise godoc
// @Summary Get exercise analytics
// @Tags stats
// @Produce json
// @Security BearerAuth
// @Param exerciseId path string true "Exercise ID"
// @Success 200 {object} response.Response{data=dto.ExerciseStatsResponse}
// @Failure 400 {object} response.Response
// @Failure 401 {object} response.Response
// @Failure 404 {object} response.Response
// @Failure 500 {object} response.Response
// @Router /stats/exercise/{exerciseId} [get]
func (h *StatsHandler) Exercise(c *gin.Context) {
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

	item, err := h.statsService.GetExerciseStats(userID, exerciseID)
	if err != nil {
		writeAppError(c, err)
		return
	}

	response.Success(c, item)
}
