package dto

import (
	"time"

	"github.com/google/uuid"

	"wsTrack/server/pkg/pagination"
)

type SyncWorkoutRequest struct {
	Workouts []WorkoutFullData `json:"workouts" binding:"required,min=1,max=50"`
}

type WorkoutFullData struct {
	ClientID        string                `json:"client_id" binding:"required"`
	PlanDayID       *uuid.UUID            `json:"plan_day_id"`
	StartedAt       time.Time             `json:"started_at" binding:"required"`
	FinishedAt      *time.Time            `json:"finished_at"`
	DurationSeconds int                   `json:"duration_seconds" binding:"required,min=0"`
	TotalVolume     float64               `json:"total_volume"`
	TotalSets       int                   `json:"total_sets"`
	Rating          *int                  `json:"rating" binding:"omitempty,min=1,max=5"`
	Notes           *string               `json:"notes" binding:"omitempty,max=2000"`
	Exercises       []WorkoutExerciseData `json:"exercises" binding:"required,min=1"`
}

type WorkoutExerciseData struct {
	ClientID   string           `json:"client_id" binding:"required"`
	ExerciseID uuid.UUID        `json:"exercise_id" binding:"required"`
	SortOrder  int              `json:"sort_order"`
	Volume     float64          `json:"volume"`
	Notes      *string          `json:"notes"`
	Sets       []WorkoutSetData `json:"sets" binding:"required,min=1"`
}

type WorkoutSetData struct {
	ClientID        string     `json:"client_id" binding:"required"`
	SetNumber       int        `json:"set_number" binding:"required,min=1"`
	Weight          *float64   `json:"weight"`
	Reps            *int       `json:"reps"`
	DurationSeconds *int       `json:"duration_seconds"`
	Distance        *float64   `json:"distance"`
	RPE             *float64   `json:"rpe" binding:"omitempty,min=1,max=10"`
	IsWarmup        bool       `json:"is_warmup"`
	IsCompleted     bool       `json:"is_completed"`
	RestSeconds     *int       `json:"rest_seconds"`
	IsPR            bool       `json:"is_pr"`
	Unit            string     `json:"unit" binding:"required,oneof=kg lbs"`
	CompletedAt     *time.Time `json:"completed_at"`
}

type WorkoutFilter struct {
	DateFrom   *time.Time `form:"date_from"`
	DateTo     *time.Time `form:"date_to"`
	ExerciseID *uuid.UUID `form:"exercise_id"`
	pagination.PageQuery
}

type WorkoutListItem struct {
	ID              uuid.UUID `json:"id"`
	PlanDayName     *string   `json:"plan_day_name,omitempty"`
	StartedAt       time.Time `json:"started_at"`
	DurationSeconds int       `json:"duration_seconds"`
	TotalVolume     float64   `json:"total_volume"`
	TotalSets       int       `json:"total_sets"`
	ExerciseCount   int       `json:"exercise_count"`
	Rating          *int      `json:"rating,omitempty"`
}

type WorkoutDetailResponse struct {
	ID              uuid.UUID                 `json:"id"`
	PlanDayName     *string                   `json:"plan_day_name,omitempty"`
	StartedAt       time.Time                 `json:"started_at"`
	FinishedAt      *time.Time                `json:"finished_at,omitempty"`
	DurationSeconds int                       `json:"duration_seconds"`
	TotalVolume     float64                   `json:"total_volume"`
	TotalSets       int                       `json:"total_sets"`
	Rating          *int                      `json:"rating,omitempty"`
	Notes           *string                   `json:"notes,omitempty"`
	Exercises       []WorkoutExerciseResponse `json:"exercises"`
}

type WorkoutExerciseResponse struct {
	ID        uuid.UUID            `json:"id"`
	Exercise  ExerciseResponse     `json:"exercise"`
	SortOrder int                  `json:"sort_order"`
	Volume    float64              `json:"volume"`
	Notes     *string              `json:"notes,omitempty"`
	Sets      []WorkoutSetResponse `json:"sets"`
}

type WorkoutSetResponse struct {
	ID              uuid.UUID  `json:"id"`
	SetNumber       int        `json:"set_number"`
	Weight          *float64   `json:"weight,omitempty"`
	Reps            *int       `json:"reps,omitempty"`
	DurationSeconds *int       `json:"duration_seconds,omitempty"`
	Distance        *float64   `json:"distance,omitempty"`
	RPE             *float64   `json:"rpe,omitempty"`
	IsWarmup        bool       `json:"is_warmup"`
	IsCompleted     bool       `json:"is_completed"`
	RestSeconds     *int       `json:"rest_seconds,omitempty"`
	IsPR            bool       `json:"is_pr"`
	Unit            string     `json:"unit"`
	CompletedAt     *time.Time `json:"completed_at,omitempty"`
}

type UpdateWorkoutRequest struct {
	Rating *int    `json:"rating" binding:"omitempty,min=1,max=5"`
	Notes  *string `json:"notes" binding:"omitempty,max=2000"`
}

type SyncedWorkoutID struct {
	ClientID string    `json:"client_id"`
	ServerID uuid.UUID `json:"server_id"`
}

type SyncWorkoutResponse struct {
	SyncedIDs []SyncedWorkoutID `json:"synced_ids"`
}
