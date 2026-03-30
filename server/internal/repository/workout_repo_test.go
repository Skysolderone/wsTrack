package repository

import (
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
	"gorm.io/gorm"

	"wsTrack/server/internal/dto"
	"wsTrack/server/internal/enum"
	"wsTrack/server/internal/model"
	"wsTrack/server/internal/testutil"
)

type WorkoutRepositorySuite struct {
	suite.Suite
	db          *gorm.DB
	workoutRepo WorkoutRepository
}

func TestWorkoutRepositorySuite(t *testing.T) {
	suite.Run(t, new(WorkoutRepositorySuite))
}

func (s *WorkoutRepositorySuite) SetupSuite() {
	s.db = testutil.SetupTestDB(s.T())
	s.workoutRepo = NewWorkoutRepository(s.db)
}

func (s *WorkoutRepositorySuite) TearDownSuite() {
	if s.db != nil {
		sqlDB, err := s.db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	}

	testutil.TearDown()
}

func (s *WorkoutRepositorySuite) SetupTest() {
	s.resetState()
	s.T().Cleanup(s.resetState)
}

func (s *WorkoutRepositorySuite) TestBatchSync_SingleWorkout() {
	user, err := testutil.CreateTestUser(s.db, "repo-sync-single@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	bench := s.createExercise(user.ID, "杠铃卧推", []string{"chest"})
	row := s.createExercise(user.ID, "杠铃划船", []string{"back"})
	workout := dto.WorkoutFullData{
		ClientID:        "repo-single-workout",
		StartedAt:       time.Date(2026, 3, 1, 7, 0, 0, 0, time.UTC),
		FinishedAt:      repoTimePtr(time.Date(2026, 3, 1, 8, 0, 0, 0, time.UTC)),
		DurationSeconds: 3600,
		Exercises: []dto.WorkoutExerciseData{
			s.exerciseData("repo-single-we-1", bench.ID, 0,
				s.completedSet("repo-single-set-1", 1, 100, 8, "kg"),
				s.completedSet("repo-single-set-2", 2, 100, 8, "kg"),
			),
			s.exerciseData("repo-single-we-2", row.ID, 1,
				s.completedSet("repo-single-set-3", 1, 80, 10, "kg"),
				s.completedSet("repo-single-set-4", 2, 80, 10, "kg"),
			),
		},
	}

	ids, err := s.workoutRepo.BatchSync(user.ID, []dto.WorkoutFullData{workout})
	require.NoError(s.T(), err)
	require.Len(s.T(), ids, 1)
	assert.NotEqual(s.T(), uuid.Nil, ids[0])

	stored, err := s.workoutRepo.FindByID(ids[0], user.ID)
	require.NoError(s.T(), err)
	require.NotNil(s.T(), stored)
	assert.Equal(s.T(), 4, stored.TotalSets)
	assert.InDelta(s.T(), 3200, stored.TotalVolume, 0.001)
	require.Len(s.T(), stored.Exercises, 2)
	require.Len(s.T(), stored.Exercises[0].Sets, 2)
	assert.Equal(s.T(), "杠铃卧推", stored.Exercises[0].Exercise.Name)
	assert.Equal(s.T(), "杠铃划船", stored.Exercises[1].Exercise.Name)
}

func (s *WorkoutRepositorySuite) TestBatchSync_MultipleWorkouts() {
	user, err := testutil.CreateTestUser(s.db, "repo-sync-multiple@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	exercise := s.createExercise(user.ID, "深蹲", []string{"quads"})
	workouts := make([]dto.WorkoutFullData, 0, 10)
	for i := 0; i < 10; i++ {
		workouts = append(workouts, s.minimalWorkout(
			fmt.Sprintf("repo-multi-%02d", i),
			time.Date(2026, 3, 1+i, 6, 0, 0, 0, time.UTC),
			exercise.ID,
		))
	}

	ids, err := s.workoutRepo.BatchSync(user.ID, workouts)
	require.NoError(s.T(), err)
	require.Len(s.T(), ids, 10)
	assert.Equal(s.T(), int64(10), s.countRows(&model.Workout{}, "user_id = ?", user.ID))
	assert.Equal(s.T(), int64(10), s.countRows(&model.WorkoutExercise{}, "workout_id IN (SELECT id FROM workouts WHERE user_id = ?)", user.ID))
	assert.Equal(
		s.T(),
		int64(10),
		s.countRows(
			&model.WorkoutSet{},
			"workout_exercise_id IN (SELECT id FROM workout_exercises WHERE workout_id IN (SELECT id FROM workouts WHERE user_id = ?))",
			user.ID,
		),
	)
}

func (s *WorkoutRepositorySuite) TestBatchSync_Idempotent() {
	user, err := testutil.CreateTestUser(s.db, "repo-sync-idempotent@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	exercise := s.createExercise(user.ID, "硬拉", []string{"back"})
	workout := s.minimalWorkout("repo-idempotent", time.Date(2026, 3, 5, 7, 0, 0, 0, time.UTC), exercise.ID)

	firstIDs, err := s.workoutRepo.BatchSync(user.ID, []dto.WorkoutFullData{workout})
	require.NoError(s.T(), err)
	require.Len(s.T(), firstIDs, 1)

	secondIDs, err := s.workoutRepo.BatchSync(user.ID, []dto.WorkoutFullData{workout})
	require.NoError(s.T(), err)
	require.Len(s.T(), secondIDs, 1)
	assert.Equal(s.T(), firstIDs[0], secondIDs[0])
	assert.Equal(s.T(), int64(1), s.countRows(&model.Workout{}, "user_id = ?", user.ID))
}

func (s *WorkoutRepositorySuite) TestBatchSync_TransactionRollback() {
	user, err := testutil.CreateTestUser(s.db, "repo-sync-rollback@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	validExercise := s.createExercise(user.ID, "推举", []string{"shoulders"})
	invalidExerciseID := uuid.New()

	validWorkout := s.minimalWorkout("repo-rollback-valid", time.Date(2026, 3, 9, 7, 0, 0, 0, time.UTC), validExercise.ID)
	invalidWorkout := s.minimalWorkout("repo-rollback-invalid", time.Date(2026, 3, 9, 8, 0, 0, 0, time.UTC), invalidExerciseID)

	ids, err := s.workoutRepo.BatchSync(user.ID, []dto.WorkoutFullData{validWorkout, invalidWorkout})
	require.Error(s.T(), err)
	assert.Nil(s.T(), ids)
	assert.Equal(s.T(), int64(0), s.countRows(&model.Workout{}, "user_id = ?", user.ID))
	assert.Equal(s.T(), int64(0), s.countRows(&model.WorkoutExercise{}, "1 = 1"))
	assert.Equal(s.T(), int64(0), s.countRows(&model.WorkoutSet{}, "1 = 1"))
}

func (s *WorkoutRepositorySuite) TestDeleteWorkout_CascadeDelete() {
	user, err := testutil.CreateTestUser(s.db, "repo-delete@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	exercise := s.createExercise(user.ID, "卧推", []string{"chest"})
	workout := buildWorkoutModel(user.ID, s.minimalWorkout("repo-delete-workout", time.Date(2026, 3, 11, 7, 0, 0, 0, time.UTC), exercise.ID))
	require.NoError(s.T(), s.workoutRepo.Create(workout))

	err = s.workoutRepo.Delete(workout.ID, user.ID)
	require.NoError(s.T(), err)
	assert.Equal(s.T(), int64(0), s.countRows(&model.Workout{}, "id = ?", workout.ID))
	assert.Equal(s.T(), int64(0), s.countRows(&model.WorkoutExercise{}, "workout_id = ?", workout.ID))
	assert.Equal(
		s.T(),
		int64(0),
		s.countRows(
			&model.WorkoutSet{},
			"workout_exercise_id IN (SELECT id FROM workout_exercises WHERE workout_id = ?)",
			workout.ID,
		),
	)
	assert.Equal(s.T(), int64(1), s.countRows(&model.Exercise{}, "id = ?", exercise.ID))
}

func (s *WorkoutRepositorySuite) TestVolumeCalculation_ExcludeWarmup() {
	user, err := testutil.CreateTestUser(s.db, "repo-volume-warmup@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	exercise := s.createExercise(user.ID, "卧推", []string{"chest"})
	workout := buildWorkoutModel(user.ID, dto.WorkoutFullData{
		ClientID:        "repo-volume-warmup",
		StartedAt:       time.Date(2026, 3, 12, 7, 0, 0, 0, time.UTC),
		FinishedAt:      repoTimePtr(time.Date(2026, 3, 12, 8, 0, 0, 0, time.UTC)),
		DurationSeconds: 3600,
		Exercises: []dto.WorkoutExerciseData{
			s.exerciseData("repo-volume-warmup-we", exercise.ID, 0,
				s.warmupSet("repo-volume-warmup-set1", 1, 60, 10, "kg"),
				s.completedSet("repo-volume-warmup-set2", 2, 100, 10, "kg"),
				s.completedSet("repo-volume-warmup-set3", 3, 100, 10, "kg"),
				s.completedSet("repo-volume-warmup-set4", 4, 100, 10, "kg"),
			),
		},
	})

	recalculateWorkoutTotals(workout)
	assert.Equal(s.T(), 4, workout.TotalSets)
	assert.InDelta(s.T(), 3000, workout.TotalVolume, 0.001)
	assert.InDelta(s.T(), 3000, workout.Exercises[0].Volume, 0.001)
}

func (s *WorkoutRepositorySuite) TestVolumeCalculation_MixedUnits() {
	user, err := testutil.CreateTestUser(s.db, "repo-volume-mixed@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	exercise := s.createExercise(user.ID, "硬拉", []string{"back"})
	workout := buildWorkoutModel(user.ID, dto.WorkoutFullData{
		ClientID:        "repo-volume-mixed",
		StartedAt:       time.Date(2026, 3, 13, 7, 0, 0, 0, time.UTC),
		FinishedAt:      repoTimePtr(time.Date(2026, 3, 13, 8, 0, 0, 0, time.UTC)),
		DurationSeconds: 3600,
		Exercises: []dto.WorkoutExerciseData{
			s.exerciseData("repo-volume-mixed-we", exercise.ID, 0,
				s.completedSet("repo-volume-mixed-set1", 1, 100, 5, "kg"),
				s.completedSet("repo-volume-mixed-set2", 2, 225, 5, "lbs"),
			),
		},
	})

	recalculateWorkoutTotals(workout)
	assert.InDelta(s.T(), 1625, workout.TotalVolume, 0.001)
	assert.InDelta(s.T(), 1625, workout.Exercises[0].Volume, 0.001)
}

func (s *WorkoutRepositorySuite) TestVolumeCalculation_IncompleteSet() {
	user, err := testutil.CreateTestUser(s.db, "repo-volume-incomplete@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	exercise := s.createExercise(user.ID, "深蹲", []string{"quads"})
	workout := buildWorkoutModel(user.ID, dto.WorkoutFullData{
		ClientID:        "repo-volume-incomplete",
		StartedAt:       time.Date(2026, 3, 14, 7, 0, 0, 0, time.UTC),
		FinishedAt:      repoTimePtr(time.Date(2026, 3, 14, 8, 0, 0, 0, time.UTC)),
		DurationSeconds: 3600,
		Exercises: []dto.WorkoutExerciseData{
			s.exerciseData("repo-volume-incomplete-we", exercise.ID, 0,
				s.completedSet("repo-volume-incomplete-set1", 1, 100, 10, "kg"),
				s.incompleteSet("repo-volume-incomplete-set2", 2, 120, 8, "kg"),
			),
		},
	})

	recalculateWorkoutTotals(workout)
	assert.Equal(s.T(), 2, workout.TotalSets)
	assert.InDelta(s.T(), 1000, workout.TotalVolume, 0.001)
	assert.InDelta(s.T(), 1000, workout.Exercises[0].Volume, 0.001)
}

func (s *WorkoutRepositorySuite) createExercise(userID uuid.UUID, name string, primaryMuscles []string) *model.Exercise {
	s.T().Helper()

	exercise := &model.Exercise{
		UserID:           &userID,
		Name:             name,
		NameEn:           repoStringPtr(name + " EN"),
		Category:         enum.ExerciseCategoryStrength,
		PrimaryMuscles:   model.StringArray(primaryMuscles),
		SecondaryMuscles: model.StringArray{"triceps"},
		Equipment:        enum.EquipmentBarbell,
		TrackingType:     enum.TrackingTypeWeightReps,
		IsCustom:         true,
	}
	require.NoError(s.T(), s.db.Create(exercise).Error)
	return exercise
}

func (s *WorkoutRepositorySuite) minimalWorkout(clientID string, startedAt time.Time, exerciseID uuid.UUID) dto.WorkoutFullData {
	finishedAt := startedAt.Add(45 * time.Minute)
	return dto.WorkoutFullData{
		ClientID:        clientID,
		StartedAt:       startedAt,
		FinishedAt:      &finishedAt,
		DurationSeconds: int(finishedAt.Sub(startedAt).Seconds()),
		Exercises: []dto.WorkoutExerciseData{
			s.exerciseData(clientID+"-we", exerciseID, 0, s.completedSet(clientID+"-set", 1, 100, 5, "kg")),
		},
	}
}

func (s *WorkoutRepositorySuite) exerciseData(clientID string, exerciseID uuid.UUID, sortOrder int, sets ...dto.WorkoutSetData) dto.WorkoutExerciseData {
	return dto.WorkoutExerciseData{
		ClientID:   clientID,
		ExerciseID: exerciseID,
		SortOrder:  sortOrder,
		Sets:       sets,
	}
}

func (s *WorkoutRepositorySuite) completedSet(clientID string, setNumber int, weight float64, reps int, unit string) dto.WorkoutSetData {
	return dto.WorkoutSetData{
		ClientID:    clientID,
		SetNumber:   setNumber,
		Weight:      repoFloatPtr(weight),
		Reps:        repoIntPtr(reps),
		IsCompleted: true,
		Unit:        unit,
	}
}

func (s *WorkoutRepositorySuite) warmupSet(clientID string, setNumber int, weight float64, reps int, unit string) dto.WorkoutSetData {
	item := s.completedSet(clientID, setNumber, weight, reps, unit)
	item.IsWarmup = true
	return item
}

func (s *WorkoutRepositorySuite) incompleteSet(clientID string, setNumber int, weight float64, reps int, unit string) dto.WorkoutSetData {
	item := s.completedSet(clientID, setNumber, weight, reps, unit)
	item.IsCompleted = false
	return item
}

func (s *WorkoutRepositorySuite) countRows(modelValue interface{}, query string, args ...interface{}) int64 {
	s.T().Helper()

	var count int64
	require.NoError(s.T(), s.db.Model(modelValue).Where(query, args...).Count(&count).Error)
	return count
}

func (s *WorkoutRepositorySuite) resetState() {
	if s.db == nil {
		return
	}

	require.NoError(
		s.T(),
		s.db.Exec(`
			TRUNCATE TABLE
				workout_sets,
				workout_exercises,
				workouts,
				personal_records,
				plan_exercises,
				plan_days,
				plans,
				coach_invitations,
				workout_comments,
				coach_clients,
				challenges,
				templates,
				exercises,
				users
			RESTART IDENTITY CASCADE
		`).Error,
	)
}

func repoStringPtr(value string) *string {
	return &value
}

func repoIntPtr(value int) *int {
	return &value
}

func repoFloatPtr(value float64) *float64 {
	return &value
}

func repoTimePtr(value time.Time) *time.Time {
	return &value
}
