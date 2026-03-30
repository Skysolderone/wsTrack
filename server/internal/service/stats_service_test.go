package service

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
	"gorm.io/gorm"

	"wsTrack/server/internal/dto"
	"wsTrack/server/internal/enum"
	"wsTrack/server/internal/model"
	"wsTrack/server/internal/repository"
	"wsTrack/server/internal/testutil"
)

type StatsServiceSuite struct {
	suite.Suite
	db             *gorm.DB
	redisClient    *redis.Client
	statsRepo      repository.StatsRepository
	statsService   *StatsService
	exerciseRepo   repository.ExerciseRepository
	planDayRepo    repository.PlanDayRepository
	workoutRepo    repository.WorkoutRepository
	workoutService *WorkoutService
}

func TestStatsServiceSuite(t *testing.T) {
	suite.Run(t, new(StatsServiceSuite))
}

func (s *StatsServiceSuite) SetupSuite() {
	s.db = testutil.SetupTestDB(s.T())
	s.redisClient = testutil.SetupTestRedis(s.T())
	s.statsRepo = repository.NewStatsRepository(s.db)
	s.statsService = NewStatsService(s.statsRepo, s.redisClient)
	s.exerciseRepo = repository.NewExerciseRepository(s.db)
	s.planDayRepo = repository.NewPlanDayRepository(s.db)
	s.workoutRepo = repository.NewWorkoutRepository(s.db)
	s.workoutService = NewWorkoutService(s.workoutRepo, s.exerciseRepo, s.planDayRepo, s.redisClient, nil, nil)
}

func (s *StatsServiceSuite) TearDownSuite() {
	if s.redisClient != nil {
		_ = s.redisClient.Close()
	}
	if s.db != nil {
		sqlDB, err := s.db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	}

	testutil.TearDown()
}

func (s *StatsServiceSuite) SetupTest() {
	s.resetState()
	s.T().Cleanup(s.resetState)
}

func (s *StatsServiceSuite) TestGetDashboard() {
	user, err := testutil.CreateTestUser(s.db, "stats-dashboard@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	fixture, err := testutil.SeedStatsTestData(s.db, user.ID)
	require.NoError(s.T(), err)

	dashboard, err := s.statsService.GetDashboard(user.ID)
	require.NoError(s.T(), err)
	require.NotNil(s.T(), dashboard)
	assert.Equal(s.T(), fixture.Dashboard.WeeklyWorkouts, dashboard.WeeklyWorkouts)
	assert.InDelta(s.T(), fixture.Dashboard.WeeklyVolume, dashboard.WeeklyVolume, 0.001)
	assert.InDelta(s.T(), fixture.Dashboard.LastWeekVolume, dashboard.LastWeekVolume, 0.001)
	assert.InDelta(s.T(), fixture.Dashboard.VolumeChangePercent, dashboard.VolumeChangePercent, 0.001)
	assert.Equal(s.T(), fixture.Dashboard.CurrentStreak, dashboard.CurrentStreak)
	s.assertPRRecords(fixture.Dashboard.RecentPRs, dashboard.RecentPRs)
	s.assertMuscleDistribution(fixture.CurrentWeekMuscleDistribution, dashboard.MuscleDistribution)
}

func (s *StatsServiceSuite) TestGetDashboard_NoData() {
	user, err := testutil.CreateTestUser(s.db, "stats-dashboard-empty@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	dashboard, err := s.statsService.GetDashboard(user.ID)
	require.NoError(s.T(), err)
	require.NotNil(s.T(), dashboard)
	assert.Zero(s.T(), dashboard.WeeklyWorkouts)
	assert.Zero(s.T(), dashboard.WeeklyVolume)
	assert.Zero(s.T(), dashboard.LastWeekVolume)
	assert.Zero(s.T(), dashboard.VolumeChangePercent)
	assert.Zero(s.T(), dashboard.CurrentStreak)
	assert.Empty(s.T(), dashboard.RecentPRs)
	assert.Empty(s.T(), dashboard.MuscleDistribution)
}

func (s *StatsServiceSuite) TestGetDashboard_RedisCache() {
	user, err := testutil.CreateTestUser(s.db, "stats-dashboard-cache@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	fixture, err := testutil.SeedStatsTestData(s.db, user.ID)
	require.NoError(s.T(), err)

	first, err := s.statsService.GetDashboard(user.ID)
	require.NoError(s.T(), err)
	require.NotNil(s.T(), first)

	ctx := context.Background()
	exists, err := s.redisClient.Exists(ctx, dashboardCacheKey(user.ID)).Result()
	require.NoError(s.T(), err)
	assert.Equal(s.T(), int64(1), exists)

	require.NoError(s.T(), s.db.Where("user_id = ?", user.ID).Delete(&model.PersonalRecord{}).Error)
	require.NoError(s.T(), s.db.Where("user_id = ?", user.ID).Delete(&model.Workout{}).Error)

	second, err := s.statsService.GetDashboard(user.ID)
	require.NoError(s.T(), err)
	require.NotNil(s.T(), second)
	assert.Equal(s.T(), first.WeeklyWorkouts, second.WeeklyWorkouts)
	assert.InDelta(s.T(), first.WeeklyVolume, second.WeeklyVolume, 0.001)
	assert.Len(s.T(), second.RecentPRs, len(first.RecentPRs))

	startedAt := fixture.ReferenceNow.Add(-30 * time.Minute)
	finishedAt := fixture.ReferenceNow
	_, err = s.workoutService.Create(user.ID, dto.WorkoutFullData{
		ClientID:        "stats-cache-new-workout",
		StartedAt:       startedAt,
		FinishedAt:      &finishedAt,
		DurationSeconds: int(finishedAt.Sub(startedAt).Seconds()),
		Exercises: []dto.WorkoutExerciseData{
			s.statsWorkoutExerciseData(
				"stats-cache-new-exercise",
				fixture.TargetExercise.ExerciseID,
				0,
				s.statsCompletedSetData("stats-cache-new-set", 1, 100, 5, "kg"),
			),
		},
	})
	require.NoError(s.T(), err)

	third, err := s.statsService.GetDashboard(user.ID)
	require.NoError(s.T(), err)
	require.NotNil(s.T(), third)
	assert.Equal(s.T(), 1, third.WeeklyWorkouts)
	assert.InDelta(s.T(), 500, third.WeeklyVolume, 0.001)
	assert.Zero(s.T(), third.LastWeekVolume)
	assert.Empty(s.T(), third.RecentPRs)
}

func (s *StatsServiceSuite) TestGetVolumeHistory_Weekly() {
	user, err := testutil.CreateTestUser(s.db, "stats-volume-weekly@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	fixture, err := testutil.SeedStatsTestData(s.db, user.ID)
	require.NoError(s.T(), err)

	items, err := s.statsService.GetVolumeHistory(user.ID, dto.VolumeStatsRequest{
		Period:   "weekly",
		DateFrom: fixture.DateFrom,
		DateTo:   fixture.DateTo,
	})
	require.NoError(s.T(), err)
	assert.Len(s.T(), items, 8)
	s.assertVolumePoints(fixture.WeeklyHistory, items)
}

func (s *StatsServiceSuite) TestGetVolumeHistory_Daily() {
	user, err := testutil.CreateTestUser(s.db, "stats-volume-daily@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	fixture, err := testutil.SeedStatsTestData(s.db, user.ID)
	require.NoError(s.T(), err)

	items, err := s.statsService.GetVolumeHistory(user.ID, dto.VolumeStatsRequest{
		Period:   "daily",
		DateFrom: fixture.DateFrom,
		DateTo:   fixture.DateTo,
	})
	require.NoError(s.T(), err)
	s.assertVolumePoints(fixture.DailyHistory, items)
}

func (s *StatsServiceSuite) TestGetVolumeHistory_Monthly() {
	user, err := testutil.CreateTestUser(s.db, "stats-volume-monthly@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	fixture, err := testutil.SeedStatsTestData(s.db, user.ID)
	require.NoError(s.T(), err)

	items, err := s.statsService.GetVolumeHistory(user.ID, dto.VolumeStatsRequest{
		Period:   "monthly",
		DateFrom: fixture.DateFrom,
		DateTo:   fixture.DateTo,
	})
	require.NoError(s.T(), err)
	s.assertVolumePoints(fixture.MonthlyHistory, items)
}

func (s *StatsServiceSuite) TestGetVolumeHistory_EmptyRange() {
	user, err := testutil.CreateTestUser(s.db, "stats-volume-empty@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	fixture, err := testutil.SeedStatsTestData(s.db, user.ID)
	require.NoError(s.T(), err)

	dateFrom := fixture.DateTo.AddDate(0, 1, 0)
	dateTo := dateFrom.AddDate(0, 0, 7)
	items, err := s.statsService.GetVolumeHistory(user.ID, dto.VolumeStatsRequest{
		Period:   "weekly",
		DateFrom: dateFrom,
		DateTo:   dateTo,
	})
	require.NoError(s.T(), err)
	assert.Empty(s.T(), items)
}

func (s *StatsServiceSuite) TestGetMuscleDistribution() {
	user, err := testutil.CreateTestUser(s.db, "stats-muscles@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	fixture, err := testutil.SeedStatsTestData(s.db, user.ID)
	require.NoError(s.T(), err)

	items, err := s.statsService.GetMuscleDistribution(user.ID, fixture.DateFrom, fixture.DateTo)
	require.NoError(s.T(), err)
	s.assertMuscleDistribution(fixture.FullRangeMuscleDistribution, items)

	quads := s.findMuscle(items, "quads")
	glutes := s.findMuscle(items, "glutes")
	require.NotNil(s.T(), quads)
	require.NotNil(s.T(), glutes)
	assert.Greater(s.T(), quads.Volume, 0.0)
	assert.Greater(s.T(), glutes.Volume, quads.Volume)
}

func (s *StatsServiceSuite) TestGetFrequencyStats_Streak() {
	user, err := testutil.CreateTestUser(s.db, "stats-frequency-streak@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	exercise := s.createStatsExercise(user.ID, "硬拉", []string{"back"})
	today := time.Now().UTC().Truncate(24 * time.Hour)

	for dayOffset := 7; dayOffset >= 3; dayOffset-- {
		startedAt := time.Date(today.AddDate(0, 0, -dayOffset).Year(), today.AddDate(0, 0, -dayOffset).Month(), today.AddDate(0, 0, -dayOffset).Day(), 7, 0, 0, 0, time.UTC)
		s.mustCreateStatsWorkout(user.ID, fmt.Sprintf("stats-streak-%d", dayOffset), startedAt, exercise.ID)
	}
	for _, dayOffset := range []int{1, 0} {
		startedAt := time.Date(today.AddDate(0, 0, -dayOffset).Year(), today.AddDate(0, 0, -dayOffset).Month(), today.AddDate(0, 0, -dayOffset).Day(), 18, 0, 0, 0, time.UTC)
		s.mustCreateStatsWorkout(user.ID, fmt.Sprintf("stats-streak-current-%d", dayOffset), startedAt, exercise.ID)
	}

	stats, err := s.statsService.GetFrequencyStats(user.ID)
	require.NoError(s.T(), err)
	require.NotNil(s.T(), stats)
	assert.Equal(s.T(), 2, stats.CurrentStreak)
	assert.Equal(s.T(), 5, stats.LongestStreak)
}

func (s *StatsServiceSuite) TestGetFrequencyStats_ByDayOfWeek() {
	user, err := testutil.CreateTestUser(s.db, "stats-frequency-day@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	exercise := s.createStatsExercise(user.ID, "推举", []string{"shoulders"})
	weekStart := s.statsWeekStart(time.Now().UTC())

	s.mustCreateStatsWorkout(user.ID, "stats-day-mon-1", weekStart.AddDate(0, 0, -14).Add(6*time.Hour), exercise.ID)
	s.mustCreateStatsWorkout(user.ID, "stats-day-mon-2", weekStart.AddDate(0, 0, -7).Add(12*time.Hour), exercise.ID)
	s.mustCreateStatsWorkout(user.ID, "stats-day-tue", weekStart.AddDate(0, 0, -6).Add(18*time.Hour), exercise.ID)
	s.mustCreateStatsWorkout(user.ID, "stats-day-sat", weekStart.AddDate(0, 0, -2).Add(9*time.Hour), exercise.ID)

	stats, err := s.statsService.GetFrequencyStats(user.ID)
	require.NoError(s.T(), err)
	require.NotNil(s.T(), stats)
	assert.Equal(s.T(), 2, stats.ByDayOfWeek["Mon"])
	assert.Equal(s.T(), 1, stats.ByDayOfWeek["Tue"])
	assert.Equal(s.T(), 1, stats.ByDayOfWeek["Sat"])
	assert.Equal(s.T(), 0, stats.ByDayOfWeek["Sun"])
}

func (s *StatsServiceSuite) TestGetFrequencyStats_ByTimeOfDay() {
	user, err := testutil.CreateTestUser(s.db, "stats-frequency-time@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	exercise := s.createStatsExercise(user.ID, "深蹲", []string{"quads"})
	baseDay := s.statsWeekStart(time.Now().UTC()).AddDate(0, 0, -14)

	s.mustCreateStatsWorkout(user.ID, "stats-time-morning-1", baseDay.Add(6*time.Hour), exercise.ID)
	s.mustCreateStatsWorkout(user.ID, "stats-time-morning-2", baseDay.Add(11*time.Hour), exercise.ID)
	s.mustCreateStatsWorkout(user.ID, "stats-time-afternoon", baseDay.Add(13*time.Hour), exercise.ID)
	s.mustCreateStatsWorkout(user.ID, "stats-time-evening-1", baseDay.Add(18*time.Hour), exercise.ID)
	s.mustCreateStatsWorkout(user.ID, "stats-time-evening-2", baseDay.Add(22*time.Hour), exercise.ID)

	stats, err := s.statsService.GetFrequencyStats(user.ID)
	require.NoError(s.T(), err)
	require.NotNil(s.T(), stats)
	assert.Equal(s.T(), 2, stats.ByTimeOfDay["morning"])
	assert.Equal(s.T(), 1, stats.ByTimeOfDay["afternoon"])
	assert.Equal(s.T(), 2, stats.ByTimeOfDay["evening"])
}

func (s *StatsServiceSuite) TestGetExerciseStats() {
	user, err := testutil.CreateTestUser(s.db, "stats-exercise@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	fixture, err := testutil.SeedStatsTestData(s.db, user.ID)
	require.NoError(s.T(), err)

	stats, err := s.statsService.GetExerciseStats(user.ID, fixture.TargetExercise.ExerciseID)
	require.NoError(s.T(), err)
	require.NotNil(s.T(), stats)
	assert.Equal(s.T(), fixture.TargetExercise.ExerciseID, stats.ExerciseID)
	assert.Equal(s.T(), fixture.TargetExercise.ExerciseName, stats.ExerciseName)
	assert.Equal(s.T(), fixture.TargetExercise.TotalSessions, stats.TotalSessions)
	s.assertVolumePoints(fixture.TargetExercise.VolumeHistory, stats.VolumeHistory)
	s.assertVolumePoints(fixture.TargetExercise.MaxWeightHistory, stats.MaxWeightHistory)
	require.NotNil(s.T(), stats.Estimated1RM)
	assert.InDelta(s.T(), fixture.TargetExercise.Estimated1RM, *stats.Estimated1RM, 0.001)
	s.assertPRRecords(fixture.TargetExercise.PersonalRecords, stats.PersonalRecords)
}

func (s *StatsServiceSuite) TestStatsQueryPerformance() {
	user, err := testutil.CreateTestUser(s.db, "stats-performance@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	fixture, err := testutil.SeedLargeStatsTestData(s.db, user.ID, 500)
	require.NoError(s.T(), err)

	serviceNoCache := NewStatsService(s.statsRepo, nil)
	_, _ = serviceNoCache.GetDashboard(user.ID)
	_, _ = serviceNoCache.GetVolumeHistory(user.ID, dto.VolumeStatsRequest{
		Period:   "weekly",
		DateFrom: fixture.DateFrom,
		DateTo:   fixture.DateTo,
	})
	_, _ = serviceNoCache.GetMuscleDistribution(user.ID, fixture.DateFrom, fixture.DateTo)
	_, _ = serviceNoCache.GetFrequencyStats(user.ID)
	_, _ = serviceNoCache.GetExerciseStats(user.ID, fixture.TargetExercise)

	s.assertQueryPerformance("dashboard", func() error {
		_, err := serviceNoCache.GetDashboard(user.ID)
		return err
	})
	s.assertQueryPerformance("volume_history", func() error {
		_, err := serviceNoCache.GetVolumeHistory(user.ID, dto.VolumeStatsRequest{
			Period:   "weekly",
			DateFrom: fixture.DateFrom,
			DateTo:   fixture.DateTo,
		})
		return err
	})
	s.assertQueryPerformance("muscle_distribution", func() error {
		_, err := serviceNoCache.GetMuscleDistribution(user.ID, fixture.DateFrom, fixture.DateTo)
		return err
	})
	s.assertQueryPerformance("frequency_stats", func() error {
		_, err := serviceNoCache.GetFrequencyStats(user.ID)
		return err
	})
	s.assertQueryPerformance("exercise_stats", func() error {
		_, err := serviceNoCache.GetExerciseStats(user.ID, fixture.TargetExercise)
		return err
	})
}

func (s *StatsServiceSuite) assertQueryPerformance(name string, query func() error) {
	s.T().Helper()

	startedAt := time.Now()
	err := query()
	duration := time.Since(startedAt)
	require.NoError(s.T(), err, name)
	assert.LessOrEqual(s.T(), duration, 200*time.Millisecond, name)
}

func (s *StatsServiceSuite) mustCreateStatsWorkout(userID uuid.UUID, clientID string, startedAt time.Time, exerciseID uuid.UUID) {
	s.T().Helper()

	finishedAt := startedAt.Add(45 * time.Minute)
	_, err := s.workoutService.Create(userID, dto.WorkoutFullData{
		ClientID:        clientID,
		StartedAt:       startedAt,
		FinishedAt:      &finishedAt,
		DurationSeconds: int(finishedAt.Sub(startedAt).Seconds()),
		Exercises: []dto.WorkoutExerciseData{
			s.statsWorkoutExerciseData(
				clientID+"-exercise",
				exerciseID,
				0,
				s.statsCompletedSetData(clientID+"-set", 1, 100, 5, "kg"),
			),
		},
	})
	require.NoError(s.T(), err)
}

func (s *StatsServiceSuite) createStatsExercise(userID uuid.UUID, name string, primaryMuscles []string) *model.Exercise {
	s.T().Helper()

	exercise := &model.Exercise{
		UserID:           &userID,
		Name:             name,
		NameEn:           s.statsStringPtr(name + " EN"),
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

func (s *StatsServiceSuite) statsWorkoutExerciseData(clientID string, exerciseID uuid.UUID, sortOrder int, sets ...dto.WorkoutSetData) dto.WorkoutExerciseData {
	return dto.WorkoutExerciseData{
		ClientID:   clientID,
		ExerciseID: exerciseID,
		SortOrder:  sortOrder,
		Sets:       sets,
	}
}

func (s *StatsServiceSuite) statsCompletedSetData(clientID string, setNumber int, weight float64, reps int, unit string) dto.WorkoutSetData {
	return dto.WorkoutSetData{
		ClientID:    clientID,
		SetNumber:   setNumber,
		Weight:      s.statsFloatPtr(weight),
		Reps:        s.statsIntPtr(reps),
		IsCompleted: true,
		Unit:        unit,
	}
}

func (s *StatsServiceSuite) assertVolumePoints(expected, actual []dto.VolumeDataPoint) {
	s.T().Helper()

	require.Len(s.T(), actual, len(expected))
	for index := range expected {
		assert.Equal(s.T(), expected[index].Date, actual[index].Date)
		assert.InDelta(s.T(), expected[index].Volume, actual[index].Volume, 0.001)
	}
}

func (s *StatsServiceSuite) assertMuscleDistribution(expected, actual []dto.MuscleVolumeData) {
	s.T().Helper()

	require.Len(s.T(), actual, len(expected))
	expectedMap := make(map[string]dto.MuscleVolumeData, len(expected))
	for _, item := range expected {
		expectedMap[item.Muscle] = item
	}
	for _, item := range actual {
		expectedItem, ok := expectedMap[item.Muscle]
		require.True(s.T(), ok, item.Muscle)
		assert.InDelta(s.T(), expectedItem.Volume, item.Volume, 0.001)
		assert.Equal(s.T(), expectedItem.Sets, item.Sets)
	}
}

func (s *StatsServiceSuite) assertPRRecords(expected, actual []dto.PRRecord) {
	s.T().Helper()

	require.Len(s.T(), actual, len(expected))
	for index := range expected {
		assert.Equal(s.T(), expected[index].ExerciseName, actual[index].ExerciseName)
		assert.Equal(s.T(), expected[index].PRType, actual[index].PRType)
		assert.InDelta(s.T(), expected[index].Value, actual[index].Value, 0.001)
		assert.Equal(s.T(), expected[index].Unit, actual[index].Unit)
		assert.True(s.T(), expected[index].AchievedAt.Equal(actual[index].AchievedAt))
	}
}

func (s *StatsServiceSuite) findMuscle(items []dto.MuscleVolumeData, muscle string) *dto.MuscleVolumeData {
	s.T().Helper()

	for index := range items {
		if items[index].Muscle == muscle {
			return &items[index]
		}
	}
	return nil
}

func (s *StatsServiceSuite) resetState() {
	if s.redisClient != nil {
		require.NoError(s.T(), s.redisClient.FlushDB(context.Background()).Err())
	}
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

func (s *StatsServiceSuite) statsWeekStart(value time.Time) time.Time {
	weekday := int(value.UTC().Weekday())
	if weekday == 0 {
		weekday = 7
	}
	day := time.Date(value.UTC().Year(), value.UTC().Month(), value.UTC().Day(), 0, 0, 0, 0, time.UTC)
	return day.AddDate(0, 0, -(weekday - 1))
}

func (s *StatsServiceSuite) statsStringPtr(value string) *string {
	return &value
}

func (s *StatsServiceSuite) statsIntPtr(value int) *int {
	return &value
}

func (s *StatsServiceSuite) statsFloatPtr(value float64) *float64 {
	return &value
}
