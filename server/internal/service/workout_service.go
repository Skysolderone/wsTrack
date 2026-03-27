package service

import (
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"

	"wsTrack/server/internal/dto"
	"wsTrack/server/internal/enum"
	apperrors "wsTrack/server/internal/errors"
	"wsTrack/server/internal/model"
	"wsTrack/server/internal/repository"
)

type WorkoutService struct {
	workouts    repository.WorkoutRepository
	exercises   repository.ExerciseRepository
	planDays    repository.PlanDayRepository
	redisClient *redis.Client
	prs         *PRService
	challenges  *ChallengeService
}

func NewWorkoutService(
	workouts repository.WorkoutRepository,
	exercises repository.ExerciseRepository,
	planDays repository.PlanDayRepository,
	redisClient *redis.Client,
	prs *PRService,
	challenges *ChallengeService,
) *WorkoutService {
	return &WorkoutService{
		workouts:    workouts,
		exercises:   exercises,
		planDays:    planDays,
		redisClient: redisClient,
		prs:         prs,
		challenges:  challenges,
	}
}

func (s *WorkoutService) List(userID uuid.UUID, filter dto.WorkoutFilter) ([]dto.WorkoutListItem, int64, error) {
	items, total, err := s.workouts.List(userID, filter)
	if err != nil {
		return nil, 0, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to list workouts")
	}

	return items, total, nil
}

func (s *WorkoutService) GetByID(id, userID uuid.UUID) (*dto.WorkoutDetailResponse, error) {
	workout, err := s.requireWorkout(id, userID)
	if err != nil {
		return nil, err
	}

	response := toWorkoutDetailResponse(workout)
	return &response, nil
}

func (s *WorkoutService) Create(userID uuid.UUID, req dto.WorkoutFullData) (*dto.WorkoutDetailResponse, error) {
	if err := s.validateWorkoutInput(userID, req); err != nil {
		return nil, err
	}

	workout := mapWorkoutModel(userID, req)
	enrichWorkoutTotals(workout)

	if err := s.workouts.Create(workout); err != nil {
		return nil, s.wrapWorkoutRepoError(err, "failed to create workout")
	}
	if err := s.syncDerivedData(userID, collectWorkoutExerciseIDs(workout)); err != nil {
		return nil, err
	}
	invalidateDashboardCache(s.redisClient, userID)

	created, err := s.requireWorkout(workout.ID, userID)
	if err != nil {
		return nil, err
	}

	response := toWorkoutDetailResponse(created)
	return &response, nil
}

func (s *WorkoutService) Update(id, userID uuid.UUID, req dto.UpdateWorkoutRequest) (*dto.WorkoutDetailResponse, error) {
	if req.Rating == nil && req.Notes == nil {
		return nil, apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "no update fields provided")
	}

	updates := make(map[string]interface{})
	if req.Rating != nil {
		updates["rating"] = *req.Rating
	}
	if req.Notes != nil {
		normalizedNotes := normalizeWorkoutString(req.Notes)
		if normalizedNotes == nil {
			updates["notes"] = nil
		} else {
			updates["notes"] = *normalizedNotes
		}
	}

	if err := s.workouts.Update(id, userID, updates); err != nil {
		return nil, s.wrapWorkoutRepoError(err, "failed to update workout")
	}
	invalidateDashboardCache(s.redisClient, userID)

	updated, err := s.requireWorkout(id, userID)
	if err != nil {
		return nil, err
	}

	response := toWorkoutDetailResponse(updated)
	return &response, nil
}

func (s *WorkoutService) Delete(id, userID uuid.UUID) error {
	workout, err := s.requireWorkout(id, userID)
	if err != nil {
		return err
	}

	if err := s.workouts.Delete(id, userID); err != nil {
		return s.wrapWorkoutRepoError(err, "failed to delete workout")
	}
	if err := s.syncDerivedData(userID, collectWorkoutExerciseIDs(workout)); err != nil {
		return err
	}
	invalidateDashboardCache(s.redisClient, userID)

	return nil
}

func (s *WorkoutService) Sync(userID uuid.UUID, req dto.SyncWorkoutRequest) (*dto.SyncWorkoutResponse, error) {
	if len(req.Workouts) == 0 {
		return nil, apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "workouts cannot be empty")
	}
	if len(req.Workouts) > 50 {
		return nil, apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "a maximum of 50 workouts can be synced per request")
	}

	for _, workout := range req.Workouts {
		if err := s.validateWorkoutInput(userID, workout); err != nil {
			return nil, err
		}
	}

	ids, err := s.workouts.BatchSync(userID, req.Workouts)
	if err != nil {
		return nil, s.wrapWorkoutRepoError(err, "failed to sync workouts")
	}
	if err := s.syncDerivedData(userID, collectWorkoutDataExerciseIDs(req.Workouts)); err != nil {
		return nil, err
	}
	invalidateDashboardCache(s.redisClient, userID)

	response := &dto.SyncWorkoutResponse{
		SyncedIDs: make([]dto.SyncedWorkoutID, 0, len(ids)),
	}
	for index, id := range ids {
		response.SyncedIDs = append(response.SyncedIDs, dto.SyncedWorkoutID{
			ClientID: req.Workouts[index].ClientID,
			ServerID: id,
		})
	}

	return response, nil
}

func (s *WorkoutService) requireWorkout(id, userID uuid.UUID) (*model.Workout, error) {
	workout, err := s.workouts.FindByID(id, userID)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query workout")
	}
	if workout == nil {
		return nil, apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "workout not found")
	}

	return workout, nil
}

func (s *WorkoutService) validateWorkoutInput(userID uuid.UUID, req dto.WorkoutFullData) error {
	if strings.TrimSpace(req.ClientID) == "" {
		return apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "client_id cannot be empty")
	}

	if req.PlanDayID != nil {
		day, err := s.planDays.FindByID(*req.PlanDayID, userID)
		if err != nil {
			return apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query plan day")
		}
		if day == nil {
			return apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "plan day not found")
		}
	}

	for _, exercise := range req.Exercises {
		if strings.TrimSpace(exercise.ClientID) == "" {
			return apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "workout exercise client_id cannot be empty")
		}

		visibleExercise, err := s.exercises.FindByID(exercise.ExerciseID, userID)
		if err != nil {
			return apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query exercise")
		}
		if visibleExercise == nil {
			return apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "exercise not found")
		}

		for _, set := range exercise.Sets {
			if strings.TrimSpace(set.ClientID) == "" {
				return apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "workout set client_id cannot be empty")
			}

			switch enum.WeightUnit(strings.TrimSpace(set.Unit)) {
			case enum.WeightUnitKG, enum.WeightUnitLBS:
			default:
				return apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "invalid weight unit")
			}
		}
	}

	return nil
}

func (s *WorkoutService) wrapWorkoutRepoError(err error, message string) error {
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		return apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "resource not found")
	case errors.Is(err, gorm.ErrDuplicatedKey):
		return apperrors.New(http.StatusConflict, apperrors.CodeConflict, "duplicate client_id")
	default:
		return apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, message)
	}
}

func toWorkoutDetailResponse(workout *model.Workout) dto.WorkoutDetailResponse {
	response := dto.WorkoutDetailResponse{
		ID:              workout.ID,
		PlanDayName:     nil,
		StartedAt:       workout.StartedAt,
		FinishedAt:      workout.FinishedAt,
		DurationSeconds: workout.DurationSeconds,
		TotalVolume:     workout.TotalVolume,
		TotalSets:       workout.TotalSets,
		Rating:          workout.Rating,
		Notes:           workout.Notes,
		Exercises:       make([]dto.WorkoutExerciseResponse, 0, len(workout.Exercises)),
	}
	if workout.PlanDay != nil {
		response.PlanDayName = &workout.PlanDay.Name
	}

	for i := range workout.Exercises {
		response.Exercises = append(response.Exercises, toWorkoutExerciseResponse(&workout.Exercises[i]))
	}

	return response
}

func toWorkoutExerciseResponse(exercise *model.WorkoutExercise) dto.WorkoutExerciseResponse {
	response := dto.WorkoutExerciseResponse{
		ID:        exercise.ID,
		Exercise:  toExerciseResponse(&exercise.Exercise),
		SortOrder: exercise.SortOrder,
		Volume:    exercise.Volume,
		Notes:     exercise.Notes,
		Sets:      make([]dto.WorkoutSetResponse, 0, len(exercise.Sets)),
	}

	for i := range exercise.Sets {
		response.Sets = append(response.Sets, toWorkoutSetResponse(&exercise.Sets[i]))
	}

	return response
}

func toWorkoutSetResponse(set *model.WorkoutSet) dto.WorkoutSetResponse {
	return dto.WorkoutSetResponse{
		ID:              set.ID,
		SetNumber:       set.SetNumber,
		Weight:          set.Weight,
		Reps:            set.Reps,
		DurationSeconds: set.DurationSeconds,
		Distance:        set.Distance,
		RPE:             set.RPE,
		IsWarmup:        set.IsWarmup,
		IsCompleted:     set.IsCompleted,
		RestSeconds:     set.RestSeconds,
		IsPR:            set.IsPR,
		Unit:            string(set.Unit),
		CompletedAt:     set.CompletedAt,
	}
}

func normalizeWorkoutString(value *string) *string {
	if value == nil {
		return nil
	}

	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}

	return &trimmed
}

func mapWorkoutModel(userID uuid.UUID, item dto.WorkoutFullData) *model.Workout {
	workout := &model.Workout{
		UserID:          userID,
		PlanDayID:       item.PlanDayID,
		ClientID:        strings.TrimSpace(item.ClientID),
		StartedAt:       item.StartedAt,
		FinishedAt:      item.FinishedAt,
		DurationSeconds: item.DurationSeconds,
		TotalVolume:     item.TotalVolume,
		TotalSets:       item.TotalSets,
		Rating:          item.Rating,
		Notes:           normalizeWorkoutString(item.Notes),
		Exercises:       make([]model.WorkoutExercise, 0, len(item.Exercises)),
	}

	for _, exercise := range item.Exercises {
		modelExercise := model.WorkoutExercise{
			ClientID:   strings.TrimSpace(exercise.ClientID),
			ExerciseID: exercise.ExerciseID,
			SortOrder:  exercise.SortOrder,
			Volume:     exercise.Volume,
			Notes:      normalizeWorkoutString(exercise.Notes),
			Sets:       make([]model.WorkoutSet, 0, len(exercise.Sets)),
		}

		for _, set := range exercise.Sets {
			modelExercise.Sets = append(modelExercise.Sets, model.WorkoutSet{
				ClientID:        strings.TrimSpace(set.ClientID),
				SetNumber:       set.SetNumber,
				Weight:          set.Weight,
				Reps:            set.Reps,
				DurationSeconds: set.DurationSeconds,
				Distance:        set.Distance,
				RPE:             set.RPE,
				IsWarmup:        set.IsWarmup,
				IsCompleted:     set.IsCompleted,
				RestSeconds:     set.RestSeconds,
				IsPR:            set.IsPR,
				Unit:            enum.WeightUnit(strings.TrimSpace(set.Unit)),
				CompletedAt:     set.CompletedAt,
			})
		}

		workout.Exercises = append(workout.Exercises, modelExercise)
	}

	return workout
}

func enrichWorkoutTotals(workout *model.Workout) {
	workout.TotalVolume = 0
	workout.TotalSets = 0

	for exerciseIndex := range workout.Exercises {
		workout.Exercises[exerciseIndex].Volume = 0
		workout.TotalSets += len(workout.Exercises[exerciseIndex].Sets)

		for _, set := range workout.Exercises[exerciseIndex].Sets {
			if !set.IsCompleted || set.IsWarmup || set.Weight == nil || set.Reps == nil {
				continue
			}

			setVolume := *set.Weight * float64(*set.Reps)
			workout.Exercises[exerciseIndex].Volume += setVolume
			workout.TotalVolume += setVolume
		}
	}
}

func (s *WorkoutService) syncDerivedData(userID uuid.UUID, exerciseIDs []uuid.UUID) error {
	if s.prs != nil {
		if err := s.prs.RebuildForExercises(userID, exerciseIDs); err != nil {
			return err
		}
	}
	if s.challenges != nil {
		if err := s.challenges.RecalculateForUser(userID); err != nil {
			return err
		}
	}

	return nil
}

func collectWorkoutExerciseIDs(workout *model.Workout) []uuid.UUID {
	if workout == nil {
		return []uuid.UUID{}
	}

	ids := make([]uuid.UUID, 0, len(workout.Exercises))
	for _, exercise := range workout.Exercises {
		ids = append(ids, exercise.ExerciseID)
	}

	return uniqueUUIDs(ids)
}

func collectWorkoutDataExerciseIDs(workouts []dto.WorkoutFullData) []uuid.UUID {
	ids := make([]uuid.UUID, 0)
	for _, workout := range workouts {
		for _, exercise := range workout.Exercises {
			ids = append(ids, exercise.ExerciseID)
		}
	}

	return uniqueUUIDs(ids)
}
