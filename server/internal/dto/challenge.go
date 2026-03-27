package dto

import (
	"time"

	"github.com/google/uuid"
)

type ChallengeFilter struct {
	Status string `form:"status" binding:"omitempty,oneof=active completed"`
}

type CreateChallengeRequest struct {
	Type        string    `json:"type" binding:"required,oneof=volume frequency cardio_duration"`
	TargetValue float64   `json:"target_value" binding:"required,gt=0"`
	StartDate   time.Time `json:"start_date" binding:"required"`
	EndDate     time.Time `json:"end_date" binding:"required"`
}

type UpdateChallengeRequest struct {
	Type        *string    `json:"type" binding:"omitempty,oneof=volume frequency cardio_duration"`
	TargetValue *float64   `json:"target_value" binding:"omitempty,gt=0"`
	StartDate   *time.Time `json:"start_date"`
	EndDate     *time.Time `json:"end_date"`
}

type ChallengeResponse struct {
	ID           uuid.UUID `json:"id"`
	Type         string    `json:"type"`
	TargetValue  float64   `json:"target_value"`
	CurrentValue float64   `json:"current_value"`
	StartDate    time.Time `json:"start_date"`
	EndDate      time.Time `json:"end_date"`
	IsCompleted  bool      `json:"is_completed"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}
