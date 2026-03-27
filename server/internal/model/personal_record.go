package model

import (
	"time"

	"github.com/google/uuid"
)

type PersonalRecord struct {
	ID           uuid.UUID   `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	UserID       uuid.UUID   `gorm:"type:uuid;index;not null"`
	User         User        `gorm:"foreignKey:UserID"`
	ExerciseID   uuid.UUID   `gorm:"type:uuid;index;not null"`
	Exercise     Exercise    `gorm:"foreignKey:ExerciseID"`
	WorkoutID    *uuid.UUID  `gorm:"type:uuid;index"`
	Workout      *Workout    `gorm:"foreignKey:WorkoutID"`
	WorkoutSetID *uuid.UUID  `gorm:"type:uuid;index"`
	WorkoutSet   *WorkoutSet `gorm:"foreignKey:WorkoutSetID"`
	PRType       string      `gorm:"size:50;not null"`
	Value        float64     `gorm:"not null"`
	Unit         string      `gorm:"size:20;not null"`
	AchievedAt   time.Time   `gorm:"not null;index"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
}
