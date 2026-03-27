package dto

import (
	"time"

	"github.com/google/uuid"
)

type VolumeStatsRequest struct {
	Period   string    `form:"period" binding:"required,oneof=daily weekly monthly"`
	DateFrom time.Time `form:"date_from" binding:"required"`
	DateTo   time.Time `form:"date_to" binding:"required"`
	Muscle   *string   `form:"muscle"`
}

type VolumeDataPoint struct {
	Date   string  `json:"date"`
	Volume float64 `json:"volume"`
}

type MuscleVolumeData struct {
	Muscle string  `json:"muscle"`
	Volume float64 `json:"volume"`
	Sets   int     `json:"sets"`
}

type PRRecord struct {
	ID           uuid.UUID `json:"id"`
	ExerciseName string    `json:"exercise_name"`
	PRType       string    `json:"pr_type"`
	Value        float64   `json:"value"`
	Unit         string    `json:"unit"`
	AchievedAt   time.Time `json:"achieved_at"`
}

type FrequencyStats struct {
	WeeklyAvg     float64        `json:"weekly_avg"`
	CurrentStreak int            `json:"current_streak"`
	LongestStreak int            `json:"longest_streak"`
	ByDayOfWeek   map[string]int `json:"by_day_of_week"`
	ByTimeOfDay   map[string]int `json:"by_time_of_day"`
}

type ExerciseStatsResponse struct {
	ExerciseID       uuid.UUID         `json:"exercise_id"`
	ExerciseName     string            `json:"exercise_name"`
	TotalSessions    int               `json:"total_sessions"`
	VolumeHistory    []VolumeDataPoint `json:"volume_history"`
	MaxWeightHistory []VolumeDataPoint `json:"max_weight_history"`
	Estimated1RM     *float64          `json:"estimated_1rm,omitempty"`
	PersonalRecords  []PRRecord        `json:"personal_records"`
}

type DashboardResponse struct {
	WeeklyWorkouts      int                `json:"weekly_workouts"`
	WeeklyVolume        float64            `json:"weekly_volume"`
	LastWeekVolume      float64            `json:"last_week_volume"`
	VolumeChangePercent float64            `json:"volume_change_percent"`
	CurrentStreak       int                `json:"current_streak"`
	RecentPRs           []PRRecord         `json:"recent_prs"`
	MuscleDistribution  []MuscleVolumeData `json:"muscle_distribution"`
}
