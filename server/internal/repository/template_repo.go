package repository

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"wsTrack/server/internal/dto"
	"wsTrack/server/internal/model"
)

type TemplateRepository interface {
	List(userID uuid.UUID) ([]model.Template, error)
	FindByID(id, userID uuid.UUID) (*model.Template, error)
	Create(template *model.Template) error
	Delete(id, userID uuid.UUID) error
	CreatePlanFromTemplate(userID uuid.UUID, template *model.Template, snapshot dto.TemplateSnapshot) (*model.Plan, error)
}

type GormTemplateRepository struct {
	db *gorm.DB
}

func NewTemplateRepository(db *gorm.DB) TemplateRepository {
	return &GormTemplateRepository{db: db}
}

func (r *GormTemplateRepository) List(userID uuid.UUID) ([]model.Template, error) {
	var templates []model.Template
	if err := r.db.
		Where("user_id IS NULL OR user_id = ?", userID).
		Order("is_built_in DESC").
		Order("created_at DESC").
		Find(&templates).Error; err != nil {
		return nil, fmt.Errorf("list templates: %w", err)
	}

	return templates, nil
}

func (r *GormTemplateRepository) FindByID(id, userID uuid.UUID) (*model.Template, error) {
	var template model.Template
	err := r.db.
		Where("id = ? AND (user_id IS NULL OR user_id = ?)", id, userID).
		First(&template).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("find template by id: %w", err)
	}

	return &template, nil
}

func (r *GormTemplateRepository) Create(template *model.Template) error {
	if err := r.db.Create(template).Error; err != nil {
		return fmt.Errorf("create template: %w", err)
	}

	return nil
}

func (r *GormTemplateRepository) Delete(id, userID uuid.UUID) error {
	result := r.db.
		Where("id = ? AND user_id = ? AND is_built_in = FALSE", id, userID).
		Delete(&model.Template{})
	if result.Error != nil {
		return fmt.Errorf("delete template: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}

	return nil
}

func (r *GormTemplateRepository) CreatePlanFromTemplate(userID uuid.UUID, template *model.Template, snapshot dto.TemplateSnapshot) (*model.Plan, error) {
	var planID uuid.UUID

	err := r.db.Transaction(func(tx *gorm.DB) error {
		plan := model.Plan{
			UserID:      userID,
			Name:        template.Name,
			Description: template.Description,
			Goal:        template.Goal,
			IsActive:    false,
		}
		if err := tx.Create(&plan).Error; err != nil {
			return fmt.Errorf("create plan from template: %w", err)
		}
		planID = plan.ID

		for _, day := range snapshot.Days {
			newDay := model.PlanDay{
				PlanID:    plan.ID,
				Name:      day.Name,
				SortOrder: day.SortOrder,
			}
			if err := tx.Create(&newDay).Error; err != nil {
				return fmt.Errorf("create plan day from template: %w", err)
			}

			for _, exercise := range day.Exercises {
				newExercise := model.PlanExercise{
					PlanDayID:     newDay.ID,
					ExerciseID:    exercise.Exercise.ID,
					TargetSets:    exercise.TargetSets,
					TargetReps:    exercise.TargetReps,
					TargetWeight:  exercise.TargetWeight,
					RestSeconds:   exercise.RestSeconds,
					SupersetGroup: exercise.SupersetGroup,
					SortOrder:     exercise.SortOrder,
					Notes:         exercise.Notes,
				}
				if err := tx.Create(&newExercise).Error; err != nil {
					return fmt.Errorf("create plan exercise from template: %w", err)
				}
			}
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	var created model.Plan
	if err := r.db.
		Preload("Days", func(tx *gorm.DB) *gorm.DB {
			return tx.Order("sort_order ASC").Order("created_at ASC")
		}).
		Preload("Days.Exercises", func(tx *gorm.DB) *gorm.DB {
			return tx.Order("sort_order ASC").Order("created_at ASC")
		}).
		Preload("Days.Exercises.Exercise").
		Where("id = ? AND user_id = ?", planID, userID).
		First(&created).Error; err != nil {
		return nil, fmt.Errorf("load plan created from template: %w", err)
	}

	return &created, nil
}

func decodeTemplateSnapshot(payload model.JSON) (dto.TemplateSnapshot, error) {
	var snapshot dto.TemplateSnapshot
	if len(payload) == 0 {
		return snapshot, errors.New("template snapshot is empty")
	}
	if err := json.Unmarshal(payload, &snapshot); err != nil {
		return snapshot, fmt.Errorf("decode template snapshot: %w", err)
	}

	return snapshot, nil
}
