package repository

import (
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"wsTrack/server/internal/model"
)

type ExerciseSetHistory struct {
	SetID      uuid.UUID `gorm:"column:set_id"`
	WorkoutID  uuid.UUID `gorm:"column:workout_id"`
	AchievedAt time.Time `gorm:"column:achieved_at"`
	Weight     *float64  `gorm:"column:weight"`
	Reps       *int      `gorm:"column:reps"`
	Unit       string    `gorm:"column:unit"`
}

type PersonalRecordRepository interface {
	List(userID uuid.UUID, exerciseID *uuid.UUID) ([]model.PersonalRecord, error)
	ListSetHistory(userID, exerciseID uuid.UUID) ([]ExerciseSetHistory, error)
	ReplaceByExercise(userID, exerciseID uuid.UUID, records []model.PersonalRecord) error
}

type GormPersonalRecordRepository struct {
	db *gorm.DB
}

func NewPersonalRecordRepository(db *gorm.DB) PersonalRecordRepository {
	return &GormPersonalRecordRepository{db: db}
}

func (r *GormPersonalRecordRepository) List(userID uuid.UUID, exerciseID *uuid.UUID) ([]model.PersonalRecord, error) {
	query := r.db.
		Preload("Exercise").
		Where("user_id = ?", userID)
	if exerciseID != nil {
		query = query.Where("exercise_id = ?", *exerciseID)
	}

	var records []model.PersonalRecord
	if err := query.Order("achieved_at DESC").Order("created_at DESC").Find(&records).Error; err != nil {
		return nil, fmt.Errorf("list personal records: %w", err)
	}

	return records, nil
}

func (r *GormPersonalRecordRepository) ListSetHistory(userID, exerciseID uuid.UUID) ([]ExerciseSetHistory, error) {
	var items []ExerciseSetHistory
	err := r.db.Raw(`
		SELECT ws.id AS set_id,
		       w.id AS workout_id,
		       COALESCE(ws.completed_at, w.started_at) AS achieved_at,
		       ws.weight,
		       ws.reps,
		       ws.unit
		FROM workout_sets ws
		JOIN workout_exercises we ON we.id = ws.workout_exercise_id
		JOIN workouts w ON w.id = we.workout_id
		WHERE w.user_id = ?
		  AND we.exercise_id = ?
		  AND ws.is_completed = TRUE
		  AND ws.is_warmup = FALSE
		ORDER BY w.started_at ASC, ws.completed_at ASC NULLS LAST, ws.set_number ASC, ws.created_at ASC`,
		userID, exerciseID,
	).Scan(&items).Error
	if err != nil {
		return nil, fmt.Errorf("list set history: %w", err)
	}

	return items, nil
}

func (r *GormPersonalRecordRepository) ReplaceByExercise(userID, exerciseID uuid.UUID, records []model.PersonalRecord) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("user_id = ? AND exercise_id = ?", userID, exerciseID).
			Delete(&model.PersonalRecord{}).Error; err != nil {
			return fmt.Errorf("delete personal records: %w", err)
		}

		if err := tx.Exec(`
			UPDATE workout_sets ws
			SET is_pr = FALSE
			FROM workout_exercises we, workouts w
			WHERE ws.workout_exercise_id = we.id
			  AND we.workout_id = w.id
			  AND w.user_id = ?
			  AND we.exercise_id = ?`,
			userID, exerciseID,
		).Error; err != nil {
			return fmt.Errorf("reset workout set pr flags: %w", err)
		}

		if len(records) == 0 {
			return nil
		}

		if err := tx.Create(&records).Error; err != nil {
			return fmt.Errorf("create personal records: %w", err)
		}

		setIDs := make([]uuid.UUID, 0, len(records))
		seen := make(map[uuid.UUID]struct{}, len(records))
		for _, record := range records {
			if record.WorkoutSetID == nil {
				continue
			}
			if _, ok := seen[*record.WorkoutSetID]; ok {
				continue
			}
			seen[*record.WorkoutSetID] = struct{}{}
			setIDs = append(setIDs, *record.WorkoutSetID)
		}

		if len(setIDs) > 0 {
			result := tx.Model(&model.WorkoutSet{}).
				Where("id IN ?", setIDs).
				Update("is_pr", true)
			if result.Error != nil {
				return fmt.Errorf("mark workout sets as pr: %w", result.Error)
			}
		}

		return nil
	})
}
