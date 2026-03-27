package model

import (
	"time"

	"github.com/google/uuid"
)

type WorkoutExercise struct {
	ID         uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	WorkoutID  uuid.UUID `gorm:"type:uuid;not null;index;uniqueIndex:idx_workout_exercises_workout_client"`
	Workout    Workout   `gorm:"foreignKey:WorkoutID"`
	ClientID   string    `gorm:"size:64;not null;uniqueIndex:idx_workout_exercises_workout_client"`
	ExerciseID uuid.UUID `gorm:"type:uuid;not null;index"`
	Exercise   Exercise  `gorm:"foreignKey:ExerciseID"`
	SortOrder  int       `gorm:"default:0"`
	Volume     float64   `gorm:"default:0"`
	Notes      *string
	CreatedAt  time.Time
	UpdatedAt  time.Time
	Sets       []WorkoutSet `gorm:"foreignKey:WorkoutExerciseID;constraint:OnDelete:CASCADE"`
}
