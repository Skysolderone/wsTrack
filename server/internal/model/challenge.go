package model

import (
	"time"

	"github.com/google/uuid"
)

type Challenge struct {
	ID           uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	UserID       uuid.UUID `gorm:"type:uuid;index;not null"`
	User         User      `gorm:"foreignKey:UserID"`
	Type         string    `gorm:"not null"`
	TargetValue  float64   `gorm:"not null"`
	CurrentValue float64   `gorm:"default:0"`
	StartDate    time.Time `gorm:"not null"`
	EndDate      time.Time `gorm:"not null"`
	IsCompleted  bool      `gorm:"default:false"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
}
