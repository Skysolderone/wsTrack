package model

import (
	"time"

	"github.com/google/uuid"
)

type PlanExercise struct {
	ID            uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	PlanDayID     uuid.UUID `gorm:"type:uuid;index;not null"`
	PlanDay       PlanDay   `gorm:"foreignKey:PlanDayID"`
	ExerciseID    uuid.UUID `gorm:"type:uuid;index;not null"`
	Exercise      Exercise  `gorm:"foreignKey:ExerciseID"`
	TargetSets    int       `gorm:"not null"`
	TargetReps    *string   `gorm:"size:20"`
	TargetWeight  *float64
	RestSeconds   *int
	SupersetGroup *int
	SortOrder     int `gorm:"default:0"`
	Notes         *string
	CreatedAt     time.Time
	UpdatedAt     time.Time
}
