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

type ChallengeServiceSuite struct {
	suite.Suite
	db               *gorm.DB
	challengeService *ChallengeService
	workoutService   *WorkoutService
}

func TestChallengeServiceSuite(t *testing.T) {
	suite.Run(t, new(ChallengeServiceSuite))
}

func (s *ChallengeServiceSuite) SetupSuite() {
	s.db = testutil.SetupTestDB(s.T())
	challengeRepo := repository.NewChallengeRepository(s.db)
	workoutRepo := repository.NewWorkoutRepository(s.db)
	exerciseRepo := repository.NewExerciseRepository(s.db)
	s.challengeService = NewChallengeService(challengeRepo)
	s.workoutService = NewWorkoutService(workoutRepo, exerciseRepo, nil, nil, nil, nil)
}

func (s *ChallengeServiceSuite) TearDownSuite() {
	if s.db != nil {
		sqlDB, err := s.db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	}

	testutil.TearDown()
}

func (s *ChallengeServiceSuite) SetupTest() {
	s.resetState()
	s.T().Cleanup(s.resetState)
}

func (s *ChallengeServiceSuite) TestCreateChallenge() {
	user, err := testutil.CreateTestUser(s.db, "challenge-create@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	startDate := time.Now().UTC().AddDate(0, 0, -1)
	endDate := time.Now().UTC().AddDate(0, 0, 30)
	resp, err := s.challengeService.Create(user.ID, dto.CreateChallengeRequest{
		Type:        "volume",
		TargetValue: 50000,
		StartDate:   startDate,
		EndDate:     endDate,
	})
	require.NoError(s.T(), err)
	require.NotNil(s.T(), resp)
	assert.Equal(s.T(), "volume", resp.Type)
	assert.Zero(s.T(), resp.CurrentValue)
	assert.False(s.T(), resp.IsCompleted)
}

func (s *ChallengeServiceSuite) TestUpdateChallengeProgress_VolumeType() {
	user, err := testutil.CreateTestUser(s.db, "challenge-progress@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	exercise := s.createChallengeExercise(user.ID, "深蹲")

	startDate := time.Now().UTC().AddDate(0, 0, -1)
	endDate := time.Now().UTC().AddDate(0, 0, 30)
	_, err = s.challengeService.Create(user.ID, dto.CreateChallengeRequest{
		Type:        "volume",
		TargetValue: 50000,
		StartDate:   startDate,
		EndDate:     endDate,
	})
	require.NoError(s.T(), err)

	s.createChallengeWorkout(user.ID, exercise.ID, "challenge-progress-workout", time.Now().UTC().Add(-1*time.Hour), 100, 50)

	items, err := s.challengeService.List(user.ID, dto.ChallengeFilter{Status: "active"})
	require.NoError(s.T(), err)
	require.Len(s.T(), items, 1)
	assert.InDelta(s.T(), 5000, items[0].CurrentValue, 0.001)
	assert.False(s.T(), items[0].IsCompleted)
}

func (s *ChallengeServiceSuite) TestChallengeCompletion() {
	user, err := testutil.CreateTestUser(s.db, "challenge-complete@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	exercise := s.createChallengeExercise(user.ID, "硬拉")

	startDate := time.Now().UTC().AddDate(0, 0, -1)
	endDate := time.Now().UTC().AddDate(0, 0, 30)
	created, err := s.challengeService.Create(user.ID, dto.CreateChallengeRequest{
		Type:        "volume",
		TargetValue: 5000,
		StartDate:   startDate,
		EndDate:     endDate,
	})
	require.NoError(s.T(), err)

	s.createChallengeWorkout(user.ID, exercise.ID, "challenge-complete-workout", time.Now().UTC().Add(-1*time.Hour), 100, 50)

	items, err := s.challengeService.List(user.ID, dto.ChallengeFilter{})
	require.NoError(s.T(), err)
	require.Len(s.T(), items, 1)
	assert.Equal(s.T(), created.ID, items[0].ID)
	assert.InDelta(s.T(), 5000, items[0].CurrentValue, 0.001)
	assert.True(s.T(), items[0].IsCompleted)
}

func (s *ChallengeServiceSuite) TestChallengeExpired() {
	user, err := testutil.CreateTestUser(s.db, "challenge-expired@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	startDate := time.Now().UTC().AddDate(0, 0, -10)
	endDate := time.Now().UTC().AddDate(0, 0, -1)
	created, err := s.challengeService.Create(user.ID, dto.CreateChallengeRequest{
		Type:        "volume",
		TargetValue: 5000,
		StartDate:   startDate,
		EndDate:     endDate,
	})
	require.NoError(s.T(), err)

	items, err := s.challengeService.List(user.ID, dto.ChallengeFilter{Status: "active"})
	require.NoError(s.T(), err)
	require.Len(s.T(), items, 1)
	assert.Equal(s.T(), created.ID, items[0].ID)
	assert.False(s.T(), items[0].IsCompleted)
	assert.Zero(s.T(), items[0].CurrentValue)
	assert.True(s.T(), items[0].EndDate.Before(time.Now().UTC()))
}

func (s *ChallengeServiceSuite) createChallengeExercise(userID uuid.UUID, name string) *model.Exercise {
	s.T().Helper()

	exercise := &model.Exercise{
		UserID:           &userID,
		Name:             name,
		NameEn:           s.challengeStringPtr(name + " EN"),
		Category:         enum.ExerciseCategoryStrength,
		PrimaryMuscles:   model.StringArray{"back"},
		SecondaryMuscles: model.StringArray{"glutes"},
		Equipment:        enum.EquipmentBarbell,
		TrackingType:     enum.TrackingTypeWeightReps,
		IsCustom:         true,
	}
	require.NoError(s.T(), s.db.Create(exercise).Error)
	return exercise
}

func (s *ChallengeServiceSuite) createChallengeWorkout(userID, exerciseID uuid.UUID, clientID string, startedAt time.Time, weight float64, reps int) {
	s.T().Helper()

	finishedAt := startedAt.Add(45 * time.Minute)
	_, err := s.workoutService.Create(userID, dto.WorkoutFullData{
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
						Weight:      s.challengeFloatPtr(weight),
						Reps:        s.challengeIntPtr(reps),
						IsCompleted: true,
						Unit:        "kg",
						CompletedAt: s.challengeTimePtr(startedAt.Add(10 * time.Minute)),
					},
				},
			},
		},
	})
	require.NoError(s.T(), err)
}

func (s *ChallengeServiceSuite) resetState() {
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

func (s *ChallengeServiceSuite) challengeStringPtr(value string) *string {
	return &value
}

func (s *ChallengeServiceSuite) challengeFloatPtr(value float64) *float64 {
	return &value
}

func (s *ChallengeServiceSuite) challengeIntPtr(value int) *int {
	return &value
}

func (s *ChallengeServiceSuite) challengeTimePtr(value time.Time) *time.Time {
	return &value
}
