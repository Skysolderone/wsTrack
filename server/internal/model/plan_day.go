package model

import (
	"time"

	"github.com/google/uuid"
)

type PlanDay struct {
	ID        uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	PlanID    uuid.UUID `gorm:"type:uuid;index;not null"`
	Plan      Plan      `gorm:"foreignKey:PlanID"`
	Name      string    `gorm:"size:50;not null"`
	SortOrder int       `gorm:"default:0"`
	CreatedAt time.Time
	UpdatedAt time.Time
	Exercises []PlanExercise `gorm:"foreignKey:PlanDayID;constraint:OnDelete:CASCADE"`
}
