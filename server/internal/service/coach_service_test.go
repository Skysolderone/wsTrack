package service

import (
	"errors"
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
)

type CoachServiceSuite struct {
	suite.Suite
	db             *gorm.DB
	coachService   *CoachService
	workoutService *WorkoutService
}

func TestCoachServiceSuite(t *testing.T) {
	suite.Run(t, new(CoachServiceSuite))
}

func (s *CoachServiceSuite) SetupSuite() {
	s.db = testutil.SetupTestDB(s.T())
	userRepo := repository.NewUserRepository(s.db)
	coachRepo := repository.NewCoachRepository(s.db)
	planRepo := repository.NewPlanRepository(s.db)
	workoutRepo := repository.NewWorkoutRepository(s.db)
	exerciseRepo := repository.NewExerciseRepository(s.db)
	statsRepo := repository.NewStatsRepository(s.db)
	statsService := NewStatsService(statsRepo, nil)
	s.coachService = NewCoachService(userRepo, coachRepo, planRepo, workoutRepo, statsService)
	s.workoutService = NewWorkoutService(workoutRepo, exerciseRepo, nil, nil, nil, nil)
}

func (s *CoachServiceSuite) TearDownSuite() {
	if s.db != nil {
		sqlDB, err := s.db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	}

	testutil.TearDown()
}

func (s *CoachServiceSuite) SetupTest() {
	s.resetState()
	s.T().Cleanup(s.resetState)
}

func (s *CoachServiceSuite) TestSendInvitation() {
	coach := s.createCoachUser("coach-invite@example.com")

	resp, err := s.coachService.Invite(coach.ID, dto.InviteClientRequest{
		ClientEmail: "client@example.com",
	})
	require.NoError(s.T(), err)
	require.NotNil(s.T(), resp)
	assert.Equal(s.T(), "pending", resp.Status)
	assert.Equal(s.T(), coach.ID, resp.CoachID)

	var invitation model.CoachInvitation
	require.NoError(s.T(), s.db.First(&invitation, "id = ?", resp.ID).Error)
	assert.Equal(s.T(), "pending", invitation.Status)
}

func (s *CoachServiceSuite) TestAcceptInvitation() {
	coach := s.createCoachUser("coach-accept@example.com")
	client, err := testutil.CreateTestUser(s.db, "client-accept@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	invitation, err := s.coachService.Invite(coach.ID, dto.InviteClientRequest{
		ClientEmail: client.Email,
	})
	require.NoError(s.T(), err)

	resp, err := s.coachService.AcceptInvitation(client.ID, invitation.ID)
	require.NoError(s.T(), err)
	require.NotNil(s.T(), resp)
	assert.Equal(s.T(), "active", resp.Status)
	assert.Equal(s.T(), coach.ID, resp.CoachID)

	var relation model.CoachClient
	require.NoError(s.T(), s.db.First(&relation, "coach_id = ? AND client_id = ?", coach.ID, client.ID).Error)
	assert.Equal(s.T(), "active", relation.Status)

	var updatedInvitation model.CoachInvitation
	require.NoError(s.T(), s.db.First(&updatedInvitation, "id = ?", invitation.ID).Error)
	assert.Equal(s.T(), "accepted", updatedInvitation.Status)
}

func (s *CoachServiceSuite) TestRejectInvitation() {
	coach := s.createCoachUser("coach-reject@example.com")
	client, err := testutil.CreateTestUser(s.db, "client-reject@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	invitation, err := s.coachService.Invite(coach.ID, dto.InviteClientRequest{
		ClientEmail: client.Email,
	})
	require.NoError(s.T(), err)

	err = s.coachService.RejectInvitation(client.ID, invitation.ID)
	require.NoError(s.T(), err)

	var updatedInvitation model.CoachInvitation
	require.NoError(s.T(), s.db.First(&updatedInvitation, "id = ?", invitation.ID).Error)
	assert.Equal(s.T(), "rejected", updatedInvitation.Status)

	var relationCount int64
	require.NoError(s.T(), s.db.Model(&model.CoachClient{}).Where("coach_id = ? AND client_id = ?", coach.ID, client.ID).Count(&relationCount).Error)
	assert.Zero(s.T(), relationCount)
}

func (s *CoachServiceSuite) TestCoachViewClientWorkouts() {
	coach := s.createCoachUser("coach-view@example.com")
	client, err := testutil.CreateTestUser(s.db, "client-view@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	otherClient, err := testutil.CreateTestUser(s.db, "client-other@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	s.createCoachRelation(coach.ID, client.ID)

	clientExercise := s.createCoachExercise(client.ID, "卧推")
	otherExercise := s.createCoachExercise(otherClient.ID, "深蹲")
	clientWorkout := s.createCoachWorkout(client.ID, clientExercise.ID, "coach-view-client-workout", time.Date(2026, 3, 1, 9, 0, 0, 0, time.UTC))
	s.createCoachWorkout(otherClient.ID, otherExercise.ID, "coach-view-other-workout", time.Date(2026, 3, 2, 9, 0, 0, 0, time.UTC))

	items, total, err := s.coachService.ListClientWorkouts(coach.ID, client.ID, dto.WorkoutFilter{})
	require.NoError(s.T(), err)
	assert.Equal(s.T(), int64(1), total)
	require.Len(s.T(), items, 1)
	assert.Equal(s.T(), clientWorkout.ID, items[0].ID)
}

func (s *CoachServiceSuite) TestCoachAddComment() {
	coach := s.createCoachUser("coach-comment@example.com")
	client, err := testutil.CreateTestUser(s.db, "client-comment@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	s.createCoachRelation(coach.ID, client.ID)
	exercise := s.createCoachExercise(client.ID, "硬拉")
	workout := s.createCoachWorkout(client.ID, exercise.ID, "coach-comment-workout", time.Date(2026, 3, 1, 9, 0, 0, 0, time.UTC))

	resp, err := s.coachService.AddWorkoutComment(coach.ID, workout.ID, dto.WorkoutCommentRequest{
		Comment: "动作节奏不错，下一次加 2.5kg。",
	})
	require.NoError(s.T(), err)
	require.NotNil(s.T(), resp)
	assert.Equal(s.T(), coach.ID, resp.CoachID)
	assert.Equal(s.T(), workout.ID, resp.WorkoutID)
	assert.Equal(s.T(), "动作节奏不错，下一次加 2.5kg。", resp.Comment)

	var comment model.WorkoutComment
	require.NoError(s.T(), s.db.First(&comment, "id = ?", resp.ID).Error)
	assert.Equal(s.T(), coach.ID, comment.CoachID)
	assert.Equal(s.T(), workout.ID, comment.WorkoutID)
}

func (s *CoachServiceSuite) TestNonCoachAccessCoachAPI() {
	user, err := testutil.CreateTestUser(s.db, "plain-user@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	resp, err := s.coachService.Invite(user.ID, dto.InviteClientRequest{
		ClientEmail: "client@example.com",
	})
	assert.Nil(s.T(), resp)
	appErr := s.requireCoachAppError(err)
	assert.Equal(s.T(), 403, appErr.HTTPStatus)
	assert.Equal(s.T(), apperrors.CodeForbidden, appErr.Code)
}

func (s *CoachServiceSuite) TestCoachAccessUnrelatedClient() {
	coach := s.createCoachUser("coach-unrelated@example.com")
	client, err := testutil.CreateTestUser(s.db, "client-unrelated@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	items, total, err := s.coachService.ListClientWorkouts(coach.ID, client.ID, dto.WorkoutFilter{})
	assert.Nil(s.T(), items)
	assert.Zero(s.T(), total)
	appErr := s.requireCoachAppError(err)
	assert.Equal(s.T(), 404, appErr.HTTPStatus)
	assert.Equal(s.T(), apperrors.CodeNotFound, appErr.Code)
}

func (s *CoachServiceSuite) createCoachUser(email string) *model.User {
	s.T().Helper()

	user, err := testutil.CreateTestUser(s.db, email, "StrongPass123")
	require.NoError(s.T(), err)
	user.Role = "coach"
	user.Nickname = "Coach " + email
	require.NoError(s.T(), s.db.Save(user).Error)
	return user
}

func (s *CoachServiceSuite) createCoachRelation(coachID, clientID uuid.UUID) {
	s.T().Helper()

	relation := &model.CoachClient{
		CoachID:  coachID,
		ClientID: clientID,
		Status:   "active",
	}
	require.NoError(s.T(), s.db.Create(relation).Error)
}

func (s *CoachServiceSuite) createCoachExercise(userID uuid.UUID, name string) *model.Exercise {
	s.T().Helper()

	exercise := &model.Exercise{
		UserID:           &userID,
		Name:             name,
		NameEn:           s.coachStringPtr(name + " EN"),
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

func (s *CoachServiceSuite) createCoachWorkout(userID, exerciseID uuid.UUID, clientID string, startedAt time.Time) *dto.WorkoutDetailResponse {
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
						Weight:      s.coachFloatPtr(100),
						Reps:        s.coachIntPtr(5),
						IsCompleted: true,
						Unit:        "kg",
						CompletedAt: s.coachTimePtr(startedAt.Add(10 * time.Minute)),
					},
				},
			},
		},
	})
	require.NoError(s.T(), err)
	return resp
}

func (s *CoachServiceSuite) requireCoachAppError(err error) *apperrors.AppError {
	s.T().Helper()

	require.Error(s.T(), err)
	var appErr *apperrors.AppError
	require.True(s.T(), errors.As(err, &appErr))
	return appErr
}

func (s *CoachServiceSuite) resetState() {
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

func (s *CoachServiceSuite) coachStringPtr(value string) *string {
	return &value
}

func (s *CoachServiceSuite) coachFloatPtr(value float64) *float64 {
	return &value
}

func (s *CoachServiceSuite) coachIntPtr(value int) *int {
	return &value
}

func (s *CoachServiceSuite) coachTimePtr(value time.Time) *time.Time {
	return &value
}
