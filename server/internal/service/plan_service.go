package service

import (
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"wsTrack/server/internal/dto"
	"wsTrack/server/internal/enum"
	apperrors "wsTrack/server/internal/errors"
	"wsTrack/server/internal/model"
	"wsTrack/server/internal/repository"
)

type PlanService struct {
	plans         repository.PlanRepository
	planDays      repository.PlanDayRepository
	planExercises repository.PlanExerciseRepository
	exercises     repository.ExerciseRepository
}

func NewPlanService(
	plans repository.PlanRepository,
	planDays repository.PlanDayRepository,
	planExercises repository.PlanExerciseRepository,
	exercises repository.ExerciseRepository,
) *PlanService {
	return &PlanService{
		plans:         plans,
		planDays:      planDays,
		planExercises: planExercises,
		exercises:     exercises,
	}
}

func (s *PlanService) List(userID uuid.UUID) ([]dto.PlanDetailResponse, error) {
	plans, err := s.plans.List(userID)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to list plans")
	}

	return toPlanDetailResponses(plans), nil
}

func (s *PlanService) GetByID(id, userID uuid.UUID) (*dto.PlanDetailResponse, error) {
	plan, err := s.requirePlan(id, userID)
	if err != nil {
		return nil, err
	}

	response := toPlanDetailResponse(plan)
	return &response, nil
}

func (s *PlanService) Create(userID uuid.UUID, req dto.CreatePlanRequest) (*dto.PlanDetailResponse, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "name cannot be empty")
	}

	goal, err := parsePlanGoal(req.Goal)
	if err != nil {
		return nil, err
	}

	plan := &model.Plan{
		UserID:      userID,
		Name:        name,
		Description: normalizePlanString(req.Description),
		Goal:        goal,
		IsActive:    false,
	}

	if err := s.plans.Create(plan); err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to create plan")
	}

	response := toPlanDetailResponse(plan)
	response.Days = []dto.PlanDayResponse{}
	return &response, nil
}

func (s *PlanService) Update(id, userID uuid.UUID, req dto.UpdatePlanRequest) (*dto.PlanDetailResponse, error) {
	plan, err := s.requirePlan(id, userID)
	if err != nil {
		return nil, err
	}

	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" {
			return nil, apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "name cannot be empty")
		}
		plan.Name = name
	}
	if req.Description != nil {
		plan.Description = normalizePlanString(req.Description)
	}
	if req.Goal != nil {
		goal, err := parsePlanGoal(req.Goal)
		if err != nil {
			return nil, err
		}
		plan.Goal = goal
	}
	if req.IsActive != nil {
		plan.IsActive = *req.IsActive
	}

	if err := s.plans.Update(plan); err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to update plan")
	}

	if req.IsActive != nil && *req.IsActive {
		if err := s.plans.SetActive(id, userID); err != nil {
			return nil, s.wrapRepoError(err, "failed to activate plan")
		}
		plan.IsActive = true
	}

	updated, err := s.requirePlan(id, userID)
	if err != nil {
		return nil, err
	}

	response := toPlanDetailResponse(updated)
	return &response, nil
}

func (s *PlanService) Delete(id, userID uuid.UUID) error {
	if err := s.plans.Delete(id, userID); err != nil {
		return s.wrapRepoError(err, "failed to delete plan")
	}

	return nil
}

func (s *PlanService) Duplicate(id, userID uuid.UUID) (*dto.PlanDetailResponse, error) {
	plan, err := s.plans.Duplicate(id, userID)
	if err != nil {
		return nil, s.wrapRepoError(err, "failed to duplicate plan")
	}

	response := toPlanDetailResponse(plan)
	return &response, nil
}

func (s *PlanService) Activate(id, userID uuid.UUID) (*dto.PlanDetailResponse, error) {
	if err := s.plans.SetActive(id, userID); err != nil {
		return nil, s.wrapRepoError(err, "failed to activate plan")
	}

	plan, err := s.requirePlan(id, userID)
	if err != nil {
		return nil, err
	}

	response := toPlanDetailResponse(plan)
	return &response, nil
}

func (s *PlanService) AddDay(planID, userID uuid.UUID, req dto.AddPlanDayRequest) (*dto.PlanDayResponse, error) {
	if _, err := s.requirePlan(planID, userID); err != nil {
		return nil, err
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "day name cannot be empty")
	}

	day := &model.PlanDay{
		PlanID: planID,
		Name:   name,
	}

	if err := s.planDays.AddDay(day); err != nil {
		return nil, s.wrapRepoError(err, "failed to add plan day")
	}

	response := toPlanDayResponse(day)
	return &response, nil
}

func (s *PlanService) UpdateDay(dayID, userID uuid.UUID, req dto.AddPlanDayRequest) (*dto.PlanDayResponse, error) {
	day, err := s.requireDay(dayID, userID)
	if err != nil {
		return nil, err
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "day name cannot be empty")
	}
	day.Name = name

	if err := s.planDays.UpdateDay(day); err != nil {
		return nil, s.wrapRepoError(err, "failed to update plan day")
	}

	response := toPlanDayResponse(day)
	return &response, nil
}

func (s *PlanService) DeleteDay(dayID, userID uuid.UUID) error {
	if _, err := s.requireDay(dayID, userID); err != nil {
		return err
	}

	if err := s.planDays.DeleteDay(dayID); err != nil {
		return s.wrapRepoError(err, "failed to delete plan day")
	}

	return nil
}

func (s *PlanService) ReorderDays(dayID, userID uuid.UUID, orderedIDs []uuid.UUID) error {
	day, err := s.requireDay(dayID, userID)
	if err != nil {
		return err
	}
	if len(orderedIDs) == 0 {
		return apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "ordered_ids cannot be empty")
	}

	if err := s.planDays.ReorderDays(day.PlanID, orderedIDs); err != nil {
		return s.wrapRepoError(err, "failed to reorder plan days")
	}

	return nil
}

func (s *PlanService) AddExercise(dayID, userID uuid.UUID, req dto.AddPlanExerciseRequest) (*dto.PlanExerciseResponse, error) {
	if _, err := s.requireDay(dayID, userID); err != nil {
		return nil, err
	}
	if _, err := s.requireVisibleExercise(req.ExerciseID, userID); err != nil {
		return nil, err
	}

	planExercise := &model.PlanExercise{
		PlanDayID:     dayID,
		ExerciseID:    req.ExerciseID,
		TargetSets:    req.TargetSets,
		TargetReps:    normalizePlanString(req.TargetReps),
		TargetWeight:  req.TargetWeight,
		RestSeconds:   req.RestSeconds,
		SupersetGroup: req.SupersetGroup,
		Notes:         normalizePlanString(req.Notes),
	}

	if err := s.planExercises.AddExercise(planExercise); err != nil {
		return nil, s.wrapRepoError(err, "failed to add plan exercise")
	}

	response := toPlanExerciseResponse(planExercise)
	return &response, nil
}

func (s *PlanService) UpdateExercise(id, userID uuid.UUID, req dto.AddPlanExerciseRequest) (*dto.PlanExerciseResponse, error) {
	planExercise, err := s.requirePlanExercise(id, userID)
	if err != nil {
		return nil, err
	}
	if _, err := s.requireVisibleExercise(req.ExerciseID, userID); err != nil {
		return nil, err
	}

	planExercise.ExerciseID = req.ExerciseID
	planExercise.TargetSets = req.TargetSets
	planExercise.TargetReps = normalizePlanString(req.TargetReps)
	planExercise.TargetWeight = req.TargetWeight
	planExercise.RestSeconds = req.RestSeconds
	planExercise.SupersetGroup = req.SupersetGroup
	planExercise.Notes = normalizePlanString(req.Notes)

	if err := s.planExercises.UpdateExercise(planExercise); err != nil {
		return nil, s.wrapRepoError(err, "failed to update plan exercise")
	}

	response := toPlanExerciseResponse(planExercise)
	return &response, nil
}

func (s *PlanService) DeleteExercise(id, userID uuid.UUID) error {
	if _, err := s.requirePlanExercise(id, userID); err != nil {
		return err
	}

	if err := s.planExercises.DeleteExercise(id); err != nil {
		return s.wrapRepoError(err, "failed to delete plan exercise")
	}

	return nil
}

func (s *PlanService) ReorderExercises(dayID, userID uuid.UUID, orderedIDs []uuid.UUID) error {
	if _, err := s.requireDay(dayID, userID); err != nil {
		return err
	}
	if len(orderedIDs) == 0 {
		return apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "ordered_ids cannot be empty")
	}

	if err := s.planExercises.ReorderExercises(dayID, orderedIDs); err != nil {
		return s.wrapRepoError(err, "failed to reorder plan exercises")
	}

	return nil
}

func (s *PlanService) requirePlan(id, userID uuid.UUID) (*model.Plan, error) {
	plan, err := s.plans.FindByID(id, userID)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query plan")
	}
	if plan == nil {
		return nil, apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "plan not found")
	}

	return plan, nil
}

func (s *PlanService) requireDay(id, userID uuid.UUID) (*model.PlanDay, error) {
	day, err := s.planDays.FindByID(id, userID)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query plan day")
	}
	if day == nil {
		return nil, apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "plan day not found")
	}

	return day, nil
}

func (s *PlanService) requirePlanExercise(id, userID uuid.UUID) (*model.PlanExercise, error) {
	planExercise, err := s.planExercises.FindByID(id, userID)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query plan exercise")
	}
	if planExercise == nil {
		return nil, apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "plan exercise not found")
	}

	return planExercise, nil
}

func (s *PlanService) requireVisibleExercise(id, userID uuid.UUID) (*model.Exercise, error) {
	exercise, err := s.exercises.FindByID(id, userID)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query exercise")
	}
	if exercise == nil {
		return nil, apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "exercise not found")
	}

	return exercise, nil
}

func (s *PlanService) wrapRepoError(err error, message string) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "resource not found")
	}

	return apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, message)
}

func toPlanDetailResponses(plans []model.Plan) []dto.PlanDetailResponse {
	items := make([]dto.PlanDetailResponse, 0, len(plans))
	for i := range plans {
		items = append(items, toPlanDetailResponse(&plans[i]))
	}

	return items
}

func toPlanDetailResponse(plan *model.Plan) dto.PlanDetailResponse {
	response := dto.PlanDetailResponse{
		ID:          plan.ID,
		Name:        plan.Name,
		Description: plan.Description,
		Goal:        nil,
		IsActive:    plan.IsActive,
		Days:        make([]dto.PlanDayResponse, 0, len(plan.Days)),
		CreatedAt:   plan.CreatedAt,
		UpdatedAt:   plan.UpdatedAt,
	}
	if plan.Goal != nil {
		goal := string(*plan.Goal)
		response.Goal = &goal
	}

	for i := range plan.Days {
		response.Days = append(response.Days, toPlanDayResponse(&plan.Days[i]))
	}

	return response
}

func toPlanDayResponse(day *model.PlanDay) dto.PlanDayResponse {
	response := dto.PlanDayResponse{
		ID:        day.ID,
		Name:      day.Name,
		SortOrder: day.SortOrder,
		Exercises: make([]dto.PlanExerciseResponse, 0, len(day.Exercises)),
	}

	for i := range day.Exercises {
		response.Exercises = append(response.Exercises, toPlanExerciseResponse(&day.Exercises[i]))
	}

	return response
}

func toPlanExerciseResponse(planExercise *model.PlanExercise) dto.PlanExerciseResponse {
	return dto.PlanExerciseResponse{
		ID:            planExercise.ID,
		Exercise:      toExerciseResponse(&planExercise.Exercise),
		TargetSets:    planExercise.TargetSets,
		TargetReps:    planExercise.TargetReps,
		TargetWeight:  planExercise.TargetWeight,
		RestSeconds:   planExercise.RestSeconds,
		SupersetGroup: planExercise.SupersetGroup,
		SortOrder:     planExercise.SortOrder,
		Notes:         planExercise.Notes,
	}
}

func normalizePlanString(value *string) *string {
	if value == nil {
		return nil
	}

	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}

	return &trimmed
}

func parsePlanGoal(value *string) (*enum.PlanGoal, error) {
	if value == nil {
		return nil, nil
	}

	goal := enum.PlanGoal(strings.TrimSpace(*value))
	switch goal {
	case enum.PlanGoalHypertrophy, enum.PlanGoalStrength, enum.PlanGoalEndurance, enum.PlanGoalGeneral:
		return &goal, nil
	default:
		return nil, apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "invalid plan goal")
	}
}
