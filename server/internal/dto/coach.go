package dto

import (
	"time"

	"github.com/google/uuid"
)

type InviteClientRequest struct {
	ClientEmail string `json:"client_email" binding:"required,email"`
}

type PushPlanRequest struct {
	PlanID   uuid.UUID `json:"plan_id" binding:"required"`
	Activate *bool     `json:"activate"`
}

type WorkoutCommentRequest struct {
	Comment string `json:"comment" binding:"required,min=1,max=2000"`
}

type CoachInvitationResponse struct {
	ID          uuid.UUID `json:"id"`
	CoachID     uuid.UUID `json:"coach_id"`
	CoachName   string    `json:"coach_name"`
	CoachEmail  string    `json:"coach_email"`
	ClientEmail string    `json:"client_email"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"created_at"`
	ExpiresAt   time.Time `json:"expires_at"`
}

type CoachClientSummaryResponse struct {
	ID                 uuid.UUID  `json:"id"`
	ClientID           uuid.UUID  `json:"client_id"`
	Email              string     `json:"email"`
	Nickname           string     `json:"nickname"`
	Status             string     `json:"status"`
	Notes              *string    `json:"notes,omitempty"`
	TotalWorkouts      int        `json:"total_workouts"`
	LastWorkoutAt      *time.Time `json:"last_workout_at,omitempty"`
	HasTrainedThisWeek bool       `json:"has_trained_this_week"`
	WeeklyVolume       float64    `json:"weekly_volume"`
}

type CoachClientDetailResponse struct {
	Client    CoachClientSummaryResponse `json:"client"`
	Dashboard DashboardResponse          `json:"dashboard"`
}

type WorkoutCommentResponse struct {
	ID             uuid.UUID  `json:"id"`
	CoachID        uuid.UUID  `json:"coach_id"`
	CoachName      string     `json:"coach_name"`
	WorkoutID      uuid.UUID  `json:"workout_id"`
	WorkoutStarted *time.Time `json:"workout_started_at,omitempty"`
	Comment        string     `json:"comment"`
	CreatedAt      time.Time  `json:"created_at"`
}

type ClientCoachResponse struct {
	ID         uuid.UUID `json:"id"`
	CoachID    uuid.UUID `json:"coach_id"`
	CoachName  string    `json:"coach_name"`
	CoachEmail string    `json:"coach_email"`
	Status     string    `json:"status"`
	Notes      *string   `json:"notes,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

type CoachDashboardClientItem struct {
	ClientID           uuid.UUID         `json:"client_id"`
	Nickname           string            `json:"nickname"`
	Email              string            `json:"email"`
	HasTrainedThisWeek bool              `json:"has_trained_this_week"`
	LastWorkoutAt      *time.Time        `json:"last_workout_at,omitempty"`
	ActivityBucket     string            `json:"activity_bucket"`
	WeeklyVolumeTrend  []VolumeDataPoint `json:"weekly_volume_trend"`
}

type CoachDashboardResponse struct {
	TotalClients    int                        `json:"total_clients"`
	TrainedThisWeek int                        `json:"trained_this_week"`
	Active3Days     int                        `json:"active_3_days"`
	Active7Days     int                        `json:"active_7_days"`
	Inactive7Days   int                        `json:"inactive_7_days"`
	Clients         []CoachDashboardClientItem `json:"clients"`
}
