package service

import (
	"encoding/json"
	"fmt"
	"testing"

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

type TemplateServiceSuite struct {
	suite.Suite
	db              *gorm.DB
	templateRepo    repository.TemplateRepository
	planRepo        repository.PlanRepository
	exerciseRepo    repository.ExerciseRepository
	templateService *TemplateService
}

func TestTemplateServiceSuite(t *testing.T) {
	suite.Run(t, new(TemplateServiceSuite))
}

func (s *TemplateServiceSuite) SetupSuite() {
	s.db = testutil.SetupTestDB(s.T())
	s.templateRepo = repository.NewTemplateRepository(s.db)
	s.planRepo = repository.NewPlanRepository(s.db)
	s.exerciseRepo = repository.NewExerciseRepository(s.db)
	s.templateService = NewTemplateService(s.templateRepo, s.planRepo, s.exerciseRepo)
}

func (s *TemplateServiceSuite) TearDownSuite() {
	if s.db != nil {
		sqlDB, err := s.db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	}

	testutil.TearDown()
}

func (s *TemplateServiceSuite) SetupTest() {
	s.resetState()
	s.T().Cleanup(s.resetState)
}

func (s *TemplateServiceSuite) TestGetBuiltInTemplates() {
	user, err := testutil.CreateTestUser(s.db, "template-builtins@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	exercises := s.createTemplateExercises()

	for index := 0; index < 8; index++ {
		s.createTemplateRecord(nil, fmt.Sprintf("Built In %d", index+1), true, exercises[:2], exercises[2:4])
	}
	s.createTemplateRecord(&user.ID, "My Custom Template", false, exercises[:2], exercises[2:4])

	items, err := s.templateService.List(user.ID)
	require.NoError(s.T(), err)

	builtIns := make([]dto.TemplateResponse, 0)
	for _, item := range items {
		if item.IsBuiltIn {
			builtIns = append(builtIns, item)
		}
	}
	assert.Len(s.T(), builtIns, 8)
	for _, item := range builtIns {
		assert.True(s.T(), item.IsBuiltIn)
		require.NotEmpty(s.T(), item.Days)
		require.NotEmpty(s.T(), item.Days[0].Exercises)
		assert.NotEqual(s.T(), uuid.Nil, item.Days[0].Exercises[0].Exercise.ID)
	}
}

func (s *TemplateServiceSuite) TestApplyTemplate_CreatePlan() {
	user, err := testutil.CreateTestUser(s.db, "template-apply@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	exercises := s.createTemplateExercises()
	template := s.createTemplateRecord(nil, "PPL Built In", true, exercises[:2], exercises[2:4])

	applied, err := s.templateService.Apply(user.ID, template.ID)
	require.NoError(s.T(), err)
	require.NotNil(s.T(), applied)
	assert.Equal(s.T(), "PPL Built In", applied.Name)
	require.Len(s.T(), applied.Days, 2)
	require.Len(s.T(), applied.Days[0].Exercises, 2)
	assert.Equal(s.T(), exercises[0].ID, applied.Days[0].Exercises[0].Exercise.ID)

	var firstPlanExercise model.PlanExercise
	require.NoError(s.T(), s.db.Where("plan_day_id = ?", applied.Days[0].ID).Order("sort_order ASC").First(&firstPlanExercise).Error)
	firstPlanExercise.TargetSets = 10
	require.NoError(s.T(), s.db.Save(&firstPlanExercise).Error)

	originalTemplate, err := s.templateService.GetByID(template.ID, user.ID)
	require.NoError(s.T(), err)
	require.NotNil(s.T(), originalTemplate)
	assert.Equal(s.T(), 4, originalTemplate.Days[0].Exercises[0].TargetSets)
}

func (s *TemplateServiceSuite) TestSaveAsTemplate() {
	user, err := testutil.CreateTestUser(s.db, "template-save@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	exercises := s.createTemplateExercises()
	plan := s.createPlanWithExercises(user.ID, "My Plan", exercises[:2], exercises[2:4])

	resp, err := s.templateService.SaveFromPlan(user.ID, dto.SaveAsTemplateRequest{
		PlanID: plan.ID,
		Name:   "Saved Template",
	})
	require.NoError(s.T(), err)
	require.NotNil(s.T(), resp)
	assert.False(s.T(), resp.IsBuiltIn)
	assert.Equal(s.T(), "Saved Template", resp.Name)
	require.Len(s.T(), resp.Days, 2)
	require.Len(s.T(), resp.Days[0].Exercises, 2)

	stored, err := s.templateRepo.FindByID(resp.ID, user.ID)
	require.NoError(s.T(), err)
	require.NotNil(s.T(), stored)
	snapshot, err := parseStoredTemplateSnapshot(stored.Snapshot)
	require.NoError(s.T(), err)
	assert.Equal(s.T(), "Saved Template", snapshot.Name)
	require.Len(s.T(), snapshot.Days, 2)
	require.Len(s.T(), snapshot.Days[1].Exercises, 2)
	assert.Equal(s.T(), exercises[2].ID, snapshot.Days[1].Exercises[0].Exercise.ID)
}

func (s *TemplateServiceSuite) TestExportImportTemplate() {
	user, err := testutil.CreateTestUser(s.db, "template-export-import@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	exercises := s.createTemplateExercises()
	original := s.createTemplateRecord(&user.ID, "Export Me", false, exercises[:2], exercises[2:4])

	exported, err := s.templateService.Export(user.ID, original.ID)
	require.NoError(s.T(), err)
	require.NotEmpty(s.T(), exported)

	var payload map[string]interface{}
	require.NoError(s.T(), json.Unmarshal(exported, &payload))

	imported, err := s.templateService.Import(user.ID, dto.ImportTemplateRequest{
		TemplateJSON: payload,
	})
	require.NoError(s.T(), err)
	require.NotNil(s.T(), imported)
	assert.False(s.T(), imported.IsBuiltIn)
	assert.Equal(s.T(), "Export Me", imported.Name)
	require.Len(s.T(), imported.Days, 2)
	require.Len(s.T(), imported.Days[0].Exercises, 2)

	originalResponse, err := s.templateService.GetByID(original.ID, user.ID)
	require.NoError(s.T(), err)
	require.NotNil(s.T(), originalResponse)
	assert.Equal(s.T(), originalResponse.Name, imported.Name)
	assert.Equal(s.T(), originalResponse.Goal, imported.Goal)
	assert.Equal(s.T(), originalResponse.Days[0].Exercises[0].Exercise.ID, imported.Days[0].Exercises[0].Exercise.ID)
	assert.Equal(s.T(), originalResponse.Days[1].Exercises[1].TargetSets, imported.Days[1].Exercises[1].TargetSets)
}

func (s *TemplateServiceSuite) createTemplateExercises() []*model.Exercise {
	s.T().Helper()

	specs := []struct {
		Name    string
		Muscles []string
	}{
		{Name: "杠铃卧推", Muscles: []string{"chest"}},
		{Name: "上斜卧推", Muscles: []string{"chest"}},
		{Name: "杠铃划船", Muscles: []string{"back"}},
		{Name: "高位下拉", Muscles: []string{"back"}},
	}

	items := make([]*model.Exercise, 0, len(specs))
	for _, spec := range specs {
		exercise := &model.Exercise{
			Name:             spec.Name,
			NameEn:           s.templateStringPtr(spec.Name + " EN"),
			Category:         enum.ExerciseCategoryStrength,
			PrimaryMuscles:   model.StringArray(spec.Muscles),
			SecondaryMuscles: model.StringArray{"triceps"},
			Equipment:        enum.EquipmentBarbell,
			TrackingType:     enum.TrackingTypeWeightReps,
			IsCustom:         false,
		}
		require.NoError(s.T(), s.db.Create(exercise).Error)
		items = append(items, exercise)
	}

	return items
}

func (s *TemplateServiceSuite) createTemplateRecord(userID *uuid.UUID, name string, builtIn bool, day1Exercises, day2Exercises []*model.Exercise) *model.Template {
	s.T().Helper()

	goal := enum.PlanGoalHypertrophy
	snapshot := dto.TemplateSnapshot{
		Name:        name,
		Description: s.templateStringPtr(name + " Description"),
		Goal:        s.templateStringPtr(string(goal)),
		Days: []dto.PlanDayResponse{
			s.templateDay("Day 1", day1Exercises),
			s.templateDay("Day 2", day2Exercises),
		},
	}
	payload, err := json.Marshal(snapshot)
	require.NoError(s.T(), err)

	template := &model.Template{
		UserID:      userID,
		Name:        name,
		Description: snapshot.Description,
		Goal:        &goal,
		IsBuiltIn:   builtIn,
		Snapshot:    model.JSON(payload),
	}
	require.NoError(s.T(), s.db.Create(template).Error)
	return template
}

func (s *TemplateServiceSuite) createPlanWithExercises(userID uuid.UUID, name string, day1Exercises, day2Exercises []*model.Exercise) *model.Plan {
	s.T().Helper()

	goal := enum.PlanGoalStrength
	plan := &model.Plan{
		UserID:   userID,
		Name:     name,
		Goal:     &goal,
		IsActive: false,
	}
	require.NoError(s.T(), s.db.Create(plan).Error)

	days := []*model.PlanDay{
		{PlanID: plan.ID, Name: "Day 1", SortOrder: 0},
		{PlanID: plan.ID, Name: "Day 2", SortOrder: 1},
	}
	for _, day := range days {
		require.NoError(s.T(), s.db.Create(day).Error)
	}

	s.createPlanExercises(days[0].ID, day1Exercises)
	s.createPlanExercises(days[1].ID, day2Exercises)

	return plan
}

func (s *TemplateServiceSuite) createPlanExercises(dayID uuid.UUID, exercises []*model.Exercise) {
	s.T().Helper()

	for index, exercise := range exercises {
		targetReps := "8-12"
		restSeconds := 90
		planExercise := &model.PlanExercise{
			PlanDayID:    dayID,
			ExerciseID:   exercise.ID,
			TargetSets:   4 + index,
			TargetReps:   &targetReps,
			RestSeconds:  &restSeconds,
			SortOrder:    index,
			TargetWeight: s.templateFloatPtr(60 + float64(index*5)),
		}
		require.NoError(s.T(), s.db.Create(planExercise).Error)
	}
}

func (s *TemplateServiceSuite) templateDay(name string, exercises []*model.Exercise) dto.PlanDayResponse {
	day := dto.PlanDayResponse{
		ID:        uuid.New(),
		Name:      name,
		SortOrder: 0,
		Exercises: make([]dto.PlanExerciseResponse, 0, len(exercises)),
	}
	for index, exercise := range exercises {
		targetReps := "8-12"
		restSeconds := 90
		day.Exercises = append(day.Exercises, dto.PlanExerciseResponse{
			ID:           uuid.New(),
			Exercise:     toExerciseResponse(exercise),
			TargetSets:   4 + index,
			TargetReps:   &targetReps,
			TargetWeight: s.templateFloatPtr(60 + float64(index*5)),
			RestSeconds:  &restSeconds,
			SortOrder:    index,
		})
	}
	return day
}

func (s *TemplateServiceSuite) resetState() {
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

func (s *TemplateServiceSuite) templateStringPtr(value string) *string {
	return &value
}

func (s *TemplateServiceSuite) templateFloatPtr(value float64) *float64 {
	return &value
}
