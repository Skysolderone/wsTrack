package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
	"gorm.io/gorm"

	"wsTrack/server/internal/dto"
	"wsTrack/server/internal/enum"
	apperrors "wsTrack/server/internal/errors"
	"wsTrack/server/internal/middleware"
	"wsTrack/server/internal/model"
	"wsTrack/server/internal/repository"
	"wsTrack/server/internal/service"
	"wsTrack/server/internal/testutil"
	appvalidator "wsTrack/server/pkg/validator"
)

type exerciseListPayload struct {
	Items      []dto.ExerciseResponse `json:"items"`
	Pagination struct {
		Page     int   `json:"page"`
		PageSize int   `json:"page_size"`
		Total    int64 `json:"total"`
	} `json:"pagination"`
}

type exerciseAPIResponse[T any] struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    T      `json:"data"`
}

type ExerciseHandlerSuite struct {
	suite.Suite
	db              *gorm.DB
	exerciseHandler *ExerciseHandler
	router          *gin.Engine
}

func TestExerciseHandlerSuite(t *testing.T) {
	suite.Run(t, new(ExerciseHandlerSuite))
}

func (s *ExerciseHandlerSuite) SetupSuite() {
	gin.SetMode(gin.TestMode)
	require.NoError(s.T(), appvalidator.RegisterCustomValidators())

	s.db = testutil.SetupTestDB(s.T())
	exerciseRepo := repository.NewExerciseRepository(s.db)
	exerciseService := service.NewExerciseService(exerciseRepo)
	s.exerciseHandler = NewExerciseHandler(exerciseService)
	s.router = buildExerciseTestRouter(s.exerciseHandler)
}

func (s *ExerciseHandlerSuite) TearDownSuite() {
	if s.db != nil {
		sqlDB, err := s.db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	}

	testutil.TearDown()
}

func (s *ExerciseHandlerSuite) SetupTest() {
	s.resetState()
	s.T().Cleanup(s.resetState)
}

func (s *ExerciseHandlerSuite) TestListExercisesHandler_Unauthorized() {
	recorder := s.performJSONRequest(http.MethodGet, "/api/v1/exercises", nil, "")
	require.Equal(s.T(), http.StatusUnauthorized, recorder.Code)

	var resp exerciseAPIResponse[map[string]any]
	require.NoError(s.T(), json.Unmarshal(recorder.Body.Bytes(), &resp))
	assert.Equal(s.T(), apperrors.CodeUnauthorized, resp.Code)
}

func (s *ExerciseHandlerSuite) TestListExercisesHandler_Success() {
	user, err := testutil.CreateTestUser(s.db, "list-handler@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	s.createExercise(user.ID, "杠铃卧推")

	token, err := testutil.GetAuthToken(user.ID)
	require.NoError(s.T(), err)

	recorder := s.performJSONRequest(http.MethodGet, "/api/v1/exercises?page=1&page_size=10", nil, "Bearer "+token)
	require.Equal(s.T(), http.StatusOK, recorder.Code)

	var resp exerciseAPIResponse[exerciseListPayload]
	require.NoError(s.T(), json.Unmarshal(recorder.Body.Bytes(), &resp))
	assert.Equal(s.T(), apperrors.CodeSuccess, resp.Code)
	assert.Len(s.T(), resp.Data.Items, 1)
	assert.Equal(s.T(), int64(1), resp.Data.Pagination.Total)
	assert.Equal(s.T(), "杠铃卧推", resp.Data.Items[0].Name)
}

func (s *ExerciseHandlerSuite) TestListExercisesHandler_InvalidQuery() {
	user, err := testutil.CreateTestUser(s.db, "invalid-query@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	token, err := testutil.GetAuthToken(user.ID)
	require.NoError(s.T(), err)

	recorder := s.performJSONRequest(http.MethodGet, "/api/v1/exercises?page=0", nil, "Bearer "+token)
	require.Equal(s.T(), http.StatusBadRequest, recorder.Code)

	var resp exerciseAPIResponse[map[string]any]
	require.NoError(s.T(), json.Unmarshal(recorder.Body.Bytes(), &resp))
	assert.Equal(s.T(), apperrors.CodeBadRequest, resp.Code)
	assert.Contains(s.T(), resp.Message, "Page")
}

func (s *ExerciseHandlerSuite) TestGetExerciseHandler_Success() {
	user, err := testutil.CreateTestUser(s.db, "get-handler@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	exercise := s.createExercise(user.ID, "引体向上")

	token, err := testutil.GetAuthToken(user.ID)
	require.NoError(s.T(), err)

	recorder := s.performJSONRequest(http.MethodGet, "/api/v1/exercises/"+exercise.ID.String(), nil, "Bearer "+token)
	require.Equal(s.T(), http.StatusOK, recorder.Code)

	var resp exerciseAPIResponse[dto.ExerciseResponse]
	require.NoError(s.T(), json.Unmarshal(recorder.Body.Bytes(), &resp))
	assert.Equal(s.T(), exercise.ID, resp.Data.ID)
	assert.Equal(s.T(), "引体向上", resp.Data.Name)
}

func (s *ExerciseHandlerSuite) TestCreateExerciseHandler_Success() {
	user, err := testutil.CreateTestUser(s.db, "create-handler@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	token, err := testutil.GetAuthToken(user.ID)
	require.NoError(s.T(), err)

	recorder := s.performJSONRequest(http.MethodPost, "/api/v1/exercises", map[string]any{
		"name":              "自定义卧推",
		"category":          "strength",
		"primary_muscles":   []string{"chest"},
		"equipment":         "barbell",
		"tracking_type":     "weight_reps",
		"secondary_muscles": []string{"triceps"},
	}, "Bearer "+token)
	require.Equal(s.T(), http.StatusOK, recorder.Code)

	var resp exerciseAPIResponse[dto.ExerciseResponse]
	require.NoError(s.T(), json.Unmarshal(recorder.Body.Bytes(), &resp))
	assert.Equal(s.T(), apperrors.CodeSuccess, resp.Code)
	assert.Equal(s.T(), "自定义卧推", resp.Data.Name)
	assert.True(s.T(), resp.Data.IsCustom)
}

func (s *ExerciseHandlerSuite) TestCreateExerciseHandler_InvalidPayload() {
	user, err := testutil.CreateTestUser(s.db, "invalid-create-handler@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	token, err := testutil.GetAuthToken(user.ID)
	require.NoError(s.T(), err)

	recorder := s.performJSONRequest(http.MethodPost, "/api/v1/exercises", map[string]any{
		"category":        "invalid",
		"primary_muscles": []string{"chest"},
		"equipment":       "barbell",
		"tracking_type":   "weight_reps",
	}, "Bearer "+token)
	require.Equal(s.T(), http.StatusBadRequest, recorder.Code)

	var resp exerciseAPIResponse[map[string]any]
	require.NoError(s.T(), json.Unmarshal(recorder.Body.Bytes(), &resp))
	assert.Equal(s.T(), apperrors.CodeBadRequest, resp.Code)
	assert.NotEmpty(s.T(), resp.Message)
}

func (s *ExerciseHandlerSuite) TestUpdateExerciseHandler_Success() {
	user, err := testutil.CreateTestUser(s.db, "update-handler@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	exercise := s.createExercise(user.ID, "旧动作名")
	token, err := testutil.GetAuthToken(user.ID)
	require.NoError(s.T(), err)

	recorder := s.performJSONRequest(http.MethodPut, "/api/v1/exercises/"+exercise.ID.String(), map[string]any{
		"name": "新动作名",
	}, "Bearer "+token)
	require.Equal(s.T(), http.StatusOK, recorder.Code)

	var resp exerciseAPIResponse[dto.ExerciseResponse]
	require.NoError(s.T(), json.Unmarshal(recorder.Body.Bytes(), &resp))
	assert.Equal(s.T(), "新动作名", resp.Data.Name)
}

func (s *ExerciseHandlerSuite) TestDeleteExerciseHandler_Success() {
	user, err := testutil.CreateTestUser(s.db, "delete-handler@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	exercise := s.createExercise(user.ID, "待删除动作")
	token, err := testutil.GetAuthToken(user.ID)
	require.NoError(s.T(), err)

	recorder := s.performJSONRequest(http.MethodDelete, "/api/v1/exercises/"+exercise.ID.String(), nil, "Bearer "+token)
	require.Equal(s.T(), http.StatusOK, recorder.Code)

	var archived model.Exercise
	require.NoError(s.T(), s.db.First(&archived, "id = ?", exercise.ID).Error)
	assert.True(s.T(), archived.IsArchived)
}

func (s *ExerciseHandlerSuite) TestDeleteExerciseHandler_SystemExercise() {
	user, err := testutil.CreateTestUser(s.db, "delete-system-handler@example.com", "StrongPass123")
	require.NoError(s.T(), err)
	exercise := &model.Exercise{
		Name:           "系统动作",
		Category:       enum.ExerciseCategoryStrength,
		PrimaryMuscles: model.StringArray{"chest"},
		Equipment:      enum.EquipmentBarbell,
		TrackingType:   enum.TrackingTypeWeightReps,
		IsCustom:       false,
	}
	require.NoError(s.T(), s.db.Create(exercise).Error)

	token, err := testutil.GetAuthToken(user.ID)
	require.NoError(s.T(), err)

	recorder := s.performJSONRequest(http.MethodDelete, "/api/v1/exercises/"+exercise.ID.String(), nil, "Bearer "+token)
	require.Equal(s.T(), http.StatusForbidden, recorder.Code)

	var resp exerciseAPIResponse[map[string]any]
	require.NoError(s.T(), json.Unmarshal(recorder.Body.Bytes(), &resp))
	assert.Equal(s.T(), apperrors.CodeForbidden, resp.Code)
}

func (s *ExerciseHandlerSuite) performJSONRequest(method, path string, body interface{}, authHeader string) *httptest.ResponseRecorder {
	s.T().Helper()

	var payload []byte
	if body != nil {
		raw, err := json.Marshal(body)
		require.NoError(s.T(), err)
		payload = raw
	}

	req := httptest.NewRequest(method, path, bytes.NewReader(payload))
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if authHeader != "" {
		req.Header.Set("Authorization", authHeader)
	}

	recorder := httptest.NewRecorder()
	s.router.ServeHTTP(recorder, req)
	return recorder
}

func (s *ExerciseHandlerSuite) createExercise(userID uuid.UUID, name string) *model.Exercise {
	s.T().Helper()

	exercise := &model.Exercise{
		UserID:           &userID,
		Name:             name,
		Category:         enum.ExerciseCategoryStrength,
		PrimaryMuscles:   model.StringArray{"chest"},
		SecondaryMuscles: model.StringArray{},
		Equipment:        enum.EquipmentBarbell,
		TrackingType:     enum.TrackingTypeWeightReps,
		IsCustom:         true,
	}
	require.NoError(s.T(), s.db.Create(exercise).Error)
	return exercise
}

func (s *ExerciseHandlerSuite) resetState() {
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

func buildExerciseTestRouter(exerciseHandler *ExerciseHandler) *gin.Engine {
	router := gin.New()

	exercises := router.Group("/api/v1/exercises")
	exercises.Use(middleware.Auth())
	{
		exercises.GET("", exerciseHandler.List)
		exercises.GET("/:id", exerciseHandler.Get)
		exercises.POST("", exerciseHandler.Create)
		exercises.PUT("/:id", exerciseHandler.Update)
		exercises.DELETE("/:id", exerciseHandler.Delete)
	}

	return router
}
