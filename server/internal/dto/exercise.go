package dto

import (
	"time"

	"github.com/google/uuid"

	"wsTrack/server/pkg/pagination"
)

type CreateExerciseRequest struct {
	Name             string   `json:"name" binding:"required,min=1,max=100"`
	NameEn           *string  `json:"name_en" binding:"omitempty,max=100"`
	Category         string   `json:"category" binding:"required,oneof=strength cardio bodyweight stretch"`
	PrimaryMuscles   []string `json:"primary_muscles" binding:"required,min=1,dive,oneof=chest back shoulders biceps triceps forearms abs glutes quads hamstrings calves full_body"`
	SecondaryMuscles []string `json:"secondary_muscles" binding:"omitempty,dive,oneof=chest back shoulders biceps triceps forearms abs glutes quads hamstrings calves full_body"`
	Equipment        string   `json:"equipment" binding:"required,oneof=barbell dumbbell machine cable bodyweight band kettlebell ez_bar smith_machine other"`
	TrackingType     string   `json:"tracking_type" binding:"required,oneof=weight_reps time distance reps_only"`
	Notes            *string  `json:"notes" binding:"omitempty,max=500"`
}

type UpdateExerciseRequest struct {
	Name             *string  `json:"name" binding:"omitempty,min=1,max=100"`
	NameEn           *string  `json:"name_en" binding:"omitempty,max=100"`
	Category         *string  `json:"category" binding:"omitempty,oneof=strength cardio bodyweight stretch"`
	PrimaryMuscles   []string `json:"primary_muscles" binding:"omitempty,min=1"`
	SecondaryMuscles []string `json:"secondary_muscles"`
	Equipment        *string  `json:"equipment" binding:"omitempty"`
	TrackingType     *string  `json:"tracking_type" binding:"omitempty"`
	Notes            *string  `json:"notes" binding:"omitempty,max=500"`
}

type ExerciseFilter struct {
	Category  *string `form:"category"`
	Muscle    *string `form:"muscle"`
	Equipment *string `form:"equipment"`
	Search    *string `form:"search"`
	IsCustom  *bool   `form:"is_custom"`
	pagination.PageQuery
}

type ExerciseResponse struct {
	ID               uuid.UUID `json:"id"`
	Name             string    `json:"name"`
	NameEn           *string   `json:"name_en,omitempty"`
	Category         string    `json:"category"`
	PrimaryMuscles   []string  `json:"primary_muscles"`
	SecondaryMuscles []string  `json:"secondary_muscles,omitempty"`
	Equipment        string    `json:"equipment"`
	TrackingType     string    `json:"tracking_type"`
	IsCustom         bool      `json:"is_custom"`
	Notes            *string   `json:"notes,omitempty"`
	CreatedAt        time.Time `json:"created_at"`
}
