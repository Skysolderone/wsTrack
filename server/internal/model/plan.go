package model

import (
	"time"

	"github.com/google/uuid"

	"wsTrack/server/internal/enum"
)

type Plan struct {
	ID          uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	UserID      uuid.UUID `gorm:"type:uuid;index;not null"`
	User        User      `gorm:"foreignKey:UserID"`
	Name        string    `gorm:"size:100;not null"`
	Description *string
	Goal        *enum.PlanGoal `gorm:"type:varchar(32)"`
	IsActive    bool           `gorm:"default:false"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
	Days        []PlanDay `gorm:"foreignKey:PlanID;constraint:OnDelete:CASCADE"`
}
