package service

import (
	"errors"
	"testing"

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

type PlanServiceSuite struct {
	suite.Suite
	db               *gorm.DB
	exerciseRepo     repository.ExerciseRepository
	planRepo         repository.PlanRepository
	planDayRepo      repository.PlanDayRepository
	planExerciseRepo repository.PlanExerciseRepository
	planService      *PlanService
}

func TestPlanServiceSuite(t *testing.T) {
	suite.Run(t, new(PlanServiceSuite))
}

func (s *PlanServiceSuite) SetupSuite() {
	s.db = testutil.SetupTestDB(s.T())
	s.exerciseRepo = repository.NewExerciseRepository(s.db)
	s.planRepo = repository.NewPlanRepository(s.db)
	s.planDayRepo = repository.NewPlanDayRepository(s.db)
	s.planExerciseRepo = repository.NewPlanExerciseRepository(s.db)
	s.planService = NewPlanService(s.planRepo, s.planDayRepo, s.planExerciseRepo, s.exerciseRepo)
}

func (s *PlanServiceSuite) TearDownSuite() {
	if s.db != nil {
		sqlDB, err := s.db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	}

	testutil.TearDown()
}

func (s *PlanServiceSuite) SetupTest() {
	s.resetState()
	s.T().Cleanup(s.resetState)
}

func (s *PlanServiceSuite) TestCreatePlan_Success() {
	user, err := testutil.CreateTestUser(s.db, "plan-create@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	goal := "strength"
	resp, err := s.planService.Create(user.ID, dto.CreatePlanRequest{
		Name: "推举计划",
		Goal: &goal,
	})
	require.NoError(s.T(), err)
	require.NotNil(s.T(), resp)
	assert.NotEqual(s.T(), uuid.Nil, resp.ID)
	assert.Equal(s.T(), "推举计划", resp.Name)
	assert.False(s.T(), resp.IsActive)
	require.NotNil(s.T(), resp.Goal)
	assert.Equal(s.T(), goal, *resp.Goal)

	plan, err := s.planRepo.FindByID(resp.ID, user.ID)
	require.NoError(s.T(), err)
	require.NotNil(s.T(), plan)
	assert.False(s.T(), plan.IsActive)
}

func (s *PlanServiceSuite) TestGetPlanDetail_NestedPreload() {
	user, err := testutil.CreateTestUser(s.db, "plan-detail@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	plan := s.mustCreatePlan(user.ID, "PPL")
	days := s.mustAddPlanDays(user.ID, plan.ID, "Push", "Pull")
	day1, day2 := days[0], days[1]
	exercises := s.mustCreateExercises(
		user.ID,
		"杠铃卧推",
		"上斜卧推",
		"绳索夹胸",
		"杠铃划船",
		"高位下拉",
		"坐姿划船",
	)

	s.mustAddPlanExercise(user.ID, day1.ID, exercises[0].ID, 4, "5-8", 120, nil)
	s.mustAddPlanExercise(user.ID, day1.ID, exercises[1].ID, 3, "8-10", 90, nil)
	s.mustAddPlanExercise(user.ID, day1.ID, exercises[2].ID, 3, "12-15", 60, nil)
	s.mustAddPlanExercise(user.ID, day2.ID, exercises[3].ID, 4, "6-8", 120, nil)
	s.mustAddPlanExercise(user.ID, day2.ID, exercises[4].ID, 3, "8-12", 90, nil)
	s.mustAddPlanExercise(user.ID, day2.ID, exercises[5].ID, 3, "10-12", 75, nil)

	detail, err := s.planService.GetByID(plan.ID, user.ID)
	require.NoError(s.T(), err)
	require.NotNil(s.T(), detail)
	require.Len(s.T(), detail.Days, 2)
	require.Len(s.T(), detail.Days[0].Exercises, 3)
	require.Len(s.T(), detail.Days[1].Exercises, 3)

	assert.Equal(s.T(), "Push", detail.Days[0].Name)
	assert.Equal(s.T(), "Pull", detail.Days[1].Name)
	assert.Equal(s.T(), "杠铃卧推", detail.Days[0].Exercises[0].Exercise.Name)
	assert.Equal(s.T(), "chest", detail.Days[0].Exercises[0].Exercise.PrimaryMuscles[0])
	assert.Equal(s.T(), "strength", detail.Days[0].Exercises[0].Exercise.Category)
	assert.Equal(s.T(), "杠铃划船", detail.Days[1].Exercises[0].Exercise.Name)
	assert.Equal(s.T(), "back", detail.Days[1].Exercises[0].Exercise.PrimaryMuscles[0])
}

func (s *PlanServiceSuite) TestAddDay_SortOrder() {
	user, err := testutil.CreateTestUser(s.db, "plan-day-sort@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	plan := s.mustCreatePlan(user.ID, "四分化")
	days := s.mustAddPlanDays(user.ID, plan.ID, "Day 1", "Day 2", "Day 3")
	day1, day2, day3 := days[0], days[1], days[2]

	assert.Equal(s.T(), 0, day1.SortOrder)
	assert.Equal(s.T(), 1, day2.SortOrder)
	assert.Equal(s.T(), 2, day3.SortOrder)
}

func (s *PlanServiceSuite) TestAddExerciseToDay() {
	user, err := testutil.CreateTestUser(s.db, "plan-add-ex@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	plan := s.mustCreatePlan(user.ID, "增肌计划")
	days := s.mustAddPlanDays(user.ID, plan.ID, "Push")
	day := days[0]
	exercise := s.mustCreateExercises(user.ID, "杠铃卧推")[0]
	targetReps := "8-12"
	restSeconds := 90

	resp, err := s.planService.AddExercise(day.ID, user.ID, dto.AddPlanExerciseRequest{
		ExerciseID:  exercise.ID,
		TargetSets:  4,
		TargetReps:  &targetReps,
		RestSeconds: &restSeconds,
	})
	require.NoError(s.T(), err)
	require.NotNil(s.T(), resp)
	assert.Equal(s.T(), 4, resp.TargetSets)
	require.NotNil(s.T(), resp.TargetReps)
	assert.Equal(s.T(), targetReps, *resp.TargetReps)
	require.NotNil(s.T(), resp.RestSeconds)
	assert.Equal(s.T(), restSeconds, *resp.RestSeconds)
	assert.Equal(s.T(), exercise.ID, resp.Exercise.ID)
}

func (s *PlanServiceSuite) TestReorderExercises() {
	user, err := testutil.CreateTestUser(s.db, "plan-reorder@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	plan := s.mustCreatePlan(user.ID, "重排计划")
	days := s.mustAddPlanDays(user.ID, plan.ID, "Day 1")
	day := days[0]
	exercises := s.mustCreateExercises(user.ID, "动作 A", "动作 B", "动作 C")

	exA := s.mustAddPlanExercise(user.ID, day.ID, exercises[0].ID, 3, "8-10", 90, nil)
	exB := s.mustAddPlanExercise(user.ID, day.ID, exercises[1].ID, 3, "8-10", 90, nil)
	exC := s.mustAddPlanExercise(user.ID, day.ID, exercises[2].ID, 3, "8-10", 90, nil)

	err = s.planService.ReorderExercises(day.ID, user.ID, []uuid.UUID{exC.ID, exA.ID, exB.ID})
	require.NoError(s.T(), err)

	detail, err := s.planService.GetByID(plan.ID, user.ID)
	require.NoError(s.T(), err)
	require.Len(s.T(), detail.Days, 1)
	require.Len(s.T(), detail.Days[0].Exercises, 3)

	assert.Equal(s.T(), "动作 C", detail.Days[0].Exercises[0].Exercise.Name)
	assert.Equal(s.T(), "动作 A", detail.Days[0].Exercises[1].Exercise.Name)
	assert.Equal(s.T(), "动作 B", detail.Days[0].Exercises[2].Exercise.Name)
	assert.Equal(s.T(), 0, detail.Days[0].Exercises[0].SortOrder)
	assert.Equal(s.T(), 1, detail.Days[0].Exercises[1].SortOrder)
	assert.Equal(s.T(), 2, detail.Days[0].Exercises[2].SortOrder)
}

func (s *PlanServiceSuite) TestReorderExercises_InvalidIDs() {
	user, err := testutil.CreateTestUser(s.db, "plan-reorder-invalid@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	plan := s.mustCreatePlan(user.ID, "重排错误")
	days := s.mustAddPlanDays(user.ID, plan.ID, "Day 1", "Day 2")
	day1, day2 := days[0], days[1]
	exercises := s.mustCreateExercises(user.ID, "动作 A", "动作 B")
	ex1 := s.mustAddPlanExercise(user.ID, day1.ID, exercises[0].ID, 3, "8-10", 90, nil)
	ex2 := s.mustAddPlanExercise(user.ID, day2.ID, exercises[1].ID, 3, "8-10", 90, nil)

	err = s.planService.ReorderExercises(day1.ID, user.ID, []uuid.UUID{ex1.ID, ex2.ID})
	appErr := requirePlanAppError(s.T(), err)
	assert.Equal(s.T(), 404, appErr.HTTPStatus)
}

func (s *PlanServiceSuite) TestDuplicatePlan_DeepCopy() {
	user, err := testutil.CreateTestUser(s.db, "plan-dup@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	plan := s.mustCreatePlan(user.ID, "原计划")
	days := s.mustAddPlanDays(user.ID, plan.ID, "Push", "Pull")
	day1, day2 := days[0], days[1]
	exercises := s.mustCreateExercises(user.ID, "动作 1", "动作 2", "动作 3", "动作 4", "动作 5", "动作 6")

	s.mustAddPlanExercise(user.ID, day1.ID, exercises[0].ID, 4, "6-8", 120, nil)
	s.mustAddPlanExercise(user.ID, day1.ID, exercises[1].ID, 3, "8-10", 90, nil)
	s.mustAddPlanExercise(user.ID, day1.ID, exercises[2].ID, 3, "10-12", 60, nil)
	s.mustAddPlanExercise(user.ID, day2.ID, exercises[3].ID, 4, "6-8", 120, nil)
	s.mustAddPlanExercise(user.ID, day2.ID, exercises[4].ID, 3, "8-10", 90, nil)
	s.mustAddPlanExercise(user.ID, day2.ID, exercises[5].ID, 3, "10-12", 60, nil)

	original, err := s.planService.GetByID(plan.ID, user.ID)
	require.NoError(s.T(), err)

	duplicated, err := s.planService.Duplicate(plan.ID, user.ID)
	require.NoError(s.T(), err)
	require.NotNil(s.T(), duplicated)
	assert.NotEqual(s.T(), original.ID, duplicated.ID)
	assert.Equal(s.T(), "原计划 (副本)", duplicated.Name)
	require.Len(s.T(), duplicated.Days, 2)

	for index := range original.Days {
		assert.NotEqual(s.T(), original.Days[index].ID, duplicated.Days[index].ID)
		require.Len(s.T(), original.Days[index].Exercises, 3)
		require.Len(s.T(), duplicated.Days[index].Exercises, 3)
		for exerciseIndex := range original.Days[index].Exercises {
			assert.NotEqual(
				s.T(),
				original.Days[index].Exercises[exerciseIndex].ID,
				duplicated.Days[index].Exercises[exerciseIndex].ID,
			)
		}
	}

	updatedSets := 10
	firstDuplicateExercise := duplicated.Days[0].Exercises[0]
	updated, err := s.planService.UpdateExercise(firstDuplicateExercise.ID, user.ID, dto.AddPlanExerciseRequest{
		ExerciseID:    firstDuplicateExercise.Exercise.ID,
		TargetSets:    updatedSets,
		TargetReps:    firstDuplicateExercise.TargetReps,
		TargetWeight:  firstDuplicateExercise.TargetWeight,
		RestSeconds:   firstDuplicateExercise.RestSeconds,
		SupersetGroup: firstDuplicateExercise.SupersetGroup,
		Notes:         firstDuplicateExercise.Notes,
	})
	require.NoError(s.T(), err)
	assert.Equal(s.T(), updatedSets, updated.TargetSets)

	originalAfter, err := s.planService.GetByID(original.ID, user.ID)
	require.NoError(s.T(), err)
	assert.Equal(s.T(), original.Days[0].Exercises[0].TargetSets, originalAfter.Days[0].Exercises[0].TargetSets)
	assert.NotEqual(s.T(), updatedSets, originalAfter.Days[0].Exercises[0].TargetSets)
}

func (s *PlanServiceSuite) TestSetActivePlan_MutualExclusion() {
	user, err := testutil.CreateTestUser(s.db, "plan-active@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	plan1 := s.mustCreatePlan(user.ID, "计划 1")
	plan2 := s.mustCreatePlan(user.ID, "计划 2")
	plan3 := s.mustCreatePlan(user.ID, "计划 3")

	_, err = s.planService.Activate(plan2.ID, user.ID)
	require.NoError(s.T(), err)

	list, err := s.planService.List(user.ID)
	require.NoError(s.T(), err)
	assertPlanActiveState(s.T(), list, map[uuid.UUID]bool{
		plan1.ID: false,
		plan2.ID: true,
		plan3.ID: false,
	})

	_, err = s.planService.Activate(plan3.ID, user.ID)
	require.NoError(s.T(), err)

	list, err = s.planService.List(user.ID)
	require.NoError(s.T(), err)
	assertPlanActiveState(s.T(), list, map[uuid.UUID]bool{
		plan1.ID: false,
		plan2.ID: false,
		plan3.ID: true,
	})
}

func (s *PlanServiceSuite) TestDeletePlan_CascadeDelete() {
	user, err := testutil.CreateTestUser(s.db, "plan-delete@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	plan := s.mustCreatePlan(user.ID, "待删计划")
	days := s.mustAddPlanDays(user.ID, plan.ID, "Day 1")
	day := days[0]
	exercise := s.mustCreateExercises(user.ID, "保留动作")[0]
	planExercise := s.mustAddPlanExercise(user.ID, day.ID, exercise.ID, 3, "8-10", 90, nil)

	err = s.planService.Delete(plan.ID, user.ID)
	require.NoError(s.T(), err)

	deletedPlan, err := s.planRepo.FindByID(plan.ID, user.ID)
	require.NoError(s.T(), err)
	assert.Nil(s.T(), deletedPlan)

	var dayCount int64
	require.NoError(s.T(), s.db.Model(&model.PlanDay{}).Where("id = ?", day.ID).Count(&dayCount).Error)
	assert.Zero(s.T(), dayCount)

	var exerciseCount int64
	require.NoError(s.T(), s.db.Model(&model.PlanExercise{}).Where("id = ?", planExercise.ID).Count(&exerciseCount).Error)
	assert.Zero(s.T(), exerciseCount)

	stillExists, err := s.exerciseRepo.FindByID(exercise.ID, user.ID)
	require.NoError(s.T(), err)
	require.NotNil(s.T(), stillExists)
	assert.Equal(s.T(), exercise.ID, stillExists.ID)
}

func (s *PlanServiceSuite) TestAccessOtherUserPlan_NotFound() {
	userA, err := testutil.CreateTestUser(s.db, "plan-user-a@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	userB, err := testutil.CreateTestUser(s.db, "plan-user-b@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	plan := s.mustCreatePlan(userA.ID, "A 的计划")

	detail, err := s.planService.GetByID(plan.ID, userB.ID)
	require.Nil(s.T(), detail)
	appErr := requirePlanAppError(s.T(), err)
	assert.Equal(s.T(), 404, appErr.HTTPStatus)
}

func (s *PlanServiceSuite) TestSuperset_GroupExercises() {
	user, err := testutil.CreateTestUser(s.db, "plan-superset@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	plan := s.mustCreatePlan(user.ID, "Superset")
	days := s.mustAddPlanDays(user.ID, plan.ID, "Push")
	day := days[0]
	exercises := s.mustCreateExercises(user.ID, "动作 A", "动作 B", "动作 C")
	group := 1

	s.mustAddPlanExercise(user.ID, day.ID, exercises[0].ID, 3, "10-12", 60, &group)
	s.mustAddPlanExercise(user.ID, day.ID, exercises[1].ID, 3, "10-12", 60, &group)
	s.mustAddPlanExercise(user.ID, day.ID, exercises[2].ID, 3, "10-12", 60, nil)

	detail, err := s.planService.GetByID(plan.ID, user.ID)
	require.NoError(s.T(), err)
	require.Len(s.T(), detail.Days, 1)
	require.Len(s.T(), detail.Days[0].Exercises, 3)
	require.NotNil(s.T(), detail.Days[0].Exercises[0].SupersetGroup)
	require.NotNil(s.T(), detail.Days[0].Exercises[1].SupersetGroup)
	assert.Equal(s.T(), 1, *detail.Days[0].Exercises[0].SupersetGroup)
	assert.Equal(s.T(), 1, *detail.Days[0].Exercises[1].SupersetGroup)
	assert.Nil(s.T(), detail.Days[0].Exercises[2].SupersetGroup)
}

func (s *PlanServiceSuite) mustCreatePlan(userID uuid.UUID, name string) *dto.PlanDetailResponse {
	s.T().Helper()

	goal := "strength"
	resp, err := s.planService.Create(userID, dto.CreatePlanRequest{
		Name: name,
		Goal: &goal,
	})
	require.NoError(s.T(), err)
	require.NotNil(s.T(), resp)
	return resp
}

func (s *PlanServiceSuite) mustAddPlanDays(userID, planID uuid.UUID, names ...string) []*dto.PlanDayResponse {
	s.T().Helper()

	days := make([]*dto.PlanDayResponse, 0, len(names))
	for _, name := range names {
		day, err := s.planService.AddDay(planID, userID, dto.AddPlanDayRequest{Name: name})
		require.NoError(s.T(), err)
		require.NotNil(s.T(), day)
		days = append(days, day)
	}

	return days
}

func (s *PlanServiceSuite) mustCreateExercises(userID uuid.UUID, names ...string) []*model.Exercise {
	s.T().Helper()

	items := make([]*model.Exercise, 0, len(names))
	for _, name := range names {
		exercise := &model.Exercise{
			UserID:           &userID,
			Name:             name,
			NameEn:           planStringPtr(name + " EN"),
			Category:         enum.ExerciseCategoryStrength,
			PrimaryMuscles:   model.StringArray{"chest"},
			SecondaryMuscles: model.StringArray{"triceps"},
			Equipment:        enum.EquipmentBarbell,
			TrackingType:     enum.TrackingTypeWeightReps,
			IsCustom:         true,
		}
		require.NoError(s.T(), s.db.Create(exercise).Error)
		items = append(items, exercise)
	}

	return items
}

func (s *PlanServiceSuite) mustAddPlanExercise(
	userID, dayID, exerciseID uuid.UUID,
	targetSets int,
	targetReps string,
	restSeconds int,
	supersetGroup *int,
) *dto.PlanExerciseResponse {
	s.T().Helper()

	rest := restSeconds
	resp, err := s.planService.AddExercise(dayID, userID, dto.AddPlanExerciseRequest{
		ExerciseID:    exerciseID,
		TargetSets:    targetSets,
		TargetReps:    planStringPtr(targetReps),
		RestSeconds:   &rest,
		SupersetGroup: supersetGroup,
	})
	require.NoError(s.T(), err)
	require.NotNil(s.T(), resp)
	return resp
}

func (s *PlanServiceSuite) resetState() {
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

func requirePlanAppError(t *testing.T, err error) *apperrors.AppError {
	t.Helper()

	require.Error(t, err)
	var appErr *apperrors.AppError
	require.True(t, errors.As(err, &appErr))
	return appErr
}

func assertPlanActiveState(t *testing.T, plans []dto.PlanDetailResponse, expected map[uuid.UUID]bool) {
	t.Helper()

	require.Len(t, plans, len(expected))
	for _, plan := range plans {
		expectedState, ok := expected[plan.ID]
		require.True(t, ok)
		assert.Equal(t, expectedState, plan.IsActive)
	}
}

func planStringPtr(value string) *string {
	return &value
}
