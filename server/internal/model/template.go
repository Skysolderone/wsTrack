package model

import (
	"time"

	"github.com/google/uuid"

	"wsTrack/server/internal/enum"
)

type Template struct {
	ID          uuid.UUID  `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	UserID      *uuid.UUID `gorm:"type:uuid;index"`
	User        *User      `gorm:"foreignKey:UserID"`
	Name        string     `gorm:"size:100;not null"`
	Description *string
	Goal        *enum.PlanGoal `gorm:"type:varchar(32)"`
	IsBuiltIn   bool           `gorm:"default:false"`
	Snapshot    JSON           `gorm:"type:jsonb;not null"`
	CreatedAt   time.Time
}
