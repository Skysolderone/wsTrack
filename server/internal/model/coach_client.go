package model

import (
	"time"

	"github.com/google/uuid"
)

type CoachClient struct {
	ID        uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	CoachID   uuid.UUID `gorm:"type:uuid;index;not null;uniqueIndex:idx_coach_client_pair"`
	ClientID  uuid.UUID `gorm:"type:uuid;index;not null;uniqueIndex:idx_coach_client_pair"`
	Status    string    `gorm:"default:'active'"`
	Notes     *string
	CreatedAt time.Time
	UpdatedAt time.Time
	Coach     User `gorm:"foreignKey:CoachID"`
	Client    User `gorm:"foreignKey:ClientID"`
}

type WorkoutComment struct {
	ID        uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	CoachID   uuid.UUID `gorm:"type:uuid;index;not null"`
	WorkoutID uuid.UUID `gorm:"type:uuid;index;not null"`
	Comment   string    `gorm:"not null"`
	CreatedAt time.Time
	Coach     User    `gorm:"foreignKey:CoachID"`
	Workout   Workout `gorm:"foreignKey:WorkoutID"`
}

type CoachInvitation struct {
	ID          uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	CoachID     uuid.UUID `gorm:"type:uuid;index;not null"`
	ClientEmail string    `gorm:"not null;index"`
	Status      string    `gorm:"default:'pending';index"`
	CreatedAt   time.Time
	ExpiresAt   time.Time
	Coach       User `gorm:"foreignKey:CoachID"`
}
