package dto

import (
	"time"

	"github.com/google/uuid"
)

type CreatePlanRequest struct {
	Name        string  `json:"name" binding:"required,min=1,max=100"`
	Description *string `json:"description" binding:"omitempty,max=500"`
	Goal        *string `json:"goal" binding:"omitempty,oneof=hypertrophy strength endurance general"`
}

type UpdatePlanRequest struct {
	Name        *string `json:"name" binding:"omitempty,min=1,max=100"`
	Description *string `json:"description" binding:"omitempty,max=500"`
	Goal        *string `json:"goal" binding:"omitempty,oneof=hypertrophy strength endurance general"`
	IsActive    *bool   `json:"is_active"`
}

type AddPlanDayRequest struct {
	Name string `json:"name" binding:"required,min=1,max=50"`
}

type AddPlanExerciseRequest struct {
	ExerciseID    uuid.UUID `json:"exercise_id" binding:"required"`
	TargetSets    int       `json:"target_sets" binding:"required,min=1,max=20"`
	TargetReps    *string   `json:"target_reps" binding:"omitempty,max=20"`
	TargetWeight  *float64  `json:"target_weight" binding:"omitempty,min=0"`
	RestSeconds   *int      `json:"rest_seconds" binding:"omitempty,min=0,max=600"`
	SupersetGroup *int      `json:"superset_group"`
	Notes         *string   `json:"notes" binding:"omitempty,max=500"`
}

type ReorderRequest struct {
	OrderedIDs []uuid.UUID `json:"ordered_ids" binding:"required,min=1"`
}

type PlanDetailResponse struct {
	ID          uuid.UUID         `json:"id"`
	Name        string            `json:"name"`
	Description *string           `json:"description,omitempty"`
	Goal        *string           `json:"goal,omitempty"`
	IsActive    bool              `json:"is_active"`
	Days        []PlanDayResponse `json:"days"`
	CreatedAt   time.Time         `json:"created_at"`
	UpdatedAt   time.Time         `json:"updated_at"`
}

type PlanDayResponse struct {
	ID        uuid.UUID              `json:"id"`
	Name      string                 `json:"name"`
	SortOrder int                    `json:"sort_order"`
	Exercises []PlanExerciseResponse `json:"exercises"`
}

type PlanExerciseResponse struct {
	ID            uuid.UUID        `json:"id"`
	Exercise      ExerciseResponse `json:"exercise"`
	TargetSets    int              `json:"target_sets"`
	TargetReps    *string          `json:"target_reps,omitempty"`
	TargetWeight  *float64         `json:"target_weight,omitempty"`
	RestSeconds   *int             `json:"rest_seconds,omitempty"`
	SupersetGroup *int             `json:"superset_group,omitempty"`
	SortOrder     int              `json:"sort_order"`
	Notes         *string          `json:"notes,omitempty"`
}
