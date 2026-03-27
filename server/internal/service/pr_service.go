package service

import (
	"net/http"

	"github.com/google/uuid"

	"wsTrack/server/internal/dto"
	apperrors "wsTrack/server/internal/errors"
	"wsTrack/server/internal/model"
	"wsTrack/server/internal/repository"
)

type PRService struct {
	personalRecords repository.PersonalRecordRepository
}

func NewPRService(personalRecords repository.PersonalRecordRepository) *PRService {
	return &PRService{personalRecords: personalRecords}
}

func (s *PRService) List(userID uuid.UUID, exerciseID *uuid.UUID) ([]dto.PRRecord, error) {
	records, err := s.personalRecords.List(userID, exerciseID)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to list personal records")
	}

	items := make([]dto.PRRecord, 0, len(records))
	for i := range records {
		items = append(items, dto.PRRecord{
			ID:           records[i].ID,
			ExerciseName: records[i].Exercise.Name,
			PRType:       records[i].PRType,
			Value:        records[i].Value,
			Unit:         records[i].Unit,
			AchievedAt:   records[i].AchievedAt,
		})
	}

	return items, nil
}

func (s *PRService) RebuildForExercises(userID uuid.UUID, exerciseIDs []uuid.UUID) error {
	uniqueExerciseIDs := uniqueUUIDs(exerciseIDs)
	for _, exerciseID := range uniqueExerciseIDs {
		history, err := s.personalRecords.ListSetHistory(userID, exerciseID)
		if err != nil {
			return apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to load exercise history")
		}

		records := make([]model.PersonalRecord, 0)
		bestValues := map[string]float64{}
		for _, item := range history {
			if item.Weight != nil {
				records = appendPRIfBetter(records, bestValues, model.PersonalRecord{
					UserID:       userID,
					ExerciseID:   exerciseID,
					WorkoutID:    ptrUUID(item.WorkoutID),
					WorkoutSetID: ptrUUID(item.SetID),
					PRType:       "max_weight",
					Value:        *item.Weight,
					Unit:         item.Unit,
					AchievedAt:   item.AchievedAt,
				}, "max_weight|"+item.Unit)
			}

			if item.Reps != nil {
				records = appendPRIfBetter(records, bestValues, model.PersonalRecord{
					UserID:       userID,
					ExerciseID:   exerciseID,
					WorkoutID:    ptrUUID(item.WorkoutID),
					WorkoutSetID: ptrUUID(item.SetID),
					PRType:       "max_reps",
					Value:        float64(*item.Reps),
					Unit:         "reps",
					AchievedAt:   item.AchievedAt,
				}, "max_reps|reps")
			}

			if item.Weight != nil && item.Reps != nil {
				volume := *item.Weight * float64(*item.Reps)
				records = appendPRIfBetter(records, bestValues, model.PersonalRecord{
					UserID:       userID,
					ExerciseID:   exerciseID,
					WorkoutID:    ptrUUID(item.WorkoutID),
					WorkoutSetID: ptrUUID(item.SetID),
					PRType:       "max_volume",
					Value:        volume,
					Unit:         item.Unit,
					AchievedAt:   item.AchievedAt,
				}, "max_volume|"+item.Unit)

				estimated1RM := *item.Weight * (1 + float64(*item.Reps)/30.0)
				records = appendPRIfBetter(records, bestValues, model.PersonalRecord{
					UserID:       userID,
					ExerciseID:   exerciseID,
					WorkoutID:    ptrUUID(item.WorkoutID),
					WorkoutSetID: ptrUUID(item.SetID),
					PRType:       "estimated_1rm",
					Value:        estimated1RM,
					Unit:         item.Unit,
					AchievedAt:   item.AchievedAt,
				}, "estimated_1rm|"+item.Unit)
			}
		}

		if err := s.personalRecords.ReplaceByExercise(userID, exerciseID, records); err != nil {
			return apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to rebuild personal records")
		}
	}

	return nil
}

func appendPRIfBetter(records []model.PersonalRecord, bestValues map[string]float64, record model.PersonalRecord, key string) []model.PersonalRecord {
	if current, ok := bestValues[key]; ok && record.Value <= current {
		return records
	}

	bestValues[key] = record.Value
	records = append(records, record)
	return records
}

func ptrUUID(id uuid.UUID) *uuid.UUID {
	value := id
	return &value
}

func uniqueUUIDs(ids []uuid.UUID) []uuid.UUID {
	if len(ids) == 0 {
		return []uuid.UUID{}
	}

	result := make([]uuid.UUID, 0, len(ids))
	seen := make(map[uuid.UUID]struct{}, len(ids))
	for _, id := range ids {
		if id == uuid.Nil {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		result = append(result, id)
	}

	return result
}
