package service

import (
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
	"wsTrack/server/internal/repository"
	"wsTrack/server/internal/testutil"
)

type PRServiceSuite struct {
	suite.Suite
	db             *gorm.DB
	prService      *PRService
	workoutService *WorkoutService
}

func TestPRServiceSuite(t *testing.T) {
	suite.Run(t, new(PRServiceSuite))
}

func (s *PRServiceSuite) SetupSuite() {
	s.db = testutil.SetupTestDB(s.T())
	personalRecords := repository.NewPersonalRecordRepository(s.db)
	workoutRepo := repository.NewWorkoutRepository(s.db)
	exerciseRepo := repository.NewExerciseRepository(s.db)
	s.prService = NewPRService(personalRecords)
	s.workoutService = NewWorkoutService(workoutRepo, exerciseRepo, nil, nil, nil, nil)
}

func (s *PRServiceSuite) TearDownSuite() {
	if s.db != nil {
		sqlDB, err := s.db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	}

	testutil.TearDown()
}

func (s *PRServiceSuite) SetupTest() {
	s.resetState()
	s.T().Cleanup(s.resetState)
}

func (s *PRServiceSuite) TestCheckPR_NewMaxWeight() {
	user, err := testutil.CreateTestUser(s.db, "pr-max-weight@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	exercise := s.createPRExercise(user.ID, "杠铃卧推")

	s.createSingleSetWorkout(user.ID, exercise.ID, "pr-max-weight-1", time.Date(2026, 3, 1, 9, 0, 0, 0, time.UTC), 100, 5)
	s.rebuildPRs(user.ID, exercise.ID)
	second := s.createSingleSetWorkout(user.ID, exercise.ID, "pr-max-weight-2", time.Date(2026, 3, 2, 9, 0, 0, 0, time.UTC), 105, 5)
	s.rebuildPRs(user.ID, exercise.ID)

	records, err := s.prService.List(user.ID, &exercise.ID)
	require.NoError(s.T(), err)
	maxWeightRecords := s.filterPRRecords(records, "max_weight")
	require.Len(s.T(), maxWeightRecords, 2)
	assert.InDelta(s.T(), 105, maxWeightRecords[0].Value, 0.001)
	assert.True(s.T(), s.workoutSetPRFlag(second))
}

func (s *PRServiceSuite) TestCheckPR_NoRecord() {
	user, err := testutil.CreateTestUser(s.db, "pr-no-record@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	exercise := s.createPRExercise(user.ID, "硬拉")

	s.createSingleSetWorkout(user.ID, exercise.ID, "pr-no-record-1", time.Date(2026, 3, 1, 9, 0, 0, 0, time.UTC), 100, 5)
	s.rebuildPRs(user.ID, exercise.ID)
	second := s.createSingleSetWorkout(user.ID, exercise.ID, "pr-no-record-2", time.Date(2026, 3, 2, 9, 0, 0, 0, time.UTC), 95, 5)
	s.rebuildPRs(user.ID, exercise.ID)

	records, err := s.prService.List(user.ID, &exercise.ID)
	require.NoError(s.T(), err)
	maxWeightRecords := s.filterPRRecords(records, "max_weight")
	require.Len(s.T(), maxWeightRecords, 1)
	assert.InDelta(s.T(), 100, maxWeightRecords[0].Value, 0.001)
	assert.False(s.T(), s.workoutSetPRFlag(second))
}

func (s *PRServiceSuite) TestCheckPR_NewEstimated1RM() {
	user, err := testutil.CreateTestUser(s.db, "pr-e1rm@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	exercise := s.createPRExercise(user.ID, "上斜卧推")

	s.createSingleSetWorkout(user.ID, exercise.ID, "pr-e1rm-1", time.Date(2026, 3, 1, 9, 0, 0, 0, time.UTC), 100, 5)
	s.rebuildPRs(user.ID, exercise.ID)
	second := s.createSingleSetWorkout(user.ID, exercise.ID, "pr-e1rm-2", time.Date(2026, 3, 2, 9, 0, 0, 0, time.UTC), 95, 8)
	s.rebuildPRs(user.ID, exercise.ID)

	records, err := s.prService.List(user.ID, &exercise.ID)
	require.NoError(s.T(), err)
	e1rmRecords := s.filterPRRecords(records, "estimated_1rm")
	require.Len(s.T(), e1rmRecords, 2)
	assert.InDelta(s.T(), 120.333333, e1rmRecords[0].Value, 0.001)
	maxWeightRecords := s.filterPRRecords(records, "max_weight")
	require.Len(s.T(), maxWeightRecords, 1)
	assert.InDelta(s.T(), 100, maxWeightRecords[0].Value, 0.001)
	assert.True(s.T(), s.workoutSetPRFlag(second))
}

func (s *PRServiceSuite) TestCheckPR_FirstWorkout() {
	user, err := testutil.CreateTestUser(s.db, "pr-first-workout@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	exercise := s.createPRExercise(user.ID, "推举")

	first := s.createSingleSetWorkout(user.ID, exercise.ID, "pr-first-1", time.Date(2026, 3, 1, 9, 0, 0, 0, time.UTC), 90, 8)
	s.rebuildPRs(user.ID, exercise.ID)

	records, err := s.prService.List(user.ID, &exercise.ID)
	require.NoError(s.T(), err)
	assert.Len(s.T(), records, 4)
	assert.ElementsMatch(s.T(), []string{"estimated_1rm", "max_reps", "max_volume", "max_weight"}, s.prTypes(records))
	assert.True(s.T(), s.workoutSetPRFlag(first))
}

func (s *PRServiceSuite) TestGetPRHistory() {
	user, err := testutil.CreateTestUser(s.db, "pr-history@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	bench := s.createPRExercise(user.ID, "杠铃卧推")
	row := s.createPRExercise(user.ID, "杠铃划船")

	s.createSingleSetWorkout(user.ID, bench.ID, "pr-history-1", time.Date(2026, 3, 1, 9, 0, 0, 0, time.UTC), 90, 8)
	s.createSingleSetWorkout(user.ID, bench.ID, "pr-history-2", time.Date(2026, 3, 2, 9, 0, 0, 0, time.UTC), 95, 8)
	s.createSingleSetWorkout(user.ID, row.ID, "pr-history-3", time.Date(2026, 3, 3, 9, 0, 0, 0, time.UTC), 80, 10)
	s.rebuildPRs(user.ID, bench.ID)
	s.rebuildPRs(user.ID, row.ID)

	allRecords, err := s.prService.List(user.ID, nil)
	require.NoError(s.T(), err)
	require.NotEmpty(s.T(), allRecords)
	for index := 1; index < len(allRecords); index++ {
		assert.True(s.T(), allRecords[index-1].AchievedAt.After(allRecords[index].AchievedAt) || allRecords[index-1].AchievedAt.Equal(allRecords[index].AchievedAt))
	}

	benchRecords, err := s.prService.List(user.ID, &bench.ID)
	require.NoError(s.T(), err)
	require.NotEmpty(s.T(), benchRecords)
	for _, record := range benchRecords {
		assert.Equal(s.T(), "杠铃卧推", record.ExerciseName)
	}
}

func (s *PRServiceSuite) createPRExercise(userID uuid.UUID, name string) *model.Exercise {
	s.T().Helper()

	exercise := &model.Exercise{
		UserID:           &userID,
		Name:             name,
		NameEn:           s.prStringPtr(name + " EN"),
		Category:         enum.ExerciseCategoryStrength,
		PrimaryMuscles:   model.StringArray{"chest"},
		SecondaryMuscles: model.StringArray{"triceps"},
		Equipment:        enum.EquipmentBarbell,
		TrackingType:     enum.TrackingTypeWeightReps,
		IsCustom:         true,
	}
	require.NoError(s.T(), s.db.Create(exercise).Error)
	return exercise
}

func (s *PRServiceSuite) createSingleSetWorkout(userID, exerciseID uuid.UUID, clientID string, startedAt time.Time, weight float64, reps int) uuid.UUID {
	s.T().Helper()

	finishedAt := startedAt.Add(45 * time.Minute)
	resp, err := s.workoutService.Create(userID, dto.WorkoutFullData{
		ClientID:        clientID,
		StartedAt:       startedAt,
		FinishedAt:      &finishedAt,
		DurationSeconds: int(finishedAt.Sub(startedAt).Seconds()),
		Exercises: []dto.WorkoutExerciseData{
			{
				ClientID:   clientID + "-exercise",
				ExerciseID: exerciseID,
				Sets: []dto.WorkoutSetData{
					{
						ClientID:    clientID + "-set",
						SetNumber:   1,
						Weight:      s.prFloatPtr(weight),
						Reps:        s.prIntPtr(reps),
						IsCompleted: true,
						Unit:        "kg",
						CompletedAt: s.prTimePtr(startedAt.Add(10 * time.Minute)),
					},
				},
			},
		},
	})
	require.NoError(s.T(), err)
	require.Len(s.T(), resp.Exercises, 1)
	require.Len(s.T(), resp.Exercises[0].Sets, 1)
	return resp.Exercises[0].Sets[0].ID
}

func (s *PRServiceSuite) rebuildPRs(userID, exerciseID uuid.UUID) {
	s.T().Helper()
	require.NoError(s.T(), s.prService.RebuildForExercises(userID, []uuid.UUID{exerciseID}))
}

func (s *PRServiceSuite) workoutSetPRFlag(workoutSetID uuid.UUID) bool {
	s.T().Helper()

	var workoutSet model.WorkoutSet
	require.NoError(s.T(), s.db.First(&workoutSet, "id = ?", workoutSetID).Error)
	return workoutSet.IsPR
}

func (s *PRServiceSuite) filterPRRecords(items []dto.PRRecord, prType string) []dto.PRRecord {
	s.T().Helper()

	filtered := make([]dto.PRRecord, 0)
	for _, item := range items {
		if item.PRType == prType {
			filtered = append(filtered, item)
		}
	}
	return filtered
}

func (s *PRServiceSuite) prTypes(items []dto.PRRecord) []string {
	s.T().Helper()

	result := make([]string, 0, len(items))
	for _, item := range items {
		result = append(result, item.PRType)
	}
	return result
}

func (s *PRServiceSuite) resetState() {
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

func (s *PRServiceSuite) prStringPtr(value string) *string {
	return &value
}

func (s *PRServiceSuite) prIntPtr(value int) *int {
	return &value
}

func (s *PRServiceSuite) prFloatPtr(value float64) *float64 {
	return &value
}

func (s *PRServiceSuite) prTimePtr(value time.Time) *time.Time {
	return &value
}
