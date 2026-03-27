package repository

import (
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"wsTrack/server/internal/model"
)

type PlanDayRepository interface {
	AddDay(day *model.PlanDay) error
	UpdateDay(day *model.PlanDay) error
	DeleteDay(id uuid.UUID) error
	ReorderDays(planID uuid.UUID, orderedIDs []uuid.UUID) error
	FindByID(id, userID uuid.UUID) (*model.PlanDay, error)
}

type GormPlanDayRepository struct {
	db *gorm.DB
}

func NewPlanDayRepository(db *gorm.DB) PlanDayRepository {
	return &GormPlanDayRepository{db: db}
}

func (r *GormPlanDayRepository) AddDay(day *model.PlanDay) error {
	if day.SortOrder == 0 {
		sortOrder, err := r.nextSortOrder(day.PlanID)
		if err != nil {
			return err
		}
		day.SortOrder = sortOrder
	}

	if err := r.db.Create(day).Error; err != nil {
		return fmt.Errorf("create plan day: %w", err)
	}

	return nil
}

func (r *GormPlanDayRepository) UpdateDay(day *model.PlanDay) error {
	if err := r.db.Save(day).Error; err != nil {
		return fmt.Errorf("update plan day: %w", err)
	}

	return nil
}

func (r *GormPlanDayRepository) DeleteDay(id uuid.UUID) error {
	result := r.db.Where("id = ?", id).Delete(&model.PlanDay{})
	if result.Error != nil {
		return fmt.Errorf("delete plan day: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}

	return nil
}

func (r *GormPlanDayRepository) ReorderDays(planID uuid.UUID, orderedIDs []uuid.UUID) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var count int64
		if err := tx.Model(&model.PlanDay{}).
			Where("plan_id = ? AND id IN ?", planID, orderedIDs).
			Count(&count).Error; err != nil {
			return fmt.Errorf("count reorder plan days: %w", err)
		}
		if count != int64(len(orderedIDs)) {
			return gorm.ErrRecordNotFound
		}

		for index, id := range orderedIDs {
			if err := tx.Model(&model.PlanDay{}).
				Where("id = ? AND plan_id = ?", id, planID).
				Update("sort_order", index+1).Error; err != nil {
				return fmt.Errorf("reorder plan days: %w", err)
			}
		}

		return nil
	})
}

func (r *GormPlanDayRepository) FindByID(id, userID uuid.UUID) (*model.PlanDay, error) {
	var day model.PlanDay
	err := r.db.
		Joins("JOIN plans ON plans.id = plan_days.plan_id").
		Where("plan_days.id = ? AND plans.user_id = ?", id, userID).
		Preload("Exercises", func(tx *gorm.DB) *gorm.DB {
			return tx.Order("sort_order ASC").Order("created_at ASC")
		}).
		Preload("Exercises.Exercise").
		First(&day).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("find plan day by id: %w", err)
	}

	return &day, nil
}

func (r *GormPlanDayRepository) nextSortOrder(planID uuid.UUID) (int, error) {
	var maxSortOrder int
	if err := r.db.Model(&model.PlanDay{}).
		Where("plan_id = ?", planID).
		Select("COALESCE(MAX(sort_order), 0)").
		Scan(&maxSortOrder).Error; err != nil {
		return 0, fmt.Errorf("query next plan day sort order: %w", err)
	}

	return maxSortOrder + 1, nil
}
