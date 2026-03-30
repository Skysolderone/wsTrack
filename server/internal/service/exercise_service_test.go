package service

import (
	"context"
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
	"wsTrack/server/migrations"
	"wsTrack/server/pkg/pagination"
)

type ExerciseServiceSuite struct {
	suite.Suite
	db              *gorm.DB
	exerciseRepo    repository.ExerciseRepository
	exerciseService *ExerciseService
}

func TestExerciseServiceSuite(t *testing.T) {
	suite.Run(t, new(ExerciseServiceSuite))
}

func (s *ExerciseServiceSuite) SetupSuite() {
	s.db = testutil.SetupTestDB(s.T())
	s.exerciseRepo = repository.NewExerciseRepository(s.db)
	s.exerciseService = NewExerciseService(s.exerciseRepo)
}

func (s *ExerciseServiceSuite) TearDownSuite() {
	if s.db != nil {
		sqlDB, err := s.db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	}

	testutil.TearDown()
}

func (s *ExerciseServiceSuite) SetupTest() {
	s.resetState()
	s.T().Cleanup(s.resetState)
}

func (s *ExerciseServiceSuite) TestListExercises_NoFilter() {
	currentUser, err := testutil.CreateTestUser(s.db, "current@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	otherUser, err := testutil.CreateTestUser(s.db, "other@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	require.NoError(s.T(), migrations.SeedExercises(context.Background(), s.db))

	ownExercise := s.createExercise(currentUser.ID, "我的卧推", "My Bench", enum.ExerciseCategoryStrength, []string{"chest"}, enum.EquipmentBarbell)
	_ = s.createExercise(otherUser.ID, "别人的卧推", "Other Bench", enum.ExerciseCategoryStrength, []string{"chest"}, enum.EquipmentBarbell)
	archived := s.createExercise(currentUser.ID, "已归档动作", "Archived", enum.ExerciseCategoryStrength, []string{"back"}, enum.EquipmentBarbell)
	require.NoError(s.T(), s.db.Model(&model.Exercise{}).Where("id = ?", archived.ID).Update("is_archived", true).Error)

	items, total, err := s.exerciseService.List(currentUser.ID, dto.ExerciseFilter{})
	require.NoError(s.T(), err)
	assert.Greater(s.T(), total, int64(150))
	assert.Contains(s.T(), exerciseNames(items), ownExercise.Name)
	assert.NotContains(s.T(), exerciseNames(items), "别人的卧推")
	assert.NotContains(s.T(), exerciseNames(items), "已归档动作")
	assert.True(s.T(), containsPreset(items))
}

func (s *ExerciseServiceSuite) TestListExercises_FilterByMuscle() {
	user, err := testutil.CreateTestUser(s.db, "muscle@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	chest := s.createExercise(user.ID, "胸部动作", "Chest Move", enum.ExerciseCategoryStrength, []string{"chest"}, enum.EquipmentBarbell)
	_ = s.createExercise(user.ID, "背部动作", "Back Move", enum.ExerciseCategoryStrength, []string{"back"}, enum.EquipmentBarbell)

	muscle := "chest"
	items, _, err := s.exerciseService.List(user.ID, dto.ExerciseFilter{
		Muscle: &muscle,
	})
	require.NoError(s.T(), err)
	require.Len(s.T(), items, 1)
	assert.Equal(s.T(), chest.ID, items[0].ID)
}

func (s *ExerciseServiceSuite) TestListExercises_FilterByEquipment() {
	user, err := testutil.CreateTestUser(s.db, "equipment@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	barbell := s.createExercise(user.ID, "杠铃划船", "Barbell Row", enum.ExerciseCategoryStrength, []string{"back"}, enum.EquipmentBarbell)
	_ = s.createExercise(user.ID, "哑铃飞鸟", "Dumbbell Fly", enum.ExerciseCategoryStrength, []string{"chest"}, enum.EquipmentDumbbell)

	equipment := "barbell"
	items, _, err := s.exerciseService.List(user.ID, dto.ExerciseFilter{
		Equipment: &equipment,
	})
	require.NoError(s.T(), err)
	require.Len(s.T(), items, 1)
	assert.Equal(s.T(), barbell.ID, items[0].ID)
}

func (s *ExerciseServiceSuite) TestListExercises_FilterByCategory() {
	user, err := testutil.CreateTestUser(s.db, "category@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	strength := s.createExercise(user.ID, "力量深蹲", "Strength Squat", enum.ExerciseCategoryStrength, []string{"quads"}, enum.EquipmentBarbell)
	_ = s.createExercise(user.ID, "拉伸动作", "Stretch Move", enum.ExerciseCategoryStretch, []string{"hamstrings"}, enum.EquipmentBodyweight)

	category := "strength"
	items, _, err := s.exerciseService.List(user.ID, dto.ExerciseFilter{
		Category: &category,
	})
	require.NoError(s.T(), err)
	require.Len(s.T(), items, 1)
	assert.Equal(s.T(), strength.ID, items[0].ID)
}

func (s *ExerciseServiceSuite) TestListExercises_SearchChinese() {
	user, err := testutil.CreateTestUser(s.db, "search-cn@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	target := s.createExercise(user.ID, "杠铃卧推", "Barbell Bench Press", enum.ExerciseCategoryStrength, []string{"chest"}, enum.EquipmentBarbell)
	_ = s.createExercise(user.ID, "引体向上", "Pull Up", enum.ExerciseCategoryBodyweight, []string{"back"}, enum.EquipmentBodyweight)

	search := "卧推"
	items, _, err := s.exerciseService.List(user.ID, dto.ExerciseFilter{
		Search: &search,
	})
	require.NoError(s.T(), err)
	require.Len(s.T(), items, 1)
	assert.Equal(s.T(), target.ID, items[0].ID)
}

func (s *ExerciseServiceSuite) TestListExercises_SearchEnglish() {
	user, err := testutil.CreateTestUser(s.db, "search-en@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	target := s.createExercise(user.ID, "杠铃卧推", "Barbell Bench Press", enum.ExerciseCategoryStrength, []string{"chest"}, enum.EquipmentBarbell)
	_ = s.createExercise(user.ID, "引体向上", "Pull Up", enum.ExerciseCategoryBodyweight, []string{"back"}, enum.EquipmentBodyweight)

	search := "bench"
	items, _, err := s.exerciseService.List(user.ID, dto.ExerciseFilter{
		Search: &search,
	})
	require.NoError(s.T(), err)
	require.Len(s.T(), items, 1)
	assert.Equal(s.T(), target.ID, items[0].ID)
}

func (s *ExerciseServiceSuite) TestListExercises_Pagination() {
	user, err := testutil.CreateTestUser(s.db, "pagination@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	for i := 1; i <= 25; i++ {
		s.createExercise(
			user.ID,
			fmt.Sprintf("分页动作 %02d", i),
			fmt.Sprintf("Paged Exercise %02d", i),
			enum.ExerciseCategoryStrength,
			[]string{"chest"},
			enum.EquipmentBarbell,
		)
	}

	isCustom := true
	page1, total1, err := s.exerciseService.List(user.ID, dto.ExerciseFilter{
		IsCustom: &isCustom,
		PageQuery: pagination.PageQuery{
			Page:     1,
			PageSize: 10,
		},
	})
	require.NoError(s.T(), err)
	assert.Len(s.T(), page1, 10)
	assert.Equal(s.T(), int64(25), total1)

	page2, total2, err := s.exerciseService.List(user.ID, dto.ExerciseFilter{
		IsCustom: &isCustom,
		PageQuery: pagination.PageQuery{
			Page:     2,
			PageSize: 10,
		},
	})
	require.NoError(s.T(), err)
	assert.Len(s.T(), page2, 10)
	assert.Equal(s.T(), int64(25), total2)
	assert.Empty(s.T(), intersectExerciseIDs(page1, page2))
}

func (s *ExerciseServiceSuite) TestCreateExercise_Success() {
	user, err := testutil.CreateTestUser(s.db, "create@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	resp, err := s.exerciseService.Create(user.ID, dto.CreateExerciseRequest{
		Name:           "自定义深蹲",
		NameEn:         stringPtr("Custom Squat"),
		Category:       "strength",
		PrimaryMuscles: []string{"quads"},
		Equipment:      "barbell",
		TrackingType:   "weight_reps",
	})
	require.NoError(s.T(), err)
	require.NotNil(s.T(), resp)
	assert.True(s.T(), resp.IsCustom)
	assert.Equal(s.T(), "自定义深蹲", resp.Name)

	exercise, err := s.exerciseRepo.FindByID(resp.ID, user.ID)
	require.NoError(s.T(), err)
	require.NotNil(s.T(), exercise)
	require.NotNil(s.T(), exercise.UserID)
	assert.Equal(s.T(), user.ID, *exercise.UserID)
	assert.True(s.T(), exercise.IsCustom)

	isCustom := true
	items, _, err := s.exerciseService.List(user.ID, dto.ExerciseFilter{IsCustom: &isCustom})
	require.NoError(s.T(), err)
	assert.Contains(s.T(), exerciseNames(items), "自定义深蹲")
}

func (s *ExerciseServiceSuite) TestCreateExercise_MissingRequired() {
	user, err := testutil.CreateTestUser(s.db, "missing@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	resp, err := s.exerciseService.Create(user.ID, dto.CreateExerciseRequest{
		Name:           "   ",
		Category:       "strength",
		PrimaryMuscles: []string{"chest"},
		Equipment:      "barbell",
		TrackingType:   "weight_reps",
	})
	require.Nil(s.T(), resp)
	appErr := requireExerciseAppError(s.T(), err)
	assert.Equal(s.T(), 400, appErr.HTTPStatus)
	assert.Contains(s.T(), appErr.Message, "name")
}

func (s *ExerciseServiceSuite) TestCreateExercise_InvalidEnum() {
	user, err := testutil.CreateTestUser(s.db, "invalid-enum@example.com", "StrongPass123")
	require.NoError(s.T(), err)

	resp, err := s.exerciseService.Create(user.ID, dto.CreateExerciseRequest{
		Name:           "非法分类动作",
		Category:       "invalid",
		PrimaryMuscles: []string{"chest"},
		Equipment:      "barbell",
		TrackingType:   "weight_reps",
	})
	require.Nil(s.T(), resp)
	appErr := requireExerciseAppError(s.T(), err)
	assert.Equal(s.T(), 400, appErr.HTTPStatus)
}

func (s *ExerciseServiceSuite) TestUpdateExercise_OwnCustom() {
	user, err := testutil.CreateTestUser(s.db, "update-own@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	exercise := s.createExercise(user.ID, "旧名称", "Old Name", enum.ExerciseCategoryStrength, []string{"chest"}, enum.EquipmentBarbell)

	newName := "新名称"
	resp, err := s.exerciseService.Update(exercise.ID, user.ID, dto.UpdateExerciseRequest{
		Name: &newName,
	})
	require.NoError(s.T(), err)
	require.NotNil(s.T(), resp)
	assert.Equal(s.T(), newName, resp.Name)
}

func (s *ExerciseServiceSuite) TestUpdateExercise_SystemExercise() {
	user, err := testutil.CreateTestUser(s.db, "update-system@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	systemExercise := s.createSystemExercise("系统卧推", "System Bench", enum.ExerciseCategoryStrength, []string{"chest"}, enum.EquipmentBarbell)

	newName := "不能更新"
	resp, err := s.exerciseService.Update(systemExercise.ID, user.ID, dto.UpdateExerciseRequest{
		Name: &newName,
	})
	require.Nil(s.T(), resp)
	appErr := requireExerciseAppError(s.T(), err)
	assert.Equal(s.T(), 403, appErr.HTTPStatus)
}

func (s *ExerciseServiceSuite) TestUpdateExercise_OtherUserExercise() {
	user, err := testutil.CreateTestUser(s.db, "update-self@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	otherUser, err := testutil.CreateTestUser(s.db, "update-other@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	otherExercise := s.createExercise(otherUser.ID, "别人动作", "Other Exercise", enum.ExerciseCategoryStrength, []string{"chest"}, enum.EquipmentBarbell)

	newName := "尝试越权"
	resp, err := s.exerciseService.Update(otherExercise.ID, user.ID, dto.UpdateExerciseRequest{
		Name: &newName,
	})
	require.Nil(s.T(), resp)
	appErr := requireExerciseAppError(s.T(), err)
	assert.Equal(s.T(), 404, appErr.HTTPStatus)
}

func (s *ExerciseServiceSuite) TestDeleteExercise_SoftDelete() {
	user, err := testutil.CreateTestUser(s.db, "delete-own@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	exercise := s.createExercise(user.ID, "可删除动作", "Deletable Exercise", enum.ExerciseCategoryStrength, []string{"back"}, enum.EquipmentBarbell)
	workoutExerciseID := s.createWorkoutReference(user.ID, exercise.ID)

	err = s.exerciseService.Delete(exercise.ID, user.ID)
	require.NoError(s.T(), err)

	var archived model.Exercise
	require.NoError(s.T(), s.db.First(&archived, "id = ?", exercise.ID).Error)
	assert.True(s.T(), archived.IsArchived)

	items, _, err := s.exerciseService.List(user.ID, dto.ExerciseFilter{})
	require.NoError(s.T(), err)
	assert.NotContains(s.T(), exerciseNames(items), exercise.Name)

	var workoutExercise model.WorkoutExercise
	require.NoError(s.T(), s.db.First(&workoutExercise, "id = ?", workoutExerciseID).Error)
	assert.Equal(s.T(), exercise.ID, workoutExercise.ExerciseID)
}

func (s *ExerciseServiceSuite) TestDeleteExercise_SystemExercise() {
	user, err := testutil.CreateTestUser(s.db, "delete-system@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	systemExercise := s.createSystemExercise("系统引体", "System Pull Up", enum.ExerciseCategoryBodyweight, []string{"back"}, enum.EquipmentBodyweight)

	err = s.exerciseService.Delete(systemExercise.ID, user.ID)
	appErr := requireExerciseAppError(s.T(), err)
	assert.Equal(s.T(), 403, appErr.HTTPStatus)
}

func (s *ExerciseServiceSuite) TestSeedExercises_Idempotent() {
	require.NoError(s.T(), migrations.SeedExercises(context.Background(), s.db))
	var firstCount int64
	require.NoError(s.T(), s.db.Model(&model.Exercise{}).Where("user_id IS NULL").Count(&firstCount).Error)
	assert.GreaterOrEqual(s.T(), firstCount, int64(150))

	require.NoError(s.T(), migrations.SeedExercises(context.Background(), s.db))
	var secondCount int64
	require.NoError(s.T(), s.db.Model(&model.Exercise{}).Where("user_id IS NULL").Count(&secondCount).Error)
	assert.Equal(s.T(), firstCount, secondCount)
}

func (s *ExerciseServiceSuite) createExercise(
	userID uuid.UUID,
	name string,
	nameEn string,
	category enum.ExerciseCategory,
	primaryMuscles []string,
	equipment enum.Equipment,
) *model.Exercise {
	s.T().Helper()

	exercise := &model.Exercise{
		UserID:           &userID,
		Name:             name,
		NameEn:           stringPtr(nameEn),
		Category:         category,
		PrimaryMuscles:   model.StringArray(primaryMuscles),
		SecondaryMuscles: model.StringArray{},
		Equipment:        equipment,
		TrackingType:     enum.TrackingTypeWeightReps,
		IsCustom:         true,
		IsArchived:       false,
	}
	require.NoError(s.T(), s.db.Create(exercise).Error)
	return exercise
}

func (s *ExerciseServiceSuite) createSystemExercise(
	name string,
	nameEn string,
	category enum.ExerciseCategory,
	primaryMuscles []string,
	equipment enum.Equipment,
) *model.Exercise {
	s.T().Helper()

	exercise := &model.Exercise{
		Name:             name,
		NameEn:           stringPtr(nameEn),
		Category:         category,
		PrimaryMuscles:   model.StringArray(primaryMuscles),
		SecondaryMuscles: model.StringArray{},
		Equipment:        equipment,
		TrackingType:     enum.TrackingTypeWeightReps,
		IsCustom:         false,
		IsArchived:       false,
	}
	require.NoError(s.T(), s.db.Create(exercise).Error)
	return exercise
}

func (s *ExerciseServiceSuite) createWorkoutReference(userID, exerciseID uuid.UUID) uuid.UUID {
	s.T().Helper()

	workout := &model.Workout{
		UserID:    userID,
		ClientID:  uuid.NewString(),
		StartedAt: time.Now().UTC(),
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
	}
	require.NoError(s.T(), s.db.Create(workout).Error)

	workoutExercise := &model.WorkoutExercise{
		WorkoutID:  workout.ID,
		ClientID:   uuid.NewString(),
		ExerciseID: exerciseID,
		SortOrder:  1,
	}
	require.NoError(s.T(), s.db.Create(workoutExercise).Error)

	return workoutExercise.ID
}

func (s *ExerciseServiceSuite) resetState() {
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

func exerciseNames(items []dto.ExerciseResponse) []string {
	names := make([]string, 0, len(items))
	for _, item := range items {
		names = append(names, item.Name)
	}
	return names
}

func containsPreset(items []dto.ExerciseResponse) bool {
	for _, item := range items {
		if !item.IsCustom {
			return true
		}
	}
	return false
}

func intersectExerciseIDs(left, right []dto.ExerciseResponse) []uuid.UUID {
	lookup := make(map[uuid.UUID]struct{}, len(left))
	for _, item := range left {
		lookup[item.ID] = struct{}{}
	}

	var intersection []uuid.UUID
	for _, item := range right {
		if _, ok := lookup[item.ID]; ok {
			intersection = append(intersection, item.ID)
		}
	}

	return intersection
}

func stringPtr(value string) *string {
	return &value
}

func requireExerciseAppError(t *testing.T, err error) *apperrors.AppError {
	t.Helper()
	require.Error(t, err)

	var appErr *apperrors.AppError
	require.ErrorAs(t, err, &appErr)
	return appErr
}
