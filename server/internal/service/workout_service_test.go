package service

import (
	"errors"
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
	apperrors "wsTrack/server/internal/errors"
	"wsTrack/server/internal/model"
	"wsTrack/server/internal/repository"
	"wsTrack/server/internal/testutil"
	"wsTrack/server/pkg/pagination"
)

type WorkoutServiceSuite struct {
	suite.Suite
	db             *gorm.DB
	exerciseRepo   repository.ExerciseRepository
	planDayRepo    repository.PlanDayRepository
	workoutRepo    repository.WorkoutRepository
	workoutService *WorkoutService
}

func TestWorkoutServiceSuite(t *testing.T) {
	suite.Run(t, new(WorkoutServiceSuite))
}

func (s *WorkoutServiceSuite) SetupSuite() {
	s.db = testutil.SetupTestDB(s.T())
	s.exerciseRepo = repository.NewExerciseRepository(s.db)
	s.planDayRepo = repository.NewPlanDayRepository(s.db)
	s.workoutRepo = repository.NewWorkoutRepository(s.db)
	s.workoutService = NewWorkoutService(s.workoutRepo, s.exerciseRepo, s.planDayRepo, nil, nil, nil)
}

func (s *WorkoutServiceSuite) TearDownSuite() {
	if s.db != nil {
		sqlDB, err := s.db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	}

	testutil.TearDown()
}

func (s *WorkoutServiceSuite) SetupTest() {
	s.resetState()
	s.T().Cleanup(s.resetState)
}

func (s *WorkoutServiceSuite) TestCreateWorkout_FullData() {
	user, err := testutil.CreateTestUser(s.db, "workout-create@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	bench := s.createExercise(user.ID, "杠铃卧推", "Barbell Bench Press", []string{"chest"})
	row := s.createExercise(user.ID, "杠铃划船", "Barbell Row", []string{"back"})
	squat := s.createExercise(user.ID, "杠铃深蹲", "Barbell Squat", []string{"quads"})
	planDay := s.createPlanDay(user.ID, "力量计划", "Push Day")
	startedAt := time.Date(2026, 3, 1, 9, 0, 0, 0, time.UTC)
	finishedAt := startedAt.Add(75 * time.Minute)

	req := dto.WorkoutFullData{
		ClientID:        "create-full-workout",
		PlanDayID:       &planDay.ID,
		StartedAt:       startedAt,
		FinishedAt:      &finishedAt,
		DurationSeconds: int(finishedAt.Sub(startedAt).Seconds()),
		TotalVolume:     1,
		TotalSets:       999,
		Exercises: []dto.WorkoutExerciseData{
			s.workoutExerciseData("bench-we", bench.ID, 0,
				s.warmupSetData("bench-set-1", 1, 60, 10, "kg"),
				s.completedSetData("bench-set-2", 2, 100, 8, "kg"),
				s.completedSetData("bench-set-3", 3, 100, 8, "kg"),
				s.completedSetData("bench-set-4", 4, 95, 8, "kg"),
			),
			s.workoutExerciseData("row-we", row.ID, 1,
				s.completedSetData("row-set-1", 1, 80, 5, "kg"),
				s.completedSetData("row-set-2", 2, 80, 5, "kg"),
				s.completedSetData("row-set-3", 3, 80, 5, "kg"),
				s.completedSetData("row-set-4", 4, 80, 5, "kg"),
			),
			s.workoutExerciseData("squat-we", squat.ID, 2,
				s.completedSetData("squat-set-1", 1, 60, 8, "kg"),
				s.completedSetData("squat-set-2", 2, 60, 8, "kg"),
				s.completedSetData("squat-set-3", 3, 60, 8, "kg"),
				s.completedSetData("squat-set-4", 4, 60, 8, "kg"),
			),
		},
	}

	resp, err := s.workoutService.Create(user.ID, req)
	require.NoError(s.T(), err)
	require.NotNil(s.T(), resp)
	assert.NotEqual(s.T(), uuid.Nil, resp.ID)
	assert.Equal(s.T(), 12, resp.TotalSets)
	assert.InDelta(s.T(), 5880, resp.TotalVolume, 0.001)
	require.NotNil(s.T(), resp.PlanDayName)
	assert.Equal(s.T(), "Push Day", *resp.PlanDayName)
	require.Len(s.T(), resp.Exercises, 3)
	assert.InDelta(s.T(), 2360, resp.Exercises[0].Volume, 0.001)
	assert.InDelta(s.T(), 1600, resp.Exercises[1].Volume, 0.001)
	assert.InDelta(s.T(), 1920, resp.Exercises[2].Volume, 0.001)

	created, err := s.workoutRepo.FindByID(resp.ID, user.ID)
	require.NoError(s.T(), err)
	require.NotNil(s.T(), created)
	assert.Equal(s.T(), 12, created.TotalSets)
	assert.InDelta(s.T(), 5880, created.TotalVolume, 0.001)

	assert.Equal(s.T(), int64(1), s.countRows(&model.Workout{}, "id = ?", resp.ID))
	assert.Equal(s.T(), int64(3), s.countRows(&model.WorkoutExercise{}, "workout_id = ?", resp.ID))
	assert.Equal(
		s.T(),
		int64(12),
		s.countRows(
			&model.WorkoutSet{},
			"workout_exercise_id IN (SELECT id FROM workout_exercises WHERE workout_id = ?)",
			resp.ID,
		),
	)
}

func (s *WorkoutServiceSuite) TestGetWorkoutDetail_NestedPreload() {
	user, err := testutil.CreateTestUser(s.db, "workout-detail@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	bench := s.createExercise(user.ID, "杠铃卧推", "Barbell Bench Press", []string{"chest"})
	row := s.createExercise(user.ID, "杠铃划船", "Barbell Row", []string{"back"})
	planDay := s.createPlanDay(user.ID, "上半身计划", "Upper A")
	startedAt := time.Date(2026, 3, 2, 18, 0, 0, 0, time.UTC)
	finishedAt := startedAt.Add(50 * time.Minute)

	created := s.mustCreateWorkout(user.ID, dto.WorkoutFullData{
		ClientID:        "detail-workout",
		PlanDayID:       &planDay.ID,
		StartedAt:       startedAt,
		FinishedAt:      &finishedAt,
		DurationSeconds: int(finishedAt.Sub(startedAt).Seconds()),
		Exercises: []dto.WorkoutExerciseData{
			s.workoutExerciseData("detail-we-1", bench.ID, 0,
				s.completedSetData("detail-set-1", 1, 100, 8, "kg"),
				s.completedSetData("detail-set-2", 2, 100, 8, "kg"),
			),
			s.workoutExerciseData("detail-we-2", row.ID, 1,
				s.completedSetData("detail-set-3", 1, 80, 10, "kg"),
				s.completedSetData("detail-set-4", 2, 80, 10, "kg"),
			),
		},
	})

	detail, err := s.workoutService.GetByID(created.ID, user.ID)
	require.NoError(s.T(), err)
	require.NotNil(s.T(), detail)
	require.NotNil(s.T(), detail.PlanDayName)
	assert.Equal(s.T(), "Upper A", *detail.PlanDayName)
	require.Len(s.T(), detail.Exercises, 2)
	assert.Equal(s.T(), "杠铃卧推", detail.Exercises[0].Exercise.Name)
	assert.Equal(s.T(), []string{"chest"}, detail.Exercises[0].Exercise.PrimaryMuscles)
	assert.Equal(s.T(), "杠铃划船", detail.Exercises[1].Exercise.Name)
	assert.Equal(s.T(), []string{"back"}, detail.Exercises[1].Exercise.PrimaryMuscles)
	require.Len(s.T(), detail.Exercises[0].Sets, 2)
	require.Len(s.T(), detail.Exercises[1].Sets, 2)
	assert.Equal(s.T(), 1, detail.Exercises[0].Sets[0].SetNumber)
	require.NotNil(s.T(), detail.Exercises[0].Sets[0].Weight)
	assert.InDelta(s.T(), 100, *detail.Exercises[0].Sets[0].Weight, 0.001)
	require.NotNil(s.T(), detail.Exercises[1].Sets[1].Reps)
	assert.Equal(s.T(), 10, *detail.Exercises[1].Sets[1].Reps)
}

func (s *WorkoutServiceSuite) TestListWorkouts_DateFilter() {
	user, err := testutil.CreateTestUser(s.db, "workout-list-date@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	exercise := s.createExercise(user.ID, "硬拉", "Deadlift", []string{"back"})
	workout1 := s.mustCreateWorkout(user.ID, s.minimalWorkoutData("date-1", time.Date(2026, 3, 10, 8, 0, 0, 0, time.UTC), exercise.ID))
	workout2 := s.mustCreateWorkout(user.ID, s.minimalWorkoutData("date-2", time.Date(2026, 3, 11, 8, 0, 0, 0, time.UTC), exercise.ID))
	workout3 := s.mustCreateWorkout(user.ID, s.minimalWorkoutData("date-3", time.Date(2026, 3, 12, 8, 0, 0, 0, time.UTC), exercise.ID))

	dateFrom := time.Date(2026, 3, 11, 0, 0, 0, 0, time.UTC)
	dateTo := time.Date(2026, 3, 12, 23, 59, 59, 0, time.UTC)
	items, total, err := s.workoutService.List(user.ID, dto.WorkoutFilter{
		DateFrom: &dateFrom,
		DateTo:   &dateTo,
	})
	require.NoError(s.T(), err)
	assert.Equal(s.T(), int64(2), total)
	require.Len(s.T(), items, 2)
	assert.Equal(s.T(), workout3.ID, items[0].ID)
	assert.Equal(s.T(), workout2.ID, items[1].ID)
	assert.NotContains(s.T(), workoutIDs(items), workout1.ID)
}

func (s *WorkoutServiceSuite) TestListWorkouts_ExerciseFilter() {
	user, err := testutil.CreateTestUser(s.db, "workout-list-exercise@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	bench := s.createExercise(user.ID, "卧推", "Bench Press", []string{"chest"})
	squat := s.createExercise(user.ID, "深蹲", "Squat", []string{"quads"})

	workout1 := s.mustCreateWorkout(user.ID, s.minimalWorkoutData("exercise-filter-1", time.Date(2026, 3, 20, 8, 0, 0, 0, time.UTC), bench.ID))
	workout2 := s.mustCreateWorkout(user.ID, s.minimalWorkoutData("exercise-filter-2", time.Date(2026, 3, 21, 8, 0, 0, 0, time.UTC), squat.ID))
	workout3 := s.mustCreateWorkout(user.ID, dto.WorkoutFullData{
		ClientID:        "exercise-filter-3",
		StartedAt:       time.Date(2026, 3, 22, 8, 0, 0, 0, time.UTC),
		FinishedAt:      timePtr(time.Date(2026, 3, 22, 9, 0, 0, 0, time.UTC)),
		DurationSeconds: 3600,
		Exercises: []dto.WorkoutExerciseData{
			s.workoutExerciseData("exercise-filter-3-we1", bench.ID, 0, s.completedSetData("exercise-filter-3-set1", 1, 100, 5, "kg")),
			s.workoutExerciseData("exercise-filter-3-we2", squat.ID, 1, s.completedSetData("exercise-filter-3-set2", 1, 120, 5, "kg")),
		},
	})

	items, total, err := s.workoutService.List(user.ID, dto.WorkoutFilter{
		ExerciseID: &bench.ID,
	})
	require.NoError(s.T(), err)
	assert.Equal(s.T(), int64(2), total)
	require.Len(s.T(), items, 2)
	assert.Equal(s.T(), workout3.ID, items[0].ID)
	assert.Equal(s.T(), workout1.ID, items[1].ID)
	assert.NotContains(s.T(), workoutIDs(items), workout2.ID)
}

func (s *WorkoutServiceSuite) TestListWorkouts_Pagination() {
	user, err := testutil.CreateTestUser(s.db, "workout-list-pagination@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	exercise := s.createExercise(user.ID, "推举", "Press", []string{"shoulders"})
	oldest := s.mustCreateWorkout(user.ID, s.minimalWorkoutData("page-1", time.Date(2026, 3, 1, 7, 0, 0, 0, time.UTC), exercise.ID))
	middle := s.mustCreateWorkout(user.ID, s.minimalWorkoutData("page-2", time.Date(2026, 3, 2, 7, 0, 0, 0, time.UTC), exercise.ID))
	latest := s.mustCreateWorkout(user.ID, s.minimalWorkoutData("page-3", time.Date(2026, 3, 3, 7, 0, 0, 0, time.UTC), exercise.ID))

	page1, total1, err := s.workoutService.List(user.ID, dto.WorkoutFilter{
		PageQuery: pagination.PageQuery{
			Page:     1,
			PageSize: 2,
		},
	})
	require.NoError(s.T(), err)
	assert.Equal(s.T(), int64(3), total1)
	require.Len(s.T(), page1, 2)
	assert.Equal(s.T(), latest.ID, page1[0].ID)
	assert.Equal(s.T(), middle.ID, page1[1].ID)

	page2, total2, err := s.workoutService.List(user.ID, dto.WorkoutFilter{
		PageQuery: pagination.PageQuery{
			Page:     2,
			PageSize: 2,
		},
	})
	require.NoError(s.T(), err)
	assert.Equal(s.T(), int64(3), total2)
	require.Len(s.T(), page2, 1)
	assert.Equal(s.T(), oldest.ID, page2[0].ID)
	assert.Empty(s.T(), intersectWorkoutIDs(page1, page2))
}

func (s *WorkoutServiceSuite) TestBatchSync_SingleWorkout() {
	user, err := testutil.CreateTestUser(s.db, "workout-sync-single@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	exercise := s.createExercise(user.ID, "卧推", "Bench Press", []string{"chest"})
	workout := dto.WorkoutFullData{
		ClientID:        "sync-single-workout",
		StartedAt:       time.Date(2026, 3, 4, 18, 0, 0, 0, time.UTC),
		FinishedAt:      timePtr(time.Date(2026, 3, 4, 19, 0, 0, 0, time.UTC)),
		DurationSeconds: 3600,
		Exercises: []dto.WorkoutExerciseData{
			s.workoutExerciseData("sync-single-we", exercise.ID, 0,
				s.completedSetData("sync-single-set1", 1, 100, 8, "kg"),
				s.completedSetData("sync-single-set2", 2, 100, 8, "kg"),
			),
		},
	}

	resp, err := s.workoutService.Sync(user.ID, dto.SyncWorkoutRequest{
		Workouts: []dto.WorkoutFullData{workout},
	})
	require.NoError(s.T(), err)
	require.NotNil(s.T(), resp)
	require.Len(s.T(), resp.SyncedIDs, 1)
	assert.Equal(s.T(), workout.ClientID, resp.SyncedIDs[0].ClientID)
	assert.NotEqual(s.T(), uuid.Nil, resp.SyncedIDs[0].ServerID)

	synced, err := s.workoutRepo.FindByID(resp.SyncedIDs[0].ServerID, user.ID)
	require.NoError(s.T(), err)
	require.NotNil(s.T(), synced)
	assert.Equal(s.T(), 2, synced.TotalSets)
	assert.InDelta(s.T(), 1600, synced.TotalVolume, 0.001)
	assert.Equal(s.T(), int64(1), s.countRows(&model.Workout{}, "user_id = ?", user.ID))
}

func (s *WorkoutServiceSuite) TestBatchSync_MultipleWorkouts() {
	user, err := testutil.CreateTestUser(s.db, "workout-sync-multiple@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	exercise := s.createExercise(user.ID, "高翻", "Power Clean", []string{"full_body"})
	workouts := make([]dto.WorkoutFullData, 0, 10)
	for i := 0; i < 10; i++ {
		workouts = append(workouts, s.minimalWorkoutData(
			fmt.Sprintf("sync-multiple-%02d", i),
			time.Date(2026, 3, 1+i, 6, 0, 0, 0, time.UTC),
			exercise.ID,
		))
	}

	resp, err := s.workoutService.Sync(user.ID, dto.SyncWorkoutRequest{Workouts: workouts})
	require.NoError(s.T(), err)
	require.Len(s.T(), resp.SyncedIDs, 10)
	assert.Equal(s.T(), int64(10), s.countRows(&model.Workout{}, "user_id = ?", user.ID))

	seen := make(map[uuid.UUID]struct{}, len(resp.SyncedIDs))
	for _, item := range resp.SyncedIDs {
		assert.NotEqual(s.T(), uuid.Nil, item.ServerID)
		seen[item.ServerID] = struct{}{}
	}
	assert.Len(s.T(), seen, 10)
}

func (s *WorkoutServiceSuite) TestBatchSync_Idempotent() {
	user, err := testutil.CreateTestUser(s.db, "workout-sync-idempotent@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	exercise := s.createExercise(user.ID, "哑铃卧推", "Dumbbell Bench Press", []string{"chest"})
	request := dto.SyncWorkoutRequest{
		Workouts: []dto.WorkoutFullData{
			s.minimalWorkoutData("sync-idempotent", time.Date(2026, 3, 7, 7, 0, 0, 0, time.UTC), exercise.ID),
		},
	}

	first, err := s.workoutService.Sync(user.ID, request)
	require.NoError(s.T(), err)
	require.Len(s.T(), first.SyncedIDs, 1)

	second, err := s.workoutService.Sync(user.ID, request)
	require.NoError(s.T(), err)
	require.Len(s.T(), second.SyncedIDs, 1)
	assert.Equal(s.T(), first.SyncedIDs[0].ServerID, second.SyncedIDs[0].ServerID)
	assert.Equal(s.T(), int64(1), s.countRows(&model.Workout{}, "user_id = ?", user.ID))
	assert.Equal(s.T(), int64(1), s.countRows(&model.WorkoutExercise{}, "workout_id = ?", first.SyncedIDs[0].ServerID))
	assert.Equal(
		s.T(),
		int64(1),
		s.countRows(
			&model.WorkoutSet{},
			"workout_exercise_id IN (SELECT id FROM workout_exercises WHERE workout_id = ?)",
			first.SyncedIDs[0].ServerID,
		),
	)
}

func (s *WorkoutServiceSuite) TestBatchSync_ExceedLimit() {
	user, err := testutil.CreateTestUser(s.db, "workout-sync-limit@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	exercise := s.createExercise(user.ID, "实力推", "Push Press", []string{"shoulders"})
	workouts := make([]dto.WorkoutFullData, 0, 51)
	for i := 0; i < 51; i++ {
		workouts = append(workouts, s.minimalWorkoutData(
			fmt.Sprintf("sync-limit-%02d", i),
			time.Date(2026, 3, 1, 6, i, 0, 0, time.UTC),
			exercise.ID,
		))
	}

	resp, err := s.workoutService.Sync(user.ID, dto.SyncWorkoutRequest{Workouts: workouts})
	assert.Nil(s.T(), resp)
	appErr := requireWorkoutAppError(s.T(), err)
	assert.Equal(s.T(), 400, appErr.HTTPStatus)
	assert.Contains(s.T(), appErr.Message, "maximum of 50 workouts")
	assert.Equal(s.T(), int64(0), s.countRows(&model.Workout{}, "user_id = ?", user.ID))
}

func (s *WorkoutServiceSuite) TestDeleteOtherUserWorkout_NotFound() {
	userA, err := testutil.CreateTestUser(s.db, "workout-delete-a@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	userB, err := testutil.CreateTestUser(s.db, "workout-delete-b@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	exercise := s.createExercise(userA.ID, "卧推", "Bench Press", []string{"chest"})
	workout := s.mustCreateWorkout(userA.ID, s.minimalWorkoutData("delete-other-user", time.Date(2026, 3, 8, 8, 0, 0, 0, time.UTC), exercise.ID))

	err = s.workoutService.Delete(workout.ID, userB.ID)
	appErr := requireWorkoutAppError(s.T(), err)
	assert.Equal(s.T(), 404, appErr.HTTPStatus)
	assert.Equal(s.T(), int64(1), s.countRows(&model.Workout{}, "id = ?", workout.ID))
}

func (s *WorkoutServiceSuite) mustCreateWorkout(userID uuid.UUID, req dto.WorkoutFullData) *dto.WorkoutDetailResponse {
	s.T().Helper()

	resp, err := s.workoutService.Create(userID, req)
	require.NoError(s.T(), err)
	require.NotNil(s.T(), resp)
	return resp
}

func (s *WorkoutServiceSuite) createExercise(userID uuid.UUID, name, nameEn string, primaryMuscles []string) *model.Exercise {
	s.T().Helper()

	exercise := &model.Exercise{
		UserID:           &userID,
		Name:             name,
		NameEn:           workoutStringPtr(nameEn),
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

func (s *WorkoutServiceSuite) createPlanDay(userID uuid.UUID, planName, dayName string) *model.PlanDay {
	s.T().Helper()

	goal := enum.PlanGoalStrength
	plan := &model.Plan{
		UserID:   userID,
		Name:     planName,
		Goal:     &goal,
		IsActive: false,
	}
	require.NoError(s.T(), s.db.Create(plan).Error)

	day := &model.PlanDay{
		PlanID: plan.ID,
		Name:   dayName,
	}
	require.NoError(s.T(), s.db.Create(day).Error)
	return day
}

func (s *WorkoutServiceSuite) minimalWorkoutData(clientID string, startedAt time.Time, exerciseID uuid.UUID) dto.WorkoutFullData {
	finishedAt := startedAt.Add(45 * time.Minute)
	return dto.WorkoutFullData{
		ClientID:        clientID,
		StartedAt:       startedAt,
		FinishedAt:      &finishedAt,
		DurationSeconds: int(finishedAt.Sub(startedAt).Seconds()),
		Exercises: []dto.WorkoutExerciseData{
			s.workoutExerciseData(clientID+"-exercise", exerciseID, 0, s.completedSetData(clientID+"-set", 1, 100, 5, "kg")),
		},
	}
}

func (s *WorkoutServiceSuite) workoutExerciseData(clientID string, exerciseID uuid.UUID, sortOrder int, sets ...dto.WorkoutSetData) dto.WorkoutExerciseData {
	return dto.WorkoutExerciseData{
		ClientID:   clientID,
		ExerciseID: exerciseID,
		SortOrder:  sortOrder,
		Sets:       sets,
	}
}

func (s *WorkoutServiceSuite) completedSetData(clientID string, setNumber int, weight float64, reps int, unit string) dto.WorkoutSetData {
	return dto.WorkoutSetData{
		ClientID:    clientID,
		SetNumber:   setNumber,
		Weight:      floatPtr(weight),
		Reps:        intPtr(reps),
		IsCompleted: true,
		Unit:        unit,
	}
}

func (s *WorkoutServiceSuite) warmupSetData(clientID string, setNumber int, weight float64, reps int, unit string) dto.WorkoutSetData {
	item := s.completedSetData(clientID, setNumber, weight, reps, unit)
	item.IsWarmup = true
	return item
}

func (s *WorkoutServiceSuite) countRows(modelValue interface{}, query string, args ...interface{}) int64 {
	s.T().Helper()

	var count int64
	require.NoError(s.T(), s.db.Model(modelValue).Where(query, args...).Count(&count).Error)
	return count
}

func (s *WorkoutServiceSuite) resetState() {
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

func requireWorkoutAppError(t *testing.T, err error) *apperrors.AppError {
	t.Helper()

	require.Error(t, err)
	var appErr *apperrors.AppError
	require.True(t, errors.As(err, &appErr))
	return appErr
}

func workoutIDs(items []dto.WorkoutListItem) []uuid.UUID {
	ids := make([]uuid.UUID, 0, len(items))
	for _, item := range items {
		ids = append(ids, item.ID)
	}
	return ids
}

func intersectWorkoutIDs(left, right []dto.WorkoutListItem) []uuid.UUID {
	seen := make(map[uuid.UUID]struct{}, len(left))
	for _, item := range left {
		seen[item.ID] = struct{}{}
	}

	intersection := make([]uuid.UUID, 0)
	for _, item := range right {
		if _, ok := seen[item.ID]; ok {
			intersection = append(intersection, item.ID)
		}
	}

	return intersection
}

func workoutStringPtr(value string) *string {
	return &value
}

func intPtr(value int) *int {
	return &value
}

func floatPtr(value float64) *float64 {
	return &value
}

func timePtr(value time.Time) *time.Time {
	return &value
}
