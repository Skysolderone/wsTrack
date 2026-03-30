package repository

import (
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"wsTrack/server/internal/model"
)

type PlanExerciseRepository interface {
	AddExercise(exercise *model.PlanExercise) error
	UpdateExercise(exercise *model.PlanExercise) error
	DeleteExercise(id uuid.UUID) error
	ReorderExercises(dayID uuid.UUID, orderedIDs []uuid.UUID) error
	FindByID(id, userID uuid.UUID) (*model.PlanExercise, error)
}

type GormPlanExerciseRepository struct {
	db *gorm.DB
}

func NewPlanExerciseRepository(db *gorm.DB) PlanExerciseRepository {
	return &GormPlanExerciseRepository{db: db}
}

func (r *GormPlanExerciseRepository) AddExercise(exercise *model.PlanExercise) error {
	if exercise.SortOrder == 0 {
		sortOrder, err := r.nextSortOrder(exercise.PlanDayID)
		if err != nil {
			return err
		}
		exercise.SortOrder = sortOrder
	}

	if err := r.db.Create(exercise).Error; err != nil {
		return fmt.Errorf("create plan exercise: %w", err)
	}

	return r.loadExercise(exercise)
}

func (r *GormPlanExerciseRepository) UpdateExercise(exercise *model.PlanExercise) error {
	if err := r.db.Save(exercise).Error; err != nil {
		return fmt.Errorf("update plan exercise: %w", err)
	}

	return r.loadExercise(exercise)
}

func (r *GormPlanExerciseRepository) DeleteExercise(id uuid.UUID) error {
	result := r.db.Where("id = ?", id).Delete(&model.PlanExercise{})
	if result.Error != nil {
		return fmt.Errorf("delete plan exercise: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}

	return nil
}

func (r *GormPlanExerciseRepository) ReorderExercises(dayID uuid.UUID, orderedIDs []uuid.UUID) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var count int64
		if err := tx.Model(&model.PlanExercise{}).
			Where("plan_day_id = ? AND id IN ?", dayID, orderedIDs).
			Count(&count).Error; err != nil {
			return fmt.Errorf("count reorder plan exercises: %w", err)
		}
		if count != int64(len(orderedIDs)) {
			return gorm.ErrRecordNotFound
		}

		for index, id := range orderedIDs {
			if err := tx.Model(&model.PlanExercise{}).
				Where("id = ? AND plan_day_id = ?", id, dayID).
				Update("sort_order", index).Error; err != nil {
				return fmt.Errorf("reorder plan exercises: %w", err)
			}
		}

		return nil
	})
}

func (r *GormPlanExerciseRepository) FindByID(id, userID uuid.UUID) (*model.PlanExercise, error) {
	var exercise model.PlanExercise
	err := r.db.
		Joins("JOIN plan_days ON plan_days.id = plan_exercises.plan_day_id").
		Joins("JOIN plans ON plans.id = plan_days.plan_id").
		Where("plan_exercises.id = ? AND plans.user_id = ?", id, userID).
		Preload("Exercise").
		First(&exercise).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("find plan exercise by id: %w", err)
	}

	return &exercise, nil
}

func (r *GormPlanExerciseRepository) nextSortOrder(dayID uuid.UUID) (int, error) {
	var maxSortOrder int
	if err := r.db.Model(&model.PlanExercise{}).
		Where("plan_day_id = ?", dayID).
		Select("COALESCE(MAX(sort_order), -1)").
		Scan(&maxSortOrder).Error; err != nil {
		return 0, fmt.Errorf("query next plan exercise sort order: %w", err)
	}

	return maxSortOrder + 1, nil
}

func (r *GormPlanExerciseRepository) loadExercise(exercise *model.PlanExercise) error {
	if err := r.db.Preload("Exercise").First(exercise, "id = ?", exercise.ID).Error; err != nil {
		return fmt.Errorf("reload plan exercise: %w", err)
	}

	return nil
}
