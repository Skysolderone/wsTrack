package repository

import (
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"wsTrack/server/internal/model"
)

type PlanRepository interface {
	List(userID uuid.UUID) ([]model.Plan, error)
	FindByID(id, userID uuid.UUID) (*model.Plan, error)
	Create(plan *model.Plan) error
	Update(plan *model.Plan) error
	Delete(id, userID uuid.UUID) error
	SetActive(id, userID uuid.UUID) error
	Duplicate(id, userID uuid.UUID) (*model.Plan, error)
	CloneToUser(id, sourceUserID, targetUserID uuid.UUID) (*model.Plan, error)
}

type GormPlanRepository struct {
	db *gorm.DB
}

func NewPlanRepository(db *gorm.DB) PlanRepository {
	return &GormPlanRepository{db: db}
}

func (r *GormPlanRepository) List(userID uuid.UUID) ([]model.Plan, error) {
	var plans []model.Plan
	err := r.withPlanPreloads(r.db).
		Where("user_id = ?", userID).
		Order("is_active DESC").
		Order("updated_at DESC").
		Find(&plans).Error
	if err != nil {
		return nil, fmt.Errorf("list plans: %w", err)
	}

	return plans, nil
}

func (r *GormPlanRepository) FindByID(id, userID uuid.UUID) (*model.Plan, error) {
	var plan model.Plan
	err := r.withPlanPreloads(r.db).
		Where("id = ? AND user_id = ?", id, userID).
		First(&plan).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("find plan by id: %w", err)
	}

	return &plan, nil
}

func (r *GormPlanRepository) Create(plan *model.Plan) error {
	if err := r.db.Create(plan).Error; err != nil {
		return fmt.Errorf("create plan: %w", err)
	}

	return nil
}

func (r *GormPlanRepository) Update(plan *model.Plan) error {
	if err := r.db.Save(plan).Error; err != nil {
		return fmt.Errorf("update plan: %w", err)
	}

	return nil
}

func (r *GormPlanRepository) Delete(id, userID uuid.UUID) error {
	result := r.db.Where("id = ? AND user_id = ?", id, userID).Delete(&model.Plan{})
	if result.Error != nil {
		return fmt.Errorf("delete plan: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}

	return nil
}

func (r *GormPlanRepository) SetActive(id, userID uuid.UUID) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&model.Plan{}).
			Where("id = ? AND user_id = ?", id, userID).
			Update("is_active", true)
		if result.Error != nil {
			return fmt.Errorf("set active plan: %w", result.Error)
		}
		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}

		if err := tx.Model(&model.Plan{}).
			Where("user_id = ? AND id <> ?", userID, id).
			Update("is_active", false).Error; err != nil {
			return fmt.Errorf("deactivate other plans: %w", err)
		}

		return nil
	})
}

func (r *GormPlanRepository) Duplicate(id, userID uuid.UUID) (*model.Plan, error) {
	return r.CloneToUser(id, userID, userID)
}

func (r *GormPlanRepository) CloneToUser(id, sourceUserID, targetUserID uuid.UUID) (*model.Plan, error) {
	var duplicatedPlanID uuid.UUID

	err := r.db.Transaction(func(tx *gorm.DB) error {
		var source model.Plan
		err := r.withPlanPreloads(tx).
			Where("id = ? AND user_id = ?", id, sourceUserID).
			First(&source).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if err != nil {
			return fmt.Errorf("load source plan for duplicate: %w", err)
		}

		duplicated := model.Plan{
			UserID:      targetUserID,
			Name:        source.Name,
			Description: source.Description,
			Goal:        source.Goal,
			IsActive:    false,
		}
		if err := tx.Create(&duplicated).Error; err != nil {
			return fmt.Errorf("create duplicated plan: %w", err)
		}
		duplicatedPlanID = duplicated.ID
		clonedExercises := make(map[uuid.UUID]uuid.UUID)

		for _, day := range source.Days {
			newDay := model.PlanDay{
				PlanID:    duplicated.ID,
				Name:      day.Name,
				SortOrder: day.SortOrder,
			}
			if err := tx.Create(&newDay).Error; err != nil {
				return fmt.Errorf("create duplicated plan day: %w", err)
			}

			for _, exercise := range day.Exercises {
				targetExerciseID := exercise.ExerciseID
				if clonedID, ok := clonedExercises[exercise.ExerciseID]; ok {
					targetExerciseID = clonedID
				} else if exercise.Exercise.UserID != nil && *exercise.Exercise.UserID == sourceUserID && exercise.Exercise.IsCustom && sourceUserID != targetUserID {
					clonedExercise := model.Exercise{
						UserID:           &targetUserID,
						Name:             exercise.Exercise.Name,
						NameEn:           exercise.Exercise.NameEn,
						Category:         exercise.Exercise.Category,
						PrimaryMuscles:   exercise.Exercise.PrimaryMuscles,
						SecondaryMuscles: exercise.Exercise.SecondaryMuscles,
						Equipment:        exercise.Exercise.Equipment,
						TrackingType:     exercise.Exercise.TrackingType,
						UnitPreference:   exercise.Exercise.UnitPreference,
						IsCustom:         true,
						IsArchived:       false,
						Notes:            exercise.Exercise.Notes,
						SortOrder:        exercise.Exercise.SortOrder,
					}
					if err := tx.Create(&clonedExercise).Error; err != nil {
						return fmt.Errorf("clone custom exercise to target user: %w", err)
					}
					targetExerciseID = clonedExercise.ID
					clonedExercises[exercise.ExerciseID] = clonedExercise.ID
				}

				newExercise := model.PlanExercise{
					PlanDayID:     newDay.ID,
					ExerciseID:    targetExerciseID,
					TargetSets:    exercise.TargetSets,
					TargetReps:    exercise.TargetReps,
					TargetWeight:  exercise.TargetWeight,
					RestSeconds:   exercise.RestSeconds,
					SupersetGroup: exercise.SupersetGroup,
					SortOrder:     exercise.SortOrder,
					Notes:         exercise.Notes,
				}
				if err := tx.Create(&newExercise).Error; err != nil {
					return fmt.Errorf("create duplicated plan exercise: %w", err)
				}
			}
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	return r.FindByID(duplicatedPlanID, targetUserID)
}

func (r *GormPlanRepository) withPlanPreloads(db *gorm.DB) *gorm.DB {
	return db.
		Preload("Days", func(tx *gorm.DB) *gorm.DB {
			return tx.Order("sort_order ASC").Order("created_at ASC")
		}).
		Preload("Days.Exercises", func(tx *gorm.DB) *gorm.DB {
			return tx.Order("sort_order ASC").Order("created_at ASC")
		}).
		Preload("Days.Exercises.Exercise")
}
