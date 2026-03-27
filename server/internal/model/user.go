package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"wsTrack/server/internal/enum"
)

type User struct {
	ID           uuid.UUID       `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`
	Email        string          `gorm:"uniqueIndex;not null"`
	PasswordHash string          `gorm:"not null"`
	Nickname     string          `gorm:"size:50"`
	WeightUnit   enum.WeightUnit `gorm:"type:varchar(8);default:'kg'"`
	Language     string          `gorm:"default:'zh'"`
	Role         string          `gorm:"default:'user'"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
	DeletedAt    gorm.DeletedAt `gorm:"index"`
}
