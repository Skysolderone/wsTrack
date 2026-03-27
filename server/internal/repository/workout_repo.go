package repository

import (
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"wsTrack/server/internal/dto"
	"wsTrack/server/internal/enum"
	"wsTrack/server/internal/model"
)

type WorkoutRepository interface {
	List(userID uuid.UUID, filter dto.WorkoutFilter) ([]dto.WorkoutListItem, int64, error)
	FindByID(id, userID uuid.UUID) (*model.Workout, error)
	Create(workout *model.Workout) error
	Update(id, userID uuid.UUID, updates map[string]interface{}) error
	Delete(id, userID uuid.UUID) error
	BatchSync(userID uuid.UUID, workouts []dto.WorkoutFullData) ([]uuid.UUID, error)
}

type GormWorkoutRepository struct {
	db *gorm.DB
}

func NewWorkoutRepository(db *gorm.DB) WorkoutRepository {
	return &GormWorkoutRepository{db: db}
}

func (r *GormWorkoutRepository) List(userID uuid.UUID, filter dto.WorkoutFilter) ([]dto.WorkoutListItem, int64, error) {
	base := r.db.Table("workouts AS w").
		Joins("LEFT JOIN plan_days AS pd ON pd.id = w.plan_day_id").
		Joins("LEFT JOIN workout_exercises AS we_all ON we_all.workout_id = w.id").
		Where("w.user_id = ?", userID)

	if filter.DateFrom != nil {
		base = base.Where("w.started_at >= ?", *filter.DateFrom)
	}
	if filter.DateTo != nil {
		base = base.Where("w.started_at <= ?", *filter.DateTo)
	}
	if filter.ExerciseID != nil {
		base = base.Joins("JOIN workout_exercises AS we_filter ON we_filter.workout_id = w.id AND we_filter.exercise_id = ?", *filter.ExerciseID)
	}

	var total int64
	if err := base.Distinct("w.id").Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("count workouts: %w", err)
	}

	query := base.Select(`
		w.id,
		pd.name AS plan_day_name,
		w.started_at,
		w.duration_seconds,
		w.total_volume,
		w.total_sets,
		COUNT(DISTINCT we_all.id) AS exercise_count,
		w.rating
	`).Group(`
		w.id,
		pd.name,
		w.started_at,
		w.duration_seconds,
		w.total_volume,
		w.total_sets,
		w.rating
	`)

	if filter.SortBy == "" {
		query = query.Order("w.started_at DESC")
	}
	query = filter.PageQuery.ApplyTo(query)

	var items []dto.WorkoutListItem
	if err := query.Scan(&items).Error; err != nil {
		return nil, 0, fmt.Errorf("list workouts: %w", err)
	}

	return items, total, nil
}

func (r *GormWorkoutRepository) FindByID(id, userID uuid.UUID) (*model.Workout, error) {
	var workout model.Workout
	err := r.db.
		Preload("PlanDay").
		Preload("Exercises", func(tx *gorm.DB) *gorm.DB {
			return tx.Order("sort_order ASC").Order("created_at ASC")
		}).
		Preload("Exercises.Exercise").
		Preload("Exercises.Sets", func(tx *gorm.DB) *gorm.DB {
			return tx.Order("set_number ASC").Order("created_at ASC")
		}).
		Where("id = ? AND user_id = ?", id, userID).
		First(&workout).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("find workout by id: %w", err)
	}

	return &workout, nil
}

func (r *GormWorkoutRepository) Create(workout *model.Workout) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		var existingCount int64
		if err := tx.Model(&model.Workout{}).
			Where("user_id = ? AND client_id = ?", workout.UserID, workout.ClientID).
			Count(&existingCount).Error; err != nil {
			return fmt.Errorf("check workout client id: %w", err)
		}
		if existingCount > 0 {
			return gorm.ErrDuplicatedKey
		}

		return createWorkoutTree(tx, workout)
	})
}

func (r *GormWorkoutRepository) Update(id, userID uuid.UUID, updates map[string]interface{}) error {
	result := r.db.Model(&model.Workout{}).
		Where("id = ? AND user_id = ?", id, userID).
		Updates(updates)
	if result.Error != nil {
		return fmt.Errorf("update workout: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}

	return nil
}

func (r *GormWorkoutRepository) Delete(id, userID uuid.UUID) error {
	result := r.db.Where("id = ? AND user_id = ?", id, userID).Delete(&model.Workout{})
	if result.Error != nil {
		return fmt.Errorf("delete workout: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}

	return nil
}

func (r *GormWorkoutRepository) BatchSync(userID uuid.UUID, workouts []dto.WorkoutFullData) ([]uuid.UUID, error) {
	ids := make([]uuid.UUID, 0, len(workouts))

	err := r.db.Transaction(func(tx *gorm.DB) error {
		clientIDs := make([]string, 0, len(workouts))
		for _, workout := range workouts {
			clientIDs = append(clientIDs, workout.ClientID)
		}

		var existing []model.Workout
		if len(clientIDs) > 0 {
			if err := tx.Select("id", "client_id", "user_id").
				Where("user_id = ? AND client_id IN ?", userID, clientIDs).
				Find(&existing).Error; err != nil {
				return fmt.Errorf("query existing workouts for sync: %w", err)
			}
		}

		existingMap := make(map[string]uuid.UUID, len(existing))
		for _, workout := range existing {
			existingMap[workout.ClientID] = workout.ID
		}

		for _, workoutData := range workouts {
			if existingID, ok := existingMap[workoutData.ClientID]; ok {
				ids = append(ids, existingID)
				continue
			}

			workout := buildWorkoutModel(userID, workoutData)
			if err := createWorkoutTree(tx, workout); err != nil {
				return err
			}

			existingMap[workout.ClientID] = workout.ID
			ids = append(ids, workout.ID)
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	return ids, nil
}

func createWorkoutTree(tx *gorm.DB, workout *model.Workout) error {
	exercises := workout.Exercises
	workout.Exercises = nil
	if err := tx.Create(workout).Error; err != nil {
		return fmt.Errorf("create workout: %w", err)
	}

	for exerciseIndex := range exercises {
		sets := exercises[exerciseIndex].Sets
		exercises[exerciseIndex].Sets = nil
		exercises[exerciseIndex].WorkoutID = workout.ID

		if err := tx.Create(&exercises[exerciseIndex]).Error; err != nil {
			return fmt.Errorf("create workout exercise: %w", err)
		}

		for setIndex := range sets {
			sets[setIndex].WorkoutExerciseID = exercises[exerciseIndex].ID
			if err := tx.Create(&sets[setIndex]).Error; err != nil {
				return fmt.Errorf("create workout set: %w", err)
			}
		}

		exercises[exerciseIndex].Sets = sets
	}

	workout.Exercises = exercises
	return nil
}

func buildWorkoutModel(userID uuid.UUID, item dto.WorkoutFullData) *model.Workout {
	workout := &model.Workout{
		UserID:          userID,
		PlanDayID:       item.PlanDayID,
		ClientID:        item.ClientID,
		StartedAt:       item.StartedAt,
		FinishedAt:      item.FinishedAt,
		DurationSeconds: item.DurationSeconds,
		TotalVolume:     item.TotalVolume,
		TotalSets:       item.TotalSets,
		Rating:          item.Rating,
		Notes:           item.Notes,
		Exercises:       make([]model.WorkoutExercise, 0, len(item.Exercises)),
	}

	for _, exercise := range item.Exercises {
		modelExercise := model.WorkoutExercise{
			ClientID:   exercise.ClientID,
			ExerciseID: exercise.ExerciseID,
			SortOrder:  exercise.SortOrder,
			Volume:     exercise.Volume,
			Notes:      exercise.Notes,
			Sets:       make([]model.WorkoutSet, 0, len(exercise.Sets)),
		}

		for _, set := range exercise.Sets {
			modelExercise.Sets = append(modelExercise.Sets, model.WorkoutSet{
				ClientID:        set.ClientID,
				SetNumber:       set.SetNumber,
				Weight:          set.Weight,
				Reps:            set.Reps,
				DurationSeconds: set.DurationSeconds,
				Distance:        set.Distance,
				RPE:             set.RPE,
				IsWarmup:        set.IsWarmup,
				IsCompleted:     set.IsCompleted,
				RestSeconds:     set.RestSeconds,
				IsPR:            set.IsPR,
				Unit:            enum.WeightUnit(set.Unit),
				CompletedAt:     set.CompletedAt,
			})
		}

		workout.Exercises = append(workout.Exercises, modelExercise)
	}

	recalculateWorkoutTotals(workout)
	return workout
}

func recalculateWorkoutTotals(workout *model.Workout) {
	workout.TotalVolume = 0
	workout.TotalSets = 0

	for exerciseIndex := range workout.Exercises {
		workout.Exercises[exerciseIndex].Volume = 0
		workout.TotalSets += len(workout.Exercises[exerciseIndex].Sets)

		for _, set := range workout.Exercises[exerciseIndex].Sets {
			if !set.IsCompleted || set.IsWarmup || set.Weight == nil || set.Reps == nil {
				continue
			}

			setVolume := *set.Weight * float64(*set.Reps)
			workout.Exercises[exerciseIndex].Volume += setVolume
			workout.TotalVolume += setVolume
		}
	}
}
