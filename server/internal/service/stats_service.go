package service

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"

	"wsTrack/server/internal/dto"
	apperrors "wsTrack/server/internal/errors"
	"wsTrack/server/internal/repository"
)

const dashboardCacheTTL = 5 * time.Minute

type StatsService struct {
	statsRepo   repository.StatsRepository
	redisClient *redis.Client
}

func NewStatsService(statsRepo repository.StatsRepository, redisClient *redis.Client) *StatsService {
	return &StatsService{
		statsRepo:   statsRepo,
		redisClient: redisClient,
	}
}

func (s *StatsService) GetVolumeHistory(userID uuid.UUID, req dto.VolumeStatsRequest) ([]dto.VolumeDataPoint, error) {
	if req.DateTo.Before(req.DateFrom) {
		return nil, apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "date_to must be after date_from")
	}
	if req.Muscle != nil && strings.TrimSpace(*req.Muscle) != "" {
		if _, err := parseMuscles([]string{strings.TrimSpace(*req.Muscle)}, true); err != nil {
			return nil, err
		}
	}

	data, err := s.statsRepo.GetVolumeHistory(userID, req)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to get volume history")
	}

	return data, nil
}

func (s *StatsService) GetMuscleDistribution(userID uuid.UUID, dateFrom, dateTo time.Time) ([]dto.MuscleVolumeData, error) {
	if dateTo.Before(dateFrom) {
		return nil, apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "date_to must be after date_from")
	}

	data, err := s.statsRepo.GetMuscleDistribution(userID, dateFrom, dateTo)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to get muscle distribution")
	}

	return data, nil
}

func (s *StatsService) GetPRHistory(userID uuid.UUID, limit int) ([]dto.PRRecord, error) {
	if limit <= 0 {
		limit = 20
	}

	data, err := s.statsRepo.GetPRHistory(userID, limit)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to get pr history")
	}

	return data, nil
}

func (s *StatsService) GetFrequencyStats(userID uuid.UUID) (*dto.FrequencyStats, error) {
	data, err := s.statsRepo.GetFrequencyStats(userID)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to get frequency stats")
	}

	return data, nil
}

func (s *StatsService) GetExerciseStats(userID, exerciseID uuid.UUID) (*dto.ExerciseStatsResponse, error) {
	data, err := s.statsRepo.GetExerciseHistory(userID, exerciseID, 30)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to get exercise stats")
	}
	if data == nil {
		return nil, apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "exercise not found")
	}

	return data, nil
}

func (s *StatsService) GetDashboard(userID uuid.UUID) (*dto.DashboardResponse, error) {
	if cached, ok := s.getCachedDashboard(userID); ok {
		return cached, nil
	}

	now := time.Now().UTC()
	currentWeekStart := startOfWeek(now)
	currentWeekEnd := currentWeekStart.AddDate(0, 0, 7)
	lastWeekStart := currentWeekStart.AddDate(0, 0, -7)

	dashboard, err := s.statsRepo.GetDashboardSummary(userID, currentWeekStart, currentWeekEnd, lastWeekStart)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to get dashboard")
	}

	frequency, err := s.statsRepo.GetFrequencyStats(userID)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to get dashboard frequency")
	}
	dashboard.CurrentStreak = frequency.CurrentStreak

	recentPRs, err := s.statsRepo.GetPRHistory(userID, 5)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to get recent prs")
	}
	dashboard.RecentPRs = recentPRs

	muscles, err := s.statsRepo.GetMuscleDistribution(userID, currentWeekStart, now)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to get dashboard muscle distribution")
	}
	dashboard.MuscleDistribution = muscles
	dashboard.VolumeChangePercent = calculateVolumeChange(dashboard.WeeklyVolume, dashboard.LastWeekVolume)

	s.cacheDashboard(userID, dashboard)
	return dashboard, nil
}

func dashboardCacheKey(userID uuid.UUID) string {
	return "stats:dashboard:" + userID.String()
}

func invalidateDashboardCache(redisClient *redis.Client, userID uuid.UUID) {
	if redisClient == nil {
		return
	}
	if err := redisClient.Del(context.Background(), dashboardCacheKey(userID)).Err(); err != nil {
		zap.L().Warn("invalidate dashboard cache failed", zap.Error(err), zap.String("user_id", userID.String()))
	}
}

func (s *StatsService) getCachedDashboard(userID uuid.UUID) (*dto.DashboardResponse, bool) {
	if s.redisClient == nil {
		return nil, false
	}

	payload, err := s.redisClient.Get(context.Background(), dashboardCacheKey(userID)).Result()
	if err != nil {
		return nil, false
	}

	var dashboard dto.DashboardResponse
	if err := json.Unmarshal([]byte(payload), &dashboard); err != nil {
		zap.L().Warn("unmarshal dashboard cache failed", zap.Error(err))
		return nil, false
	}

	return &dashboard, true
}

func (s *StatsService) cacheDashboard(userID uuid.UUID, dashboard *dto.DashboardResponse) {
	if s.redisClient == nil {
		return
	}

	payload, err := json.Marshal(dashboard)
	if err != nil {
		zap.L().Warn("marshal dashboard cache failed", zap.Error(err))
		return
	}

	if err := s.redisClient.Set(context.Background(), dashboardCacheKey(userID), payload, dashboardCacheTTL).Err(); err != nil {
		zap.L().Warn("cache dashboard failed", zap.Error(err), zap.String("user_id", userID.String()))
	}
}

func startOfWeek(t time.Time) time.Time {
	weekday := int(t.Weekday())
	if weekday == 0 {
		weekday = 7
	}

	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location()).AddDate(0, 0, -(weekday - 1))
}

func calculateVolumeChange(current, previous float64) float64 {
	if previous == 0 {
		if current == 0 {
			return 0
		}
		return 100
	}

	return (current - previous) / previous * 100
}
