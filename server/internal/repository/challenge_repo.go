package repository

import (
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"wsTrack/server/internal/model"
)

type ChallengeRepository interface {
	List(userID uuid.UUID, status string) ([]model.Challenge, error)
	FindByID(id, userID uuid.UUID) (*model.Challenge, error)
	Create(challenge *model.Challenge) error
	Update(challenge *model.Challenge) error
	Delete(id, userID uuid.UUID) error
	RecalculateProgress(userID uuid.UUID) error
}

type GormChallengeRepository struct {
	db *gorm.DB
}

func NewChallengeRepository(db *gorm.DB) ChallengeRepository {
	return &GormChallengeRepository{db: db}
}

func (r *GormChallengeRepository) List(userID uuid.UUID, status string) ([]model.Challenge, error) {
	query := r.db.Where("user_id = ?", userID)
	switch status {
	case "active":
		query = query.Where("is_completed = FALSE")
	case "completed":
		query = query.Where("is_completed = TRUE")
	}

	var challenges []model.Challenge
	if err := query.Order("is_completed ASC").Order("end_date ASC").Order("created_at DESC").Find(&challenges).Error; err != nil {
		return nil, fmt.Errorf("list challenges: %w", err)
	}

	return challenges, nil
}

func (r *GormChallengeRepository) FindByID(id, userID uuid.UUID) (*model.Challenge, error) {
	var challenge model.Challenge
	err := r.db.Where("id = ? AND user_id = ?", id, userID).First(&challenge).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("find challenge by id: %w", err)
	}

	return &challenge, nil
}

func (r *GormChallengeRepository) Create(challenge *model.Challenge) error {
	if err := r.db.Create(challenge).Error; err != nil {
		return fmt.Errorf("create challenge: %w", err)
	}

	return nil
}

func (r *GormChallengeRepository) Update(challenge *model.Challenge) error {
	if err := r.db.Save(challenge).Error; err != nil {
		return fmt.Errorf("update challenge: %w", err)
	}

	return nil
}

func (r *GormChallengeRepository) Delete(id, userID uuid.UUID) error {
	result := r.db.Where("id = ? AND user_id = ?", id, userID).Delete(&model.Challenge{})
	if result.Error != nil {
		return fmt.Errorf("delete challenge: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}

	return nil
}

func (r *GormChallengeRepository) RecalculateProgress(userID uuid.UUID) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var challenges []model.Challenge
		if err := tx.Where("user_id = ?", userID).Find(&challenges).Error; err != nil {
			return fmt.Errorf("load challenges for recalculate: %w", err)
		}

		for _, challenge := range challenges {
			currentValue, err := r.calculateProgress(tx, userID, &challenge)
			if err != nil {
				return err
			}

			updates := map[string]interface{}{
				"current_value": currentValue,
				"is_completed":  currentValue >= challenge.TargetValue,
			}
			if err := tx.Model(&model.Challenge{}).
				Where("id = ? AND user_id = ?", challenge.ID, userID).
				Updates(updates).Error; err != nil {
				return fmt.Errorf("update challenge progress: %w", err)
			}
		}

		return nil
	})
}

func (r *GormChallengeRepository) calculateProgress(tx *gorm.DB, userID uuid.UUID, challenge *model.Challenge) (float64, error) {
	switch challenge.Type {
	case "volume":
		var value float64
		if err := tx.Raw(`
			SELECT COALESCE(SUM(total_volume), 0)
			FROM workouts
			WHERE user_id = ?
			  AND started_at >= ?
			  AND started_at <= ?`,
			userID, challenge.StartDate, challenge.EndDate,
		).Scan(&value).Error; err != nil {
			return 0, fmt.Errorf("calculate volume challenge progress: %w", err)
		}
		return value, nil
	case "frequency":
		var value int64
		if err := tx.Raw(`
			SELECT COUNT(*)
			FROM workouts
			WHERE user_id = ?
			  AND started_at >= ?
			  AND started_at <= ?`,
			userID, challenge.StartDate, challenge.EndDate,
		).Scan(&value).Error; err != nil {
			return 0, fmt.Errorf("calculate frequency challenge progress: %w", err)
		}
		return float64(value), nil
	case "cardio_duration":
		var value float64
		if err := tx.Raw(`
			SELECT COALESCE(SUM(COALESCE(ws.duration_seconds, 0)), 0)
			FROM workouts w
			JOIN workout_exercises we ON we.workout_id = w.id
			JOIN workout_sets ws ON ws.workout_exercise_id = we.id
			JOIN exercises e ON e.id = we.exercise_id
			WHERE w.user_id = ?
			  AND w.started_at >= ?
			  AND w.started_at <= ?
			  AND ws.is_completed = TRUE
			  AND ws.is_warmup = FALSE
			  AND (e.category = 'cardio' OR e.tracking_type = 'time')`,
			userID, challenge.StartDate, challenge.EndDate,
		).Scan(&value).Error; err != nil {
			return 0, fmt.Errorf("calculate cardio duration challenge progress: %w", err)
		}
		return value, nil
	default:
		return 0, nil
	}
}
