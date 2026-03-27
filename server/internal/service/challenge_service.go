package service

import (
	"net/http"
	"strings"

	"github.com/google/uuid"

	"wsTrack/server/internal/dto"
	apperrors "wsTrack/server/internal/errors"
	"wsTrack/server/internal/model"
	"wsTrack/server/internal/repository"
)

type ChallengeService struct {
	challenges repository.ChallengeRepository
}

func NewChallengeService(challenges repository.ChallengeRepository) *ChallengeService {
	return &ChallengeService{challenges: challenges}
}

func (s *ChallengeService) List(userID uuid.UUID, filter dto.ChallengeFilter) ([]dto.ChallengeResponse, error) {
	if err := s.challenges.RecalculateProgress(userID); err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to recalculate challenges")
	}

	items, err := s.challenges.List(userID, filter.Status)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to list challenges")
	}

	return toChallengeResponses(items), nil
}

func (s *ChallengeService) Create(userID uuid.UUID, req dto.CreateChallengeRequest) (*dto.ChallengeResponse, error) {
	challengeType, err := parseChallengeType(req.Type)
	if err != nil {
		return nil, err
	}
	if req.EndDate.Before(req.StartDate) {
		return nil, apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "end_date must be after start_date")
	}

	challenge := &model.Challenge{
		UserID:      userID,
		Type:        challengeType,
		TargetValue: req.TargetValue,
		StartDate:   req.StartDate,
		EndDate:     req.EndDate,
	}
	if err := s.challenges.Create(challenge); err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to create challenge")
	}
	if err := s.challenges.RecalculateProgress(userID); err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to recalculate challenges")
	}

	updated, err := s.requireChallenge(challenge.ID, userID)
	if err != nil {
		return nil, err
	}

	response := toChallengeResponse(updated)
	return &response, nil
}

func (s *ChallengeService) Update(id, userID uuid.UUID, req dto.UpdateChallengeRequest) (*dto.ChallengeResponse, error) {
	challenge, err := s.requireChallenge(id, userID)
	if err != nil {
		return nil, err
	}

	if req.Type != nil {
		challengeType, err := parseChallengeType(*req.Type)
		if err != nil {
			return nil, err
		}
		challenge.Type = challengeType
	}
	if req.TargetValue != nil {
		challenge.TargetValue = *req.TargetValue
	}
	if req.StartDate != nil {
		challenge.StartDate = *req.StartDate
	}
	if req.EndDate != nil {
		challenge.EndDate = *req.EndDate
	}
	if challenge.EndDate.Before(challenge.StartDate) {
		return nil, apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "end_date must be after start_date")
	}

	if err := s.challenges.Update(challenge); err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to update challenge")
	}
	if err := s.challenges.RecalculateProgress(userID); err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to recalculate challenges")
	}

	updated, err := s.requireChallenge(id, userID)
	if err != nil {
		return nil, err
	}

	response := toChallengeResponse(updated)
	return &response, nil
}

func (s *ChallengeService) Delete(id, userID uuid.UUID) error {
	if _, err := s.requireChallenge(id, userID); err != nil {
		return err
	}

	if err := s.challenges.Delete(id, userID); err != nil {
		return apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to delete challenge")
	}

	return nil
}

func (s *ChallengeService) RecalculateForUser(userID uuid.UUID) error {
	if err := s.challenges.RecalculateProgress(userID); err != nil {
		return apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to recalculate challenges")
	}

	return nil
}

func (s *ChallengeService) requireChallenge(id, userID uuid.UUID) (*model.Challenge, error) {
	challenge, err := s.challenges.FindByID(id, userID)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query challenge")
	}
	if challenge == nil {
		return nil, apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "challenge not found")
	}

	return challenge, nil
}

func toChallengeResponses(challenges []model.Challenge) []dto.ChallengeResponse {
	items := make([]dto.ChallengeResponse, 0, len(challenges))
	for i := range challenges {
		items = append(items, toChallengeResponse(&challenges[i]))
	}

	return items
}

func toChallengeResponse(challenge *model.Challenge) dto.ChallengeResponse {
	return dto.ChallengeResponse{
		ID:           challenge.ID,
		Type:         challenge.Type,
		TargetValue:  challenge.TargetValue,
		CurrentValue: challenge.CurrentValue,
		StartDate:    challenge.StartDate,
		EndDate:      challenge.EndDate,
		IsCompleted:  challenge.IsCompleted,
		CreatedAt:    challenge.CreatedAt,
		UpdatedAt:    challenge.UpdatedAt,
	}
}

func parseChallengeType(value string) (string, error) {
	switch strings.TrimSpace(value) {
	case "volume", "frequency", "cardio_duration":
		return strings.TrimSpace(value), nil
	default:
		return "", apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "invalid challenge type")
	}
}
