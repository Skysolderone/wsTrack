package model

import (
	"time"

	"github.com/google/uuid"

	"wsTrack/server/internal/enum"
)

type WorkoutSet struct {
	ID                uuid.UUID       `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	WorkoutExerciseID uuid.UUID       `gorm:"type:uuid;not null;index;uniqueIndex:idx_workout_sets_exercise_client"`
	WorkoutExercise   WorkoutExercise `gorm:"foreignKey:WorkoutExerciseID"`
	ClientID          string          `gorm:"size:64;not null;uniqueIndex:idx_workout_sets_exercise_client"`
	SetNumber         int             `gorm:"not null"`
	Weight            *float64
	Reps              *int
	DurationSeconds   *int
	Distance          *float64
	RPE               *float64 `gorm:"column:rpe"`
	IsWarmup          bool     `gorm:"default:false"`
	IsCompleted       bool     `gorm:"default:true"`
	RestSeconds       *int
	IsPR              bool            `gorm:"default:false"`
	Unit              enum.WeightUnit `gorm:"type:varchar(8);default:'kg'"`
	CompletedAt       *time.Time
	CreatedAt         time.Time
	UpdatedAt         time.Time
}
