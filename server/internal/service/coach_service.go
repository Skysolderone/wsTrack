package service

import (
	"errors"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"wsTrack/server/internal/dto"
	apperrors "wsTrack/server/internal/errors"
	"wsTrack/server/internal/model"
	"wsTrack/server/internal/repository"
)

const coachInvitationTTL = 7 * 24 * time.Hour

type CoachService struct {
	users    repository.UserRepository
	coaches  repository.CoachRepository
	plans    repository.PlanRepository
	workouts repository.WorkoutRepository
	stats    *StatsService
}

func NewCoachService(
	users repository.UserRepository,
	coaches repository.CoachRepository,
	plans repository.PlanRepository,
	workouts repository.WorkoutRepository,
	stats *StatsService,
) *CoachService {
	return &CoachService{
		users:    users,
		coaches:  coaches,
		plans:    plans,
		workouts: workouts,
		stats:    stats,
	}
}

func (s *CoachService) Invite(coachID uuid.UUID, req dto.InviteClientRequest) (*dto.CoachInvitationResponse, error) {
	if _, err := s.requireCoach(coachID); err != nil {
		return nil, err
	}

	email := strings.TrimSpace(strings.ToLower(req.ClientEmail))
	if email == "" {
		return nil, apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "client_email cannot be empty")
	}

	coach, err := s.users.FindByID(coachID)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query coach")
	}
	if coach == nil {
		return nil, apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "coach not found")
	}
	if strings.EqualFold(coach.Email, email) {
		return nil, apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "cannot invite yourself")
	}

	existing, err := s.coaches.FindPendingInvitation(coachID, email)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query pending invitations")
	}
	if existing != nil {
		return nil, apperrors.New(http.StatusConflict, apperrors.CodeConflict, "pending invitation already exists")
	}

	if client, err := s.users.FindByEmail(email); err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query invited client")
	} else if client != nil {
		related, err := s.coaches.HasActiveClientRelation(coachID, client.ID)
		if err != nil {
			return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query coach-client relation")
		}
		if related {
			return nil, apperrors.New(http.StatusConflict, apperrors.CodeConflict, "client already linked to this coach")
		}
	}

	invitation := &model.CoachInvitation{
		CoachID:     coachID,
		ClientEmail: email,
		Status:      "pending",
		CreatedAt:   time.Now().UTC(),
		ExpiresAt:   time.Now().UTC().Add(coachInvitationTTL),
	}
	if err := s.coaches.CreateInvitation(invitation); err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to create invitation")
	}
	invitation.Coach = *coach

	response := toCoachInvitationResponse(invitation)
	return &response, nil
}

func (s *CoachService) ListClients(coachID uuid.UUID) ([]dto.CoachClientSummaryResponse, error) {
	if _, err := s.requireCoach(coachID); err != nil {
		return nil, err
	}

	items, err := s.coaches.ListCoachClients(coachID)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to list coach clients")
	}

	return toCoachClientSummaryResponses(items), nil
}

func (s *CoachService) GetClientDetail(coachID, clientID uuid.UUID) (*dto.CoachClientDetailResponse, error) {
	if _, err := s.requireCoach(coachID); err != nil {
		return nil, err
	}

	summary, err := s.coaches.GetCoachClientSummary(coachID, clientID)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query coach client")
	}
	if summary == nil {
		return nil, apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "client not found")
	}

	dashboard, err := s.stats.GetDashboard(clientID)
	if err != nil {
		return nil, err
	}

	response := dto.CoachClientDetailResponse{
		Client:    toCoachClientSummaryResponse(*summary),
		Dashboard: *dashboard,
	}
	return &response, nil
}

func (s *CoachService) ListClientWorkouts(coachID, clientID uuid.UUID, filter dto.WorkoutFilter) ([]dto.WorkoutListItem, int64, error) {
	if _, err := s.requireCoach(coachID); err != nil {
		return nil, 0, err
	}

	allowed, err := s.coaches.HasActiveClientRelation(coachID, clientID)
	if err != nil {
		return nil, 0, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query coach-client relation")
	}
	if !allowed {
		return nil, 0, apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "client not found")
	}

	items, total, err := s.workouts.List(clientID, filter)
	if err != nil {
		return nil, 0, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to list client workouts")
	}

	return items, total, nil
}

func (s *CoachService) PushPlan(coachID, clientID uuid.UUID, req dto.PushPlanRequest) (*dto.PlanDetailResponse, error) {
	if _, err := s.requireCoach(coachID); err != nil {
		return nil, err
	}

	allowed, err := s.coaches.HasActiveClientRelation(coachID, clientID)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query coach-client relation")
	}
	if !allowed {
		return nil, apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "client not found")
	}

	sourcePlan, err := s.plans.FindByID(req.PlanID, coachID)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query source plan")
	}
	if sourcePlan == nil {
		return nil, apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "plan not found")
	}

	plan, err := s.plans.CloneToUser(req.PlanID, coachID, clientID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "plan not found")
		}
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to push plan to client")
	}

	if req.Activate != nil && *req.Activate {
		if err := s.plans.SetActive(plan.ID, clientID); err != nil {
			return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to activate pushed plan")
		}
		plan.IsActive = true
	}

	response := toPlanDetailResponse(plan)
	return &response, nil
}

func (s *CoachService) AddWorkoutComment(coachID, workoutID uuid.UUID, req dto.WorkoutCommentRequest) (*dto.WorkoutCommentResponse, error) {
	if _, err := s.requireCoach(coachID); err != nil {
		return nil, err
	}

	workout, err := s.coaches.FindWorkoutForCoach(coachID, workoutID)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query workout")
	}
	if workout == nil {
		return nil, apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "workout not found")
	}

	commentText := strings.TrimSpace(req.Comment)
	if commentText == "" {
		return nil, apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "comment cannot be empty")
	}

	comment := &model.WorkoutComment{
		CoachID:   coachID,
		WorkoutID: workoutID,
		Comment:   commentText,
	}
	if err := s.coaches.CreateWorkoutComment(comment); err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to create workout comment")
	}

	coach, err := s.users.FindByID(coachID)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query coach")
	}
	if coach == nil {
		return nil, apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "coach not found")
	}

	response := dto.WorkoutCommentResponse{
		ID:             comment.ID,
		CoachID:        coachID,
		CoachName:      coach.Nickname,
		WorkoutID:      workoutID,
		WorkoutStarted: &workout.StartedAt,
		Comment:        comment.Comment,
		CreatedAt:      comment.CreatedAt,
	}
	return &response, nil
}

func (s *CoachService) GetDashboard(coachID uuid.UUID) (*dto.CoachDashboardResponse, error) {
	if _, err := s.requireCoach(coachID); err != nil {
		return nil, err
	}

	clients, err := s.coaches.ListCoachClients(coachID)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query coach dashboard clients")
	}

	trendRows, err := s.coaches.GetWeeklyVolumeTrends(coachID, 4)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query coach dashboard trends")
	}

	weekKeys := lastNWeekKeys(4)
	trendMap := make(map[uuid.UUID]map[string]float64)
	for _, row := range trendRows {
		if row.Week == "" {
			continue
		}
		if _, ok := trendMap[row.ClientID]; !ok {
			trendMap[row.ClientID] = make(map[string]float64)
		}
		trendMap[row.ClientID][row.Week] = row.Volume
	}

	now := time.Now().UTC()
	response := &dto.CoachDashboardResponse{
		TotalClients: len(clients),
		Clients:      make([]dto.CoachDashboardClientItem, 0, len(clients)),
	}
	for _, client := range clients {
		bucket := coachActivityBucket(client.LastWorkoutAt, now)
		switch bucket {
		case "active_3d":
			response.Active3Days++
		case "active_7d":
			response.Active7Days++
		default:
			response.Inactive7Days++
		}
		if client.HasTrainedThisWeek {
			response.TrainedThisWeek++
		}

		trend := make([]dto.VolumeDataPoint, 0, len(weekKeys))
		for _, week := range weekKeys {
			trend = append(trend, dto.VolumeDataPoint{
				Date:   week,
				Volume: trendMap[client.ClientID][week],
			})
		}

		response.Clients = append(response.Clients, dto.CoachDashboardClientItem{
			ClientID:           client.ClientID,
			Nickname:           client.Nickname,
			Email:              client.Email,
			HasTrainedThisWeek: client.HasTrainedThisWeek,
			LastWorkoutAt:      client.LastWorkoutAt,
			ActivityBucket:     bucket,
			WeeklyVolumeTrend:  trend,
		})
	}

	sort.Slice(response.Clients, func(i, j int) bool {
		left := response.Clients[i].LastWorkoutAt
		right := response.Clients[j].LastWorkoutAt
		if left == nil {
			return false
		}
		if right == nil {
			return true
		}
		return left.After(*right)
	})

	return response, nil
}

func (s *CoachService) ListInvitations(userID uuid.UUID) ([]dto.CoachInvitationResponse, error) {
	user, err := s.users.FindByID(userID)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query user")
	}
	if user == nil {
		return nil, apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "user not found")
	}

	invitations, err := s.coaches.ListInvitationsByEmail(strings.ToLower(user.Email))
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to list invitations")
	}

	items := make([]dto.CoachInvitationResponse, 0, len(invitations))
	for i := range invitations {
		items = append(items, toCoachInvitationResponse(&invitations[i]))
	}

	return items, nil
}

func (s *CoachService) AcceptInvitation(userID, invitationID uuid.UUID) (*dto.ClientCoachResponse, error) {
	user, invitation, err := s.requireInvitationUserMatch(userID, invitationID)
	if err != nil {
		return nil, err
	}
	if invitation.Status != "pending" {
		return nil, apperrors.New(http.StatusConflict, apperrors.CodeConflict, "invitation already processed")
	}
	if invitation.ExpiresAt.Before(time.Now().UTC()) {
		return nil, apperrors.New(http.StatusBadRequest, apperrors.CodeBadRequest, "invitation expired")
	}

	invitation.Status = "accepted"
	if err := s.coaches.UpdateInvitation(invitation); err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to update invitation")
	}

	relation, err := s.coaches.ActivateCoachClient(invitation.CoachID, user.ID)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to activate coach-client relation")
	}

	coach, err := s.users.FindByID(invitation.CoachID)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query coach")
	}
	if coach == nil {
		return nil, apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "coach not found")
	}

	response := dto.ClientCoachResponse{
		ID:         relation.ID,
		CoachID:    relation.CoachID,
		CoachName:  coach.Nickname,
		CoachEmail: coach.Email,
		Status:     relation.Status,
		Notes:      relation.Notes,
		CreatedAt:  relation.CreatedAt,
	}
	return &response, nil
}

func (s *CoachService) RejectInvitation(userID, invitationID uuid.UUID) error {
	_, invitation, err := s.requireInvitationUserMatch(userID, invitationID)
	if err != nil {
		return err
	}
	if invitation.Status != "pending" {
		return apperrors.New(http.StatusConflict, apperrors.CodeConflict, "invitation already processed")
	}

	invitation.Status = "rejected"
	if err := s.coaches.UpdateInvitation(invitation); err != nil {
		return apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to update invitation")
	}

	return nil
}

func (s *CoachService) ListCoaches(userID uuid.UUID) ([]dto.ClientCoachResponse, error) {
	relations, err := s.coaches.ListClientCoaches(userID)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to list coaches")
	}

	items := make([]dto.ClientCoachResponse, 0, len(relations))
	for i := range relations {
		items = append(items, dto.ClientCoachResponse{
			ID:         relations[i].ID,
			CoachID:    relations[i].CoachID,
			CoachName:  relations[i].Coach.Nickname,
			CoachEmail: relations[i].Coach.Email,
			Status:     relations[i].Status,
			Notes:      relations[i].Notes,
			CreatedAt:  relations[i].CreatedAt,
		})
	}

	return items, nil
}

func (s *CoachService) ListComments(userID uuid.UUID) ([]dto.WorkoutCommentResponse, error) {
	comments, err := s.coaches.ListClientComments(userID)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to list comments")
	}

	items := make([]dto.WorkoutCommentResponse, 0, len(comments))
	for i := range comments {
		startedAt := comments[i].Workout.StartedAt
		items = append(items, dto.WorkoutCommentResponse{
			ID:             comments[i].ID,
			CoachID:        comments[i].CoachID,
			CoachName:      comments[i].Coach.Nickname,
			WorkoutID:      comments[i].WorkoutID,
			WorkoutStarted: &startedAt,
			Comment:        comments[i].Comment,
			CreatedAt:      comments[i].CreatedAt,
		})
	}

	return items, nil
}

func (s *CoachService) requireInvitationUserMatch(userID, invitationID uuid.UUID) (*model.User, *model.CoachInvitation, error) {
	user, err := s.users.FindByID(userID)
	if err != nil {
		return nil, nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query user")
	}
	if user == nil {
		return nil, nil, apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "user not found")
	}

	invitation, err := s.coaches.FindInvitationForEmail(invitationID, strings.ToLower(user.Email))
	if err != nil {
		return nil, nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query invitation")
	}
	if invitation == nil {
		return nil, nil, apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "invitation not found")
	}

	return user, invitation, nil
}

func (s *CoachService) requireCoach(userID uuid.UUID) (*model.User, error) {
	user, err := s.users.FindByID(userID)
	if err != nil {
		return nil, apperrors.Wrap(err, http.StatusInternalServerError, apperrors.CodeInternal, "failed to query coach")
	}
	if user == nil {
		return nil, apperrors.New(http.StatusNotFound, apperrors.CodeNotFound, "coach not found")
	}
	if user.Role != "coach" {
		return nil, apperrors.New(http.StatusForbidden, apperrors.CodeForbidden, "coach role required")
	}

	return user, nil
}

func toCoachInvitationResponse(invitation *model.CoachInvitation) dto.CoachInvitationResponse {
	return dto.CoachInvitationResponse{
		ID:          invitation.ID,
		CoachID:     invitation.CoachID,
		CoachName:   invitation.Coach.Nickname,
		CoachEmail:  invitation.Coach.Email,
		ClientEmail: invitation.ClientEmail,
		Status:      invitation.Status,
		CreatedAt:   invitation.CreatedAt,
		ExpiresAt:   invitation.ExpiresAt,
	}
}

func toCoachClientSummaryResponses(items []repository.CoachClientSummary) []dto.CoachClientSummaryResponse {
	result := make([]dto.CoachClientSummaryResponse, 0, len(items))
	for _, item := range items {
		result = append(result, toCoachClientSummaryResponse(item))
	}

	return result
}

func toCoachClientSummaryResponse(item repository.CoachClientSummary) dto.CoachClientSummaryResponse {
	return dto.CoachClientSummaryResponse{
		ID:                 item.ID,
		ClientID:           item.ClientID,
		Email:              item.Email,
		Nickname:           item.Nickname,
		Status:             item.Status,
		Notes:              item.Notes,
		TotalWorkouts:      item.TotalWorkouts,
		LastWorkoutAt:      item.LastWorkoutAt,
		HasTrainedThisWeek: item.HasTrainedThisWeek,
		WeeklyVolume:       item.WeeklyVolume,
	}
}

func coachActivityBucket(lastWorkoutAt *time.Time, now time.Time) string {
	if lastWorkoutAt == nil {
		return "inactive_7d"
	}

	if now.Sub(*lastWorkoutAt) <= 72*time.Hour {
		return "active_3d"
	}
	if now.Sub(*lastWorkoutAt) <= 7*24*time.Hour {
		return "active_7d"
	}

	return "inactive_7d"
}

func lastNWeekKeys(weeks int) []string {
	start := startOfWeek(time.Now().UTC()).UTC().AddDate(0, 0, -7*(weeks-1))
	result := make([]string, 0, weeks)
	for i := 0; i < weeks; i++ {
		result = append(result, start.AddDate(0, 0, 7*i).Format("2006-01-02"))
	}

	return result
}
