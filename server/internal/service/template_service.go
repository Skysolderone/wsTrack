package service

import (
	"encoding/json"
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

type TemplateService struct {
	templates repository.TemplateRepository
	plans     repository.PlanRepository
	exercises repository.ExerciseRepository
}

func NewTemplateService(
	templates repository.TemplateRepository,
	plans repository.PlanRepository,
	exercises repository.ExerciseRepository,
) *TemplateService {
	return &TemplateService{
		templates: templates,
		plans:     plans,
		exercises: exercises,
	}
}

func (s *TemplateService) List(userID uuid.UUID) ([]dto.TemplateResponse, error) {
	templates, err := s.templates.List(userID)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to list templates")
	}

	items := make([]dto.TemplateResponse, 0, len(templates))
	for i := range templates {
		snapshot, err := parseStoredTemplateSnapshot(templates[i].Snapshot)
		if err != nil {
			return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to decode template snapshot")
		}
		items = append(items, toTemplateResponse(&templates[i], snapshot))
	}

	return items, nil
}

func (s *TemplateService) GetByID(id, userID uuid.UUID) (*dto.TemplateResponse, error) {
	template, snapshot, err := s.requireTemplate(id, userID)
	if err != nil {
		return nil, err
	}

	response := toTemplateResponse(template, snapshot)
	return &response, nil
}

func (s *TemplateService) SaveFromPlan(userID uuid.UUID, req dto.SaveAsTemplateRequest) (*dto.TemplateResponse, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "name cannot be empty")
	}

	plan, err := s.plans.FindByID(req.PlanID, userID)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query plan")
	}
	if plan == nil {
		return nil, apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "plan not found")
	}

	planDetail := toPlanDetailResponse(plan)
	snapshot := dto.TemplateSnapshot{
		Name:        name,
		Description: normalizePlanString(req.Description),
		Goal:        planDetail.Goal,
		Days:        ensureTemplateSnapshotIDs(planDetail.Days),
	}
	if snapshot.Description == nil {
		snapshot.Description = planDetail.Description
	}

	payload, err := json.Marshal(snapshot)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to encode template snapshot")
	}

	template := &model.Template{
		UserID:      &userID,
		Name:        snapshot.Name,
		Description: snapshot.Description,
		Goal:        plan.Goal,
		IsBuiltIn:   false,
		Snapshot:    model.JSON(payload),
	}
	if err := s.templates.Create(template); err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to save template")
	}

	response := toTemplateResponse(template, snapshot)
	return &response, nil
}

func (s *TemplateService) Apply(userID, templateID uuid.UUID) (*dto.PlanDetailResponse, error) {
	template, snapshot, err := s.requireTemplate(templateID, userID)
	if err != nil {
		return nil, err
	}

	if err := s.validateTemplateExercises(userID, snapshot); err != nil {
		return nil, err
	}

	plan, err := s.templates.CreatePlanFromTemplate(userID, template, snapshot)
	if err != nil {
		if errors.Is(err, gorm.ErrForeignKeyViolated) {
			return nil, apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "template references invalid exercises")
		}
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to apply template")
	}

	response := toPlanDetailResponse(plan)
	return &response, nil
}

func (s *TemplateService) Import(userID uuid.UUID, req dto.ImportTemplateRequest) (*dto.TemplateResponse, error) {
	importPayload, err := json.Marshal(req.TemplateJSON)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusBadRequest, apperrors.CodeBadRequest, "invalid template_json payload")
	}

	snapshot, goal, err := s.parseAndHydrateTemplateSnapshot(userID, importPayload)
	if err != nil {
		return nil, err
	}

	payload, err := json.Marshal(snapshot)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to encode imported template")
	}

	template := &model.Template{
		UserID:      &userID,
		Name:        snapshot.Name,
		Description: snapshot.Description,
		Goal:        goal,
		IsBuiltIn:   false,
		Snapshot:    model.JSON(payload),
	}
	if err := s.templates.Create(template); err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to import template")
	}

	response := toTemplateResponse(template, snapshot)
	return &response, nil
}

func (s *TemplateService) Export(userID, templateID uuid.UUID) (json.RawMessage, error) {
	template, _, err := s.requireTemplate(templateID, userID)
	if err != nil {
		return nil, err
	}

	return json.RawMessage(template.Snapshot), nil
}

func (s *TemplateService) Delete(userID, templateID uuid.UUID) error {
	template, _, err := s.requireTemplate(templateID, userID)
	if err != nil {
		return err
	}
	if template.IsBuiltIn || template.UserID == nil || *template.UserID != userID {
		return apperrors.New(http.StatusForbidden, apperrors.CodeForbidden, "can only delete your own custom templates")
	}

	if err := s.templates.Delete(templateID, userID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "template not found")
		}
		return apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to delete template")
	}

	return nil
}

func (s *TemplateService) requireTemplate(id, userID uuid.UUID) (*model.Template, dto.TemplateSnapshot, error) {
	template, err := s.templates.FindByID(id, userID)
	if err != nil {
		return nil, dto.TemplateSnapshot{}, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query template")
	}
	if template == nil {
		return nil, dto.TemplateSnapshot{}, apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "template not found")
	}

	snapshot, err := parseStoredTemplateSnapshot(template.Snapshot)
	if err != nil {
		return nil, dto.TemplateSnapshot{}, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to decode template snapshot")
	}

	return template, snapshot, nil
}

func (s *TemplateService) parseAndHydrateTemplateSnapshot(userID uuid.UUID, payload json.RawMessage) (dto.TemplateSnapshot, *enum.PlanGoal, error) {
	var snapshot dto.TemplateSnapshot
	if err := json.Unmarshal(payload, &snapshot); err != nil {
		return snapshot, nil, apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "invalid template_json payload")
	}

	snapshot.Name = strings.TrimSpace(snapshot.Name)
	if snapshot.Name == "" {
		return snapshot, nil, apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "template name cannot be empty")
	}
	snapshot.Description = normalizePlanString(snapshot.Description)
	snapshot.Days = ensureTemplateSnapshotIDs(snapshot.Days)

	goal, err := parsePlanGoal(snapshot.Goal)
	if err != nil {
		return snapshot, nil, err
	}

	for dayIndex := range snapshot.Days {
		dayName := strings.TrimSpace(snapshot.Days[dayIndex].Name)
		if dayName == "" {
			return snapshot, nil, apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "template day name cannot be empty")
		}
		snapshot.Days[dayIndex].Name = dayName

		for exerciseIndex := range snapshot.Days[dayIndex].Exercises {
			exerciseID := snapshot.Days[dayIndex].Exercises[exerciseIndex].Exercise.ID
			if exerciseID == uuid.Nil {
				return snapshot, nil, apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "template exercise id is required")
			}

			exercise, err := s.exercises.FindByID(exerciseID, userID)
			if err != nil {
				return snapshot, nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query exercise")
			}
			if exercise == nil {
				return snapshot, nil, apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "template references unknown exercise")
			}

			snapshot.Days[dayIndex].Exercises[exerciseIndex].Exercise = toExerciseResponse(exercise)
			snapshot.Days[dayIndex].Exercises[exerciseIndex].Notes = normalizePlanString(snapshot.Days[dayIndex].Exercises[exerciseIndex].Notes)
			snapshot.Days[dayIndex].Exercises[exerciseIndex].TargetReps = normalizePlanString(snapshot.Days[dayIndex].Exercises[exerciseIndex].TargetReps)
		}
	}

	return snapshot, goal, nil
}

func (s *TemplateService) validateTemplateExercises(userID uuid.UUID, snapshot dto.TemplateSnapshot) error {
	for _, day := range snapshot.Days {
		for _, exerciseItem := range day.Exercises {
			exercise, err := s.exercises.FindByID(exerciseItem.Exercise.ID, userID)
			if err != nil {
				return apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query template exercise")
			}
			if exercise == nil {
				return apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "template exercise not found")
			}
		}
	}

	return nil
}

func toTemplateResponse(template *model.Template, snapshot dto.TemplateSnapshot) dto.TemplateResponse {
	response := dto.TemplateResponse{
		ID:          template.ID,
		Name:        template.Name,
		Description: template.Description,
		Goal:        nil,
		IsBuiltIn:   template.IsBuiltIn,
		Days:        snapshot.Days,
		CreatedAt:   template.CreatedAt,
	}
	if template.Goal != nil {
		goal := string(*template.Goal)
		response.Goal = &goal
	}

	return response
}

func ensureTemplateSnapshotIDs(days []dto.PlanDayResponse) []dto.PlanDayResponse {
	if days == nil {
		return []dto.PlanDayResponse{}
	}

	for dayIndex := range days {
		if days[dayIndex].ID == uuid.Nil {
			days[dayIndex].ID = uuid.New()
		}
		for exerciseIndex := range days[dayIndex].Exercises {
			if days[dayIndex].Exercises[exerciseIndex].ID == uuid.Nil {
				days[dayIndex].Exercises[exerciseIndex].ID = uuid.New()
			}
		}
	}

	return days
}

func parseStoredTemplateSnapshot(payload model.JSON) (dto.TemplateSnapshot, error) {
	var snapshot dto.TemplateSnapshot
	if len(payload) == 0 {
		return snapshot, errors.New("template snapshot is empty")
	}
	if err := json.Unmarshal(payload, &snapshot); err != nil {
		return snapshot, err
	}

	return snapshot, nil
}
