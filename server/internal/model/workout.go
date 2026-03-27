package model

import (
	"time"

	"github.com/google/uuid"
)

type Workout struct {
	ID              uuid.UUID  `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	UserID          uuid.UUID  `gorm:"type:uuid;not null;index;uniqueIndex:idx_workouts_user_client"`
	User            User       `gorm:"foreignKey:UserID"`
	PlanDayID       *uuid.UUID `gorm:"type:uuid;index"`
	PlanDay         *PlanDay   `gorm:"foreignKey:PlanDayID"`
	ClientID        string     `gorm:"size:64;not null;uniqueIndex:idx_workouts_user_client"`
	StartedAt       time.Time  `gorm:"not null;index"`
	FinishedAt      *time.Time
	DurationSeconds int     `gorm:"default:0"`
	TotalVolume     float64 `gorm:"default:0"`
	TotalSets       int     `gorm:"default:0"`
	Rating          *int
	Notes           *string
	CreatedAt       time.Time
	UpdatedAt       time.Time
	Exercises       []WorkoutExercise `gorm:"foreignKey:WorkoutID;constraint:OnDelete:CASCADE"`
}
