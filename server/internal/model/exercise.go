package model

import (
	"time"

	"github.com/google/uuid"

	"wsTrack/server/internal/enum"
)

type Exercise struct {
	ID               uuid.UUID  `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	UserID           *uuid.UUID `gorm:"type:uuid;index"`
	User             *User      `gorm:"foreignKey:UserID"`
	Name             string     `gorm:"not null"`
	NameEn           *string
	Category         enum.ExerciseCategory `gorm:"type:varchar(32);not null"`
	PrimaryMuscles   StringArray           `gorm:"type:text[];not null"`
	SecondaryMuscles StringArray           `gorm:"type:text[]"`
	Equipment        enum.Equipment        `gorm:"type:varchar(32);not null"`
	TrackingType     enum.TrackingType     `gorm:"type:varchar(32);not null"`
	UnitPreference   *enum.WeightUnit      `gorm:"type:varchar(8)"`
	IsCustom         bool                  `gorm:"default:false"`
	IsArchived       bool                  `gorm:"default:false"`
	Notes            *string
	SortOrder        int `gorm:"default:0"`
	CreatedAt        time.Time
	UpdatedAt        time.Time
}
