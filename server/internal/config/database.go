package config

import (
	"database/sql"
	"fmt"
	"time"

	"go.uber.org/zap"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"wsTrack/server/internal/model"
)

func NewDatabase(cfg *Config, logger *zap.Logger) (*gorm.DB, error) {
	dsn := fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		cfg.Database.Host,
		cfg.Database.Port,
		cfg.Database.User,
		cfg.Database.Password,
		cfg.Database.DBName,
		cfg.Database.SSLMode,
	)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("get sql db: %w", err)
	}

	configurePool(sqlDB)

	if err := ensureExtensions(db); err != nil {
		return nil, err
	}

	if err := AutoMigrate(db); err != nil {
		return nil, err
	}

	if err := ensureIndexes(db); err != nil {
		return nil, err
	}

	if logger != nil {
		logger.Info("database initialized")
	}

	return db, nil
}

func AutoMigrate(db *gorm.DB) error {
	if err := db.AutoMigrate(
		&model.User{},
		&model.Exercise{},
		&model.Plan{},
		&model.PlanDay{},
		&model.PlanExercise{},
		&model.Workout{},
		&model.WorkoutExercise{},
		&model.WorkoutSet{},
		&model.PersonalRecord{},
		&model.Template{},
		&model.Challenge{},
		&model.CoachClient{},
		&model.WorkoutComment{},
		&model.CoachInvitation{},
	); err != nil {
		return fmt.Errorf("auto migrate: %w", err)
	}

	return nil
}

func configurePool(sqlDB *sql.DB) {
	sqlDB.SetMaxOpenConns(25)
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetConnMaxLifetime(30 * time.Minute)
}

func ensureExtensions(db *gorm.DB) error {
	if err := db.Exec(`CREATE EXTENSION IF NOT EXISTS pgcrypto`).Error; err != nil {
		return fmt.Errorf("ensure pgcrypto extension: %w", err)
	}

	return nil
}

func ensureIndexes(db *gorm.DB) error {
	indexes := []string{
		`CREATE INDEX IF NOT EXISTS idx_workouts_user_started_at ON workouts (user_id, started_at)`,
		`CREATE INDEX IF NOT EXISTS idx_workout_sets_exercise_completed_warmup ON workout_sets (workout_exercise_id, is_completed, is_warmup)`,
		`CREATE INDEX IF NOT EXISTS idx_exercises_user_archived ON exercises (user_id, is_archived)`,
		`CREATE INDEX IF NOT EXISTS idx_coach_clients_coach_status ON coach_clients (coach_id, status)`,
		`CREATE INDEX IF NOT EXISTS idx_coach_invitations_email_status ON coach_invitations (client_email, status)`,
		`CREATE INDEX IF NOT EXISTS idx_workout_comments_workout_coach ON workout_comments (workout_id, coach_id)`,
	}

	for _, stmt := range indexes {
		if err := db.Exec(stmt).Error; err != nil {
			return fmt.Errorf("ensure index: %w", err)
		}
	}

	return nil
}
