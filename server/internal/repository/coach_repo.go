package repository

import (
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"wsTrack/server/internal/model"
)

type CoachRelationChecker interface {
	HasActiveClientRelation(coachID, clientID uuid.UUID) (bool, error)
}

type CoachClientSummary struct {
	ID                 uuid.UUID  `gorm:"column:id"`
	ClientID           uuid.UUID  `gorm:"column:client_id"`
	Email              string     `gorm:"column:email"`
	Nickname           string     `gorm:"column:nickname"`
	Status             string     `gorm:"column:status"`
	Notes              *string    `gorm:"column:notes"`
	TotalWorkouts      int        `gorm:"column:total_workouts"`
	LastWorkoutAt      *time.Time `gorm:"column:last_workout_at"`
	HasTrainedThisWeek bool       `gorm:"column:has_trained_this_week"`
	WeeklyVolume       float64    `gorm:"column:weekly_volume"`
}

type CoachWeeklyVolumeRow struct {
	ClientID uuid.UUID `gorm:"column:client_id"`
	Week     string    `gorm:"column:week"`
	Volume   float64   `gorm:"column:volume"`
}

type CoachRepository interface {
	CoachRelationChecker
	CreateInvitation(invitation *model.CoachInvitation) error
	FindPendingInvitation(coachID uuid.UUID, clientEmail string) (*model.CoachInvitation, error)
	ListInvitationsByEmail(email string) ([]model.CoachInvitation, error)
	FindInvitationForEmail(id uuid.UUID, email string) (*model.CoachInvitation, error)
	UpdateInvitation(invitation *model.CoachInvitation) error
	ActivateCoachClient(coachID, clientID uuid.UUID) (*model.CoachClient, error)
	ListCoachClients(coachID uuid.UUID) ([]CoachClientSummary, error)
	GetCoachClientSummary(coachID, clientID uuid.UUID) (*CoachClientSummary, error)
	FindWorkoutForCoach(coachID, workoutID uuid.UUID) (*model.Workout, error)
	CreateWorkoutComment(comment *model.WorkoutComment) error
	ListClientCoaches(clientID uuid.UUID) ([]model.CoachClient, error)
	ListClientComments(clientID uuid.UUID) ([]model.WorkoutComment, error)
	GetWeeklyVolumeTrends(coachID uuid.UUID, weeks int) ([]CoachWeeklyVolumeRow, error)
}

type GormCoachRepository struct {
	db *gorm.DB
}

func NewCoachRepository(db *gorm.DB) CoachRepository {
	return &GormCoachRepository{db: db}
}

func (r *GormCoachRepository) CreateInvitation(invitation *model.CoachInvitation) error {
	if err := r.db.Create(invitation).Error; err != nil {
		return fmt.Errorf("create invitation: %w", err)
	}

	return nil
}

func (r *GormCoachRepository) FindPendingInvitation(coachID uuid.UUID, clientEmail string) (*model.CoachInvitation, error) {
	var invitation model.CoachInvitation
	err := r.db.
		Where("coach_id = ? AND client_email = ? AND status = 'pending' AND expires_at > ?", coachID, clientEmail, time.Now().UTC()).
		First(&invitation).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("find pending invitation: %w", err)
	}

	return &invitation, nil
}

func (r *GormCoachRepository) ListInvitationsByEmail(email string) ([]model.CoachInvitation, error) {
	var invitations []model.CoachInvitation
	if err := r.db.
		Preload("Coach").
		Where("client_email = ? AND status = 'pending' AND expires_at > ?", email, time.Now().UTC()).
		Order("created_at DESC").
		Find(&invitations).Error; err != nil {
		return nil, fmt.Errorf("list invitations by email: %w", err)
	}

	return invitations, nil
}

func (r *GormCoachRepository) FindInvitationForEmail(id uuid.UUID, email string) (*model.CoachInvitation, error) {
	var invitation model.CoachInvitation
	err := r.db.
		Preload("Coach").
		Where("id = ? AND client_email = ?", id, email).
		First(&invitation).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("find invitation by id for email: %w", err)
	}

	return &invitation, nil
}

func (r *GormCoachRepository) UpdateInvitation(invitation *model.CoachInvitation) error {
	if err := r.db.Save(invitation).Error; err != nil {
		return fmt.Errorf("update invitation: %w", err)
	}

	return nil
}

func (r *GormCoachRepository) ActivateCoachClient(coachID, clientID uuid.UUID) (*model.CoachClient, error) {
	var result model.CoachClient
	err := r.db.Transaction(func(tx *gorm.DB) error {
		err := tx.Where("coach_id = ? AND client_id = ?", coachID, clientID).First(&result).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			result = model.CoachClient{
				CoachID:  coachID,
				ClientID: clientID,
				Status:   "active",
			}
			if err := tx.Create(&result).Error; err != nil {
				return fmt.Errorf("create coach-client relation: %w", err)
			}
			return nil
		}
		if err != nil {
			return fmt.Errorf("query coach-client relation: %w", err)
		}

		result.Status = "active"
		if err := tx.Save(&result).Error; err != nil {
			return fmt.Errorf("activate coach-client relation: %w", err)
		}

		return nil
	})
	if err != nil {
		return nil, err
	}

	return &result, nil
}

func (r *GormCoachRepository) HasActiveClientRelation(coachID, clientID uuid.UUID) (bool, error) {
	var count int64
	if err := r.db.Model(&model.CoachClient{}).
		Where("coach_id = ? AND client_id = ? AND status = 'active'", coachID, clientID).
		Count(&count).Error; err != nil {
		return false, fmt.Errorf("check active coach-client relation: %w", err)
	}

	return count > 0, nil
}

func (r *GormCoachRepository) ListCoachClients(coachID uuid.UUID) ([]CoachClientSummary, error) {
	return r.queryCoachClientSummaries(coachID, nil)
}

func (r *GormCoachRepository) GetCoachClientSummary(coachID, clientID uuid.UUID) (*CoachClientSummary, error) {
	rows, err := r.queryCoachClientSummaries(coachID, &clientID)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}

	return &rows[0], nil
}

func (r *GormCoachRepository) queryCoachClientSummaries(coachID uuid.UUID, clientID *uuid.UUID) ([]CoachClientSummary, error) {
	query := `
		SELECT cc.id,
		       cc.client_id,
		       u.email,
		       u.nickname,
		       cc.status,
		       cc.notes,
		       COALESCE(COUNT(DISTINCT w.id), 0) AS total_workouts,
		       MAX(w.started_at) AS last_workout_at,
		       COALESCE(BOOL_OR(w.started_at >= ? AND w.started_at < ?), FALSE) AS has_trained_this_week,
		       COALESCE(SUM(CASE
		                      WHEN w.started_at >= ? AND w.started_at < ? THEN w.total_volume
		                      ELSE 0
		                    END), 0) AS weekly_volume
		FROM coach_clients cc
		JOIN users u ON u.id = cc.client_id
		LEFT JOIN workouts w ON w.user_id = cc.client_id
		WHERE cc.coach_id = ? AND cc.status = 'active'`

	args := []interface{}{startOfCurrentWeekUTC(), startOfCurrentWeekUTC().AddDate(0, 0, 7), startOfCurrentWeekUTC(), startOfCurrentWeekUTC().AddDate(0, 0, 7), coachID}
	if clientID != nil {
		query += " AND cc.client_id = ?"
		args = append(args, *clientID)
	}

	query += `
		GROUP BY cc.id, cc.client_id, u.email, u.nickname, cc.status, cc.notes
		ORDER BY MAX(w.started_at) DESC NULLS LAST, u.nickname ASC, u.email ASC`

	var rows []CoachClientSummary
	if err := r.db.Raw(query, args...).Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("query coach client summaries: %w", err)
	}

	return rows, nil
}

func (r *GormCoachRepository) FindWorkoutForCoach(coachID, workoutID uuid.UUID) (*model.Workout, error) {
	var workout model.Workout
	err := r.db.
		Joins("JOIN coach_clients cc ON cc.client_id = workouts.user_id AND cc.status = 'active'").
		Where("workouts.id = ? AND cc.coach_id = ?", workoutID, coachID).
		Preload("User").
		Preload("PlanDay").
		First(&workout).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("find workout for coach: %w", err)
	}

	return &workout, nil
}

func (r *GormCoachRepository) CreateWorkoutComment(comment *model.WorkoutComment) error {
	if err := r.db.Create(comment).Error; err != nil {
		return fmt.Errorf("create workout comment: %w", err)
	}

	return nil
}

func (r *GormCoachRepository) ListClientCoaches(clientID uuid.UUID) ([]model.CoachClient, error) {
	var relations []model.CoachClient
	if err := r.db.
		Preload("Coach").
		Where("client_id = ? AND status = 'active'", clientID).
		Order("created_at DESC").
		Find(&relations).Error; err != nil {
		return nil, fmt.Errorf("list client coaches: %w", err)
	}

	return relations, nil
}

func (r *GormCoachRepository) ListClientComments(clientID uuid.UUID) ([]model.WorkoutComment, error) {
	var comments []model.WorkoutComment
	if err := r.db.
		Joins("JOIN workouts ON workouts.id = workout_comments.workout_id").
		Where("workouts.user_id = ?", clientID).
		Preload("Coach").
		Preload("Workout").
		Order("workout_comments.created_at DESC").
		Find(&comments).Error; err != nil {
		return nil, fmt.Errorf("list client comments: %w", err)
	}

	return comments, nil
}

func (r *GormCoachRepository) GetWeeklyVolumeTrends(coachID uuid.UUID, weeks int) ([]CoachWeeklyVolumeRow, error) {
	if weeks <= 0 {
		weeks = 4
	}

	start := startOfCurrentWeekUTC().AddDate(0, 0, -7*(weeks-1))
	var rows []CoachWeeklyVolumeRow
	err := r.db.Raw(`
		SELECT cc.client_id,
		       TO_CHAR(DATE_TRUNC('week', w.started_at), 'YYYY-MM-DD') AS week,
		       COALESCE(SUM(w.total_volume), 0) AS volume
		FROM coach_clients cc
		LEFT JOIN workouts w ON w.user_id = cc.client_id
		                    AND w.started_at >= ?
		                    AND w.started_at < ?
		WHERE cc.coach_id = ?
		  AND cc.status = 'active'
		GROUP BY cc.client_id, DATE_TRUNC('week', w.started_at)
		ORDER BY cc.client_id ASC, DATE_TRUNC('week', w.started_at) ASC`,
		start, startOfCurrentWeekUTC().AddDate(0, 0, 7), coachID,
	).Scan(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("get weekly volume trends: %w", err)
	}

	return rows, nil
}

func startOfCurrentWeekUTC() time.Time {
	now := time.Now().UTC()
	weekday := int(now.Weekday())
	if weekday == 0 {
		weekday = 7
	}

	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC).AddDate(0, 0, -(weekday - 1))
}
