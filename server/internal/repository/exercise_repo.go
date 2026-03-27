package repository

import (
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"wsTrack/server/internal/dto"
	"wsTrack/server/internal/model"
)

type ExerciseRepository interface {
	List(userID uuid.UUID, filter dto.ExerciseFilter) ([]model.Exercise, int64, error)
	FindByID(id uuid.UUID, userID uuid.UUID) (*model.Exercise, error)
	Create(exercise *model.Exercise) error
	Update(exercise *model.Exercise) error
	SoftDelete(id uuid.UUID, userID uuid.UUID) error
	BatchCreate(exercises []model.Exercise) error
}

type GormExerciseRepository struct {
	db *gorm.DB
}

func NewExerciseRepository(db *gorm.DB) ExerciseRepository {
	return &GormExerciseRepository{db: db}
}

func (r *GormExerciseRepository) List(userID uuid.UUID, filter dto.ExerciseFilter) ([]model.Exercise, int64, error) {
	db := r.db.Model(&model.Exercise{})
	db = applyExerciseFilters(db, userID, filter)

	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("count exercises: %w", err)
	}

	query := db
	if strings.TrimSpace(filter.SortBy) == "" {
		query = query.Order("is_custom DESC").Order("sort_order ASC").Order("name ASC")
	}
	query = filter.PageQuery.ApplyTo(query)

	var exercises []model.Exercise
	if err := query.Find(&exercises).Error; err != nil {
		return nil, 0, fmt.Errorf("list exercises: %w", err)
	}

	return exercises, total, nil
}

func (r *GormExerciseRepository) FindByID(id uuid.UUID, userID uuid.UUID) (*model.Exercise, error) {
	var exercise model.Exercise
	err := r.db.
		Where("id = ? AND is_archived = FALSE AND (user_id IS NULL OR user_id = ?)", id, userID).
		First(&exercise).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("find exercise by id: %w", err)
	}

	return &exercise, nil
}

func (r *GormExerciseRepository) Create(exercise *model.Exercise) error {
	if err := r.db.Create(exercise).Error; err != nil {
		return fmt.Errorf("create exercise: %w", err)
	}

	return nil
}

func (r *GormExerciseRepository) Update(exercise *model.Exercise) error {
	if err := r.db.Save(exercise).Error; err != nil {
		return fmt.Errorf("update exercise: %w", err)
	}

	return nil
}

func (r *GormExerciseRepository) SoftDelete(id uuid.UUID, userID uuid.UUID) error {
	result := r.db.Model(&model.Exercise{}).
		Where("id = ? AND user_id = ? AND is_custom = TRUE", id, userID).
		Update("is_archived", true)
	if result.Error != nil {
		return fmt.Errorf("soft delete exercise: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}

	return nil
}

func (r *GormExerciseRepository) BatchCreate(exercises []model.Exercise) error {
	if len(exercises) == 0 {
		return nil
	}

	if err := r.db.CreateInBatches(exercises, 100).Error; err != nil {
		return fmt.Errorf("batch create exercises: %w", err)
	}

	return nil
}

func applyExerciseFilters(db *gorm.DB, userID uuid.UUID, filter dto.ExerciseFilter) *gorm.DB {
	db = db.Where("is_archived = FALSE")
	db = db.Where("(user_id IS NULL OR user_id = ?)", userID)

	if filter.IsCustom != nil {
		if *filter.IsCustom {
			db = db.Where("user_id = ? AND is_custom = TRUE", userID)
		} else {
			db = db.Where("user_id IS NULL AND is_custom = FALSE")
		}
	}

	if filter.Category != nil && strings.TrimSpace(*filter.Category) != "" {
		db = db.Where("category = ?", strings.TrimSpace(*filter.Category))
	}

	if filter.Muscle != nil && strings.TrimSpace(*filter.Muscle) != "" {
		db = db.Where("? = ANY(primary_muscles)", strings.TrimSpace(*filter.Muscle))
	}

	if filter.Equipment != nil && strings.TrimSpace(*filter.Equipment) != "" {
		db = db.Where("equipment = ?", strings.TrimSpace(*filter.Equipment))
	}

	if filter.Search != nil && strings.TrimSpace(*filter.Search) != "" {
		search := "%" + strings.TrimSpace(*filter.Search) + "%"
		db = db.Where("(name ILIKE ? OR name_en ILIKE ?)", search, search)
	}

	return db
}
