package service

import (
	"net/http"
	"strings"

	"github.com/google/uuid"

	"wsTrack/server/internal/dto"
	"wsTrack/server/internal/enum"
	apperrors "wsTrack/server/internal/errors"
	"wsTrack/server/internal/model"
	"wsTrack/server/internal/repository"
)

type ExerciseService struct {
	exercises repository.ExerciseRepository
}

func NewExerciseService(exercises repository.ExerciseRepository) *ExerciseService {
	return &ExerciseService{exercises: exercises}
}

func (s *ExerciseService) List(userID uuid.UUID, filter dto.ExerciseFilter) ([]dto.ExerciseResponse, int64, error) {
	exercises, total, err := s.exercises.List(userID, filter)
	if err != nil {
		return nil, 0, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to list exercises")
	}

	return toExerciseResponses(exercises), total, nil
}

func (s *ExerciseService) GetByID(id, userID uuid.UUID) (*dto.ExerciseResponse, error) {
	exercise, err := s.exercises.FindByID(id, userID)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query exercise")
	}
	if exercise == nil {
		return nil, apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "exercise not found")
	}

	response := toExerciseResponse(exercise)
	return &response, nil
}

func (s *ExerciseService) Create(userID uuid.UUID, req dto.CreateExerciseRequest) (*dto.ExerciseResponse, error) {
	category, err := parseExerciseCategory(req.Category)
	if err != nil {
		return nil, err
	}
	primaryMuscles, err := parseMuscles(req.PrimaryMuscles, true)
	if err != nil {
		return nil, err
	}
	secondaryMuscles, err := parseMuscles(req.SecondaryMuscles, false)
	if err != nil {
		return nil, err
	}
	equipment, err := parseEquipment(req.Equipment)
	if err != nil {
		return nil, err
	}
	trackingType, err := parseTrackingType(req.TrackingType)
	if err != nil {
		return nil, err
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "name cannot be empty")
	}

	exercise := &model.Exercise{
		UserID:           &userID,
		Name:             name,
		NameEn:           normalizeOptionalString(req.NameEn),
		Category:         category,
		PrimaryMuscles:   primaryMuscles,
		SecondaryMuscles: secondaryMuscles,
		Equipment:        equipment,
		TrackingType:     trackingType,
		IsCustom:         true,
		Notes:            normalizeOptionalString(req.Notes),
	}

	if err := s.exercises.Create(exercise); err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to create exercise")
	}

	response := toExerciseResponse(exercise)
	return &response, nil
}

func (s *ExerciseService) Update(id, userID uuid.UUID, req dto.UpdateExerciseRequest) (*dto.ExerciseResponse, error) {
	exercise, err := s.exercises.FindByID(id, userID)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query exercise")
	}
	if exercise == nil {
		return nil, apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "exercise not found")
	}
	if !ownsCustomExercise(exercise, userID) {
		return nil, apperrors.New(http.StatusForbidden, apperrors.CodeForbidden, "can only update your own custom exercise")
	}

	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" {
			return nil, apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "name cannot be empty")
		}
		exercise.Name = name
	}
	if req.NameEn != nil {
		exercise.NameEn = normalizeOptionalString(req.NameEn)
	}
	if req.Category != nil {
		category, err := parseExerciseCategory(*req.Category)
		if err != nil {
			return nil, err
		}
		exercise.Category = category
	}
	if req.PrimaryMuscles != nil {
		primaryMuscles, err := parseMuscles(req.PrimaryMuscles, true)
		if err != nil {
			return nil, err
		}
		exercise.PrimaryMuscles = primaryMuscles
	}
	if req.SecondaryMuscles != nil {
		secondaryMuscles, err := parseMuscles(req.SecondaryMuscles, false)
		if err != nil {
			return nil, err
		}
		exercise.SecondaryMuscles = secondaryMuscles
	}
	if req.Equipment != nil {
		equipment, err := parseEquipment(*req.Equipment)
		if err != nil {
			return nil, err
		}
		exercise.Equipment = equipment
	}
	if req.TrackingType != nil {
		trackingType, err := parseTrackingType(*req.TrackingType)
		if err != nil {
			return nil, err
		}
		exercise.TrackingType = trackingType
	}
	if req.Notes != nil {
		exercise.Notes = normalizeOptionalString(req.Notes)
	}

	if err := s.exercises.Update(exercise); err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to update exercise")
	}

	response := toExerciseResponse(exercise)
	return &response, nil
}

func (s *ExerciseService) Delete(id, userID uuid.UUID) error {
	exercise, err := s.exercises.FindByID(id, userID)
	if err != nil {
		return apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query exercise")
	}
	if exercise == nil {
		return apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "exercise not found")
	}
	if !ownsCustomExercise(exercise, userID) {
		return apperrors.New(http.StatusForbidden, apperrors.CodeForbidden, "can only delete your own custom exercise")
	}

	if err := s.exercises.SoftDelete(id, userID); err != nil {
		return apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to delete exercise")
	}

	return nil
}

func ownsCustomExercise(exercise *model.Exercise, userID uuid.UUID) bool {
	return exercise != nil && exercise.IsCustom && exercise.UserID != nil && *exercise.UserID == userID
}

func toExerciseResponses(exercises []model.Exercise) []dto.ExerciseResponse {
	result := make([]dto.ExerciseResponse, 0, len(exercises))
	for i := range exercises {
		result = append(result, toExerciseResponse(&exercises[i]))
	}

	return result
}

func toExerciseResponse(exercise *model.Exercise) dto.ExerciseResponse {
	return dto.ExerciseResponse{
		ID:               exercise.ID,
		Name:             exercise.Name,
		NameEn:           exercise.NameEn,
		Category:         string(exercise.Category),
		PrimaryMuscles:   []string(exercise.PrimaryMuscles),
		SecondaryMuscles: []string(exercise.SecondaryMuscles),
		Equipment:        string(exercise.Equipment),
		TrackingType:     string(exercise.TrackingType),
		IsCustom:         exercise.IsCustom,
		Notes:            exercise.Notes,
		CreatedAt:        exercise.CreatedAt,
	}
}

func normalizeOptionalString(value *string) *string {
	if value == nil {
		return nil
	}

	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}

	return &trimmed
}

func parseMuscles(muscles []string, required bool) (model.StringArray, error) {
	if len(muscles) == 0 {
		if required {
			return nil, apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "primary_muscles cannot be empty")
		}
		return model.StringArray{}, nil
	}

	result := make(model.StringArray, 0, len(muscles))
	for _, muscle := range muscles {
		switch enum.MuscleGroup(strings.TrimSpace(muscle)) {
		case enum.MuscleChest,
			enum.MuscleBack,
			enum.MuscleShoulder,
			enum.MuscleBiceps,
			enum.MuscleTriceps,
			enum.MuscleForearms,
			enum.MuscleAbs,
			enum.MuscleGlutes,
			enum.MuscleQuads,
			enum.MuscleHamstrings,
			enum.MuscleCalves,
			enum.MuscleFullBody:
			result = append(result, strings.TrimSpace(muscle))
		default:
			return nil, apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "invalid muscle group")
		}
	}

	return result, nil
}

func parseExerciseCategory(category string) (enum.ExerciseCategory, error) {
	switch enum.ExerciseCategory(strings.TrimSpace(category)) {
	case enum.ExerciseCategoryStrength,
		enum.ExerciseCategoryCardio,
		enum.ExerciseCategoryBodyweight,
		enum.ExerciseCategoryStretch:
		return enum.ExerciseCategory(strings.TrimSpace(category)), nil
	default:
		return "", apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "invalid exercise category")
	}
}

func parseEquipment(equipment string) (enum.Equipment, error) {
	switch enum.Equipment(strings.TrimSpace(equipment)) {
	case enum.EquipmentBarbell,
		enum.EquipmentDumbbell,
		enum.EquipmentMachine,
		enum.EquipmentCable,
		enum.EquipmentBodyweight,
		enum.EquipmentBand,
		enum.EquipmentKettlebell,
		enum.EquipmentEZBar,
		enum.EquipmentSmithMachine,
		enum.EquipmentOther:
		return enum.Equipment(strings.TrimSpace(equipment)), nil
	default:
		return "", apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "invalid equipment")
	}
}

func parseTrackingType(trackingType string) (enum.TrackingType, error) {
	switch enum.TrackingType(strings.TrimSpace(trackingType)) {
	case enum.TrackingTypeWeightReps,
		enum.TrackingTypeTime,
		enum.TrackingTypeDistance,
		enum.TrackingTypeRepsOnly:
		return enum.TrackingType(strings.TrimSpace(trackingType)), nil
	default:
		return "", apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "invalid tracking type")
	}
}
