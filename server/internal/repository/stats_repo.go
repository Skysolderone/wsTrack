package repository

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"wsTrack/server/internal/dto"
)

type StatsRepository interface {
	GetVolumeHistory(userID uuid.UUID, req dto.VolumeStatsRequest) ([]dto.VolumeDataPoint, error)
	GetMuscleDistribution(userID uuid.UUID, dateFrom, dateTo time.Time) ([]dto.MuscleVolumeData, error)
	GetFrequencyStats(userID uuid.UUID) (*dto.FrequencyStats, error)
	GetExerciseHistory(userID, exerciseID uuid.UUID, limit int) (*dto.ExerciseStatsResponse, error)
	GetDashboardSummary(userID uuid.UUID, currentWeekStart, currentWeekEnd, lastWeekStart time.Time) (*dto.DashboardResponse, error)
	GetPRHistory(userID uuid.UUID, limit int) ([]dto.PRRecord, error)
}

type GormStatsRepository struct {
	db *gorm.DB
}

func NewStatsRepository(db *gorm.DB) StatsRepository {
	return &GormStatsRepository{db: db}
}

func (r *GormStatsRepository) GetVolumeHistory(userID uuid.UUID, req dto.VolumeStatsRequest) ([]dto.VolumeDataPoint, error) {
	var (
		periodExpr string
		labelExpr  string
	)

	switch req.Period {
	case "daily":
		periodExpr = "DATE_TRUNC('day', w.started_at)"
		labelExpr = "TO_CHAR(DATE_TRUNC('day', w.started_at), 'YYYY-MM-DD')"
	case "weekly":
		periodExpr = "DATE_TRUNC('week', w.started_at)"
		labelExpr = "TO_CHAR(DATE_TRUNC('week', w.started_at), 'IYYY-\"W\"IW')"
	case "monthly":
		periodExpr = "DATE_TRUNC('month', w.started_at)"
		labelExpr = "TO_CHAR(DATE_TRUNC('month', w.started_at), 'YYYY-MM')"
	default:
		return []dto.VolumeDataPoint{}, nil
	}

	query := fmt.Sprintf(`
		SELECT %s AS date,
		       COALESCE(SUM(COALESCE(ws.weight, 0) * COALESCE(ws.reps, 0)), 0) AS volume
		FROM workouts w
		JOIN workout_exercises we ON we.workout_id = w.id
		JOIN workout_sets ws ON ws.workout_exercise_id = we.id
		JOIN exercises e ON e.id = we.exercise_id
		WHERE w.user_id = ?
		  AND ws.is_warmup = FALSE
		  AND ws.is_completed = TRUE
		  AND w.started_at BETWEEN ? AND ?`, labelExpr)

	args := []interface{}{userID, req.DateFrom, req.DateTo}
	if req.Muscle != nil && *req.Muscle != "" {
		query += " AND ? = ANY(e.primary_muscles)"
		args = append(args, *req.Muscle)
	}

	query += fmt.Sprintf(" GROUP BY %s ORDER BY %s", periodExpr, periodExpr)

	var data []dto.VolumeDataPoint
	if err := r.db.Raw(query, args...).Scan(&data).Error; err != nil {
		return nil, fmt.Errorf("get volume history: %w", err)
	}

	return data, nil
}

func (r *GormStatsRepository) GetMuscleDistribution(userID uuid.UUID, dateFrom, dateTo time.Time) ([]dto.MuscleVolumeData, error) {
	query := `
		SELECT muscle,
		       COALESCE(SUM(COALESCE(ws.weight, 0) * COALESCE(ws.reps, 0)), 0) AS volume,
		       COUNT(*) AS sets
		FROM workouts w
		JOIN workout_exercises we ON we.workout_id = w.id
		JOIN workout_sets ws ON ws.workout_exercise_id = we.id
		JOIN exercises e ON e.id = we.exercise_id
		CROSS JOIN LATERAL UNNEST(e.primary_muscles) AS muscle
		WHERE w.user_id = ?
		  AND ws.is_warmup = FALSE
		  AND ws.is_completed = TRUE
		  AND w.started_at BETWEEN ? AND ?
		GROUP BY muscle
		ORDER BY volume DESC, sets DESC`

	var data []dto.MuscleVolumeData
	if err := r.db.Raw(query, userID, dateFrom, dateTo).Scan(&data).Error; err != nil {
		return nil, fmt.Errorf("get muscle distribution: %w", err)
	}

	return data, nil
}

func (r *GormStatsRepository) GetFrequencyStats(userID uuid.UUID) (*dto.FrequencyStats, error) {
	stats := &dto.FrequencyStats{
		ByDayOfWeek: map[string]int{
			"Mon": 0,
			"Tue": 0,
			"Wed": 0,
			"Thu": 0,
			"Fri": 0,
			"Sat": 0,
			"Sun": 0,
		},
		ByTimeOfDay: map[string]int{
			"morning":   0,
			"afternoon": 0,
			"evening":   0,
		},
	}

	var weeklyAvg sql.NullFloat64
	if err := r.db.Raw(`
		SELECT COALESCE(COUNT(*)::float / NULLIF(COUNT(DISTINCT DATE_TRUNC('week', started_at)), 0), 0) AS weekly_avg
		FROM workouts
		WHERE user_id = ?`,
		userID,
	).Scan(&weeklyAvg).Error; err != nil {
		return nil, fmt.Errorf("get weekly average: %w", err)
	}
	if weeklyAvg.Valid {
		stats.WeeklyAvg = weeklyAvg.Float64
	}

	type streakRow struct {
		CurrentStreak int `gorm:"column:current_streak"`
		LongestStreak int `gorm:"column:longest_streak"`
	}
	var streak streakRow
	if err := r.db.Raw(`
		WITH workout_dates AS (
			SELECT DISTINCT DATE(started_at) AS workout_date
			FROM workouts
			WHERE user_id = ?
		),
		grouped AS (
			SELECT workout_date,
			       workout_date - (ROW_NUMBER() OVER (ORDER BY workout_date))::integer AS grp
			FROM workout_dates
		),
		streaks AS (
			SELECT MIN(workout_date) AS start_date,
			       MAX(workout_date) AS end_date,
			       COUNT(*) AS streak
			FROM grouped
			GROUP BY grp
		)
		SELECT COALESCE(MAX(CASE WHEN end_date >= CURRENT_DATE - INTERVAL '1 day' THEN streak ELSE 0 END), 0) AS current_streak,
		       COALESCE(MAX(streak), 0) AS longest_streak
		FROM streaks`,
		userID,
	).Scan(&streak).Error; err != nil {
		return nil, fmt.Errorf("get streak stats: %w", err)
	}
	stats.CurrentStreak = streak.CurrentStreak
	stats.LongestStreak = streak.LongestStreak

	type dayRow struct {
		DayOfWeek int `gorm:"column:day_of_week"`
		Count     int `gorm:"column:count"`
	}
	var dayRows []dayRow
	if err := r.db.Raw(`
		SELECT EXTRACT(ISODOW FROM started_at)::int AS day_of_week,
		       COUNT(*) AS count
		FROM workouts
		WHERE user_id = ?
		GROUP BY 1`,
		userID,
	).Scan(&dayRows).Error; err != nil {
		return nil, fmt.Errorf("get day of week stats: %w", err)
	}

	days := map[int]string{1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun"}
	for _, row := range dayRows {
		if label, ok := days[row.DayOfWeek]; ok {
			stats.ByDayOfWeek[label] = row.Count
		}
	}

	type periodRow struct {
		Period string `gorm:"column:period"`
		Count  int    `gorm:"column:count"`
	}
	var periodRows []periodRow
	if err := r.db.Raw(`
		SELECT CASE
		         WHEN EXTRACT(HOUR FROM started_at) BETWEEN 5 AND 11 THEN 'morning'
		         WHEN EXTRACT(HOUR FROM started_at) BETWEEN 12 AND 17 THEN 'afternoon'
		         ELSE 'evening'
		       END AS period,
		       COUNT(*) AS count
		FROM workouts
		WHERE user_id = ?
		GROUP BY 1`,
		userID,
	).Scan(&periodRows).Error; err != nil {
		return nil, fmt.Errorf("get time of day stats: %w", err)
	}
	for _, row := range periodRows {
		stats.ByTimeOfDay[row.Period] = row.Count
	}

	return stats, nil
}

func (r *GormStatsRepository) GetExerciseHistory(userID, exerciseID uuid.UUID, limit int) (*dto.ExerciseStatsResponse, error) {
	type exerciseMeta struct {
		ID   uuid.UUID `gorm:"column:id"`
		Name string    `gorm:"column:name"`
	}
	var meta exerciseMeta
	err := r.db.Raw(`
		SELECT id, name
		FROM exercises
		WHERE id = ?
		  AND (user_id IS NULL OR user_id = ?)
		LIMIT 1`,
		exerciseID, userID,
	).Scan(&meta).Error
	if err != nil {
		return nil, fmt.Errorf("get exercise meta: %w", err)
	}
	if meta.ID == uuid.Nil {
		return nil, nil
	}

	response := &dto.ExerciseStatsResponse{
		ExerciseID:       meta.ID,
		ExerciseName:     meta.Name,
		VolumeHistory:    []dto.VolumeDataPoint{},
		MaxWeightHistory: []dto.VolumeDataPoint{},
		PersonalRecords:  []dto.PRRecord{},
	}

	type totalRow struct {
		TotalSessions int `gorm:"column:total_sessions"`
	}
	var total totalRow
	if err := r.db.Raw(`
		SELECT COUNT(DISTINCT w.id) AS total_sessions
		FROM workouts w
		JOIN workout_exercises we ON we.workout_id = w.id
		WHERE w.user_id = ?
		  AND we.exercise_id = ?`,
		userID, exerciseID,
	).Scan(&total).Error; err != nil {
		return nil, fmt.Errorf("get exercise total sessions: %w", err)
	}
	response.TotalSessions = total.TotalSessions

	if err := r.db.Raw(`
		SELECT date, volume
		FROM (
			SELECT TO_CHAR(DATE(w.started_at), 'YYYY-MM-DD') AS date,
			       DATE(w.started_at) AS sort_date,
			       COALESCE(SUM(COALESCE(ws.weight, 0) * COALESCE(ws.reps, 0)), 0) AS volume
			FROM workouts w
			JOIN workout_exercises we ON we.workout_id = w.id
			JOIN workout_sets ws ON ws.workout_exercise_id = we.id
			WHERE w.user_id = ?
			  AND we.exercise_id = ?
			  AND ws.is_warmup = FALSE
			  AND ws.is_completed = TRUE
			GROUP BY DATE(w.started_at)
			ORDER BY DATE(w.started_at) DESC
			LIMIT ?
		) t
		ORDER BY sort_date ASC`,
		userID, exerciseID, limit,
	).Scan(&response.VolumeHistory).Error; err != nil {
		return nil, fmt.Errorf("get exercise volume history: %w", err)
	}

	if err := r.db.Raw(`
		SELECT date, volume
		FROM (
			SELECT TO_CHAR(DATE(w.started_at), 'YYYY-MM-DD') AS date,
			       DATE(w.started_at) AS sort_date,
			       COALESCE(MAX(ws.weight), 0) AS volume
			FROM workouts w
			JOIN workout_exercises we ON we.workout_id = w.id
			JOIN workout_sets ws ON ws.workout_exercise_id = we.id
			WHERE w.user_id = ?
			  AND we.exercise_id = ?
			  AND ws.weight IS NOT NULL
			  AND ws.is_warmup = FALSE
			  AND ws.is_completed = TRUE
			GROUP BY DATE(w.started_at)
			ORDER BY DATE(w.started_at) DESC
			LIMIT ?
		) t
		ORDER BY sort_date ASC`,
		userID, exerciseID, limit,
	).Scan(&response.MaxWeightHistory).Error; err != nil {
		return nil, fmt.Errorf("get exercise max weight history: %w", err)
	}

	var estimated1RM sql.NullFloat64
	if err := r.db.Raw(`
		SELECT MAX(ws.weight * (1 + ws.reps / 30.0)) AS estimated_1rm
		FROM workouts w
		JOIN workout_exercises we ON we.workout_id = w.id
		JOIN workout_sets ws ON ws.workout_exercise_id = we.id
		WHERE w.user_id = ?
		  AND we.exercise_id = ?
		  AND ws.weight IS NOT NULL
		  AND ws.reps IS NOT NULL
		  AND ws.is_warmup = FALSE
		  AND ws.is_completed = TRUE`,
		userID, exerciseID,
	).Scan(&estimated1RM).Error; err != nil {
		return nil, fmt.Errorf("get exercise estimated 1rm: %w", err)
	}
	if estimated1RM.Valid {
		response.Estimated1RM = &estimated1RM.Float64
	}

	prs, err := r.getPRHistoryByExercise(userID, exerciseID, 20)
	if err != nil {
		return nil, err
	}
	response.PersonalRecords = prs

	return response, nil
}

func (r *GormStatsRepository) GetDashboardSummary(userID uuid.UUID, currentWeekStart, currentWeekEnd, lastWeekStart time.Time) (*dto.DashboardResponse, error) {
	type summaryRow struct {
		WeeklyWorkouts int     `gorm:"column:weekly_workouts"`
		WeeklyVolume   float64 `gorm:"column:weekly_volume"`
		LastWeekVolume float64 `gorm:"column:last_week_volume"`
	}

	var row summaryRow
	if err := r.db.Raw(`
		SELECT COUNT(DISTINCT CASE
		                       WHEN w.started_at >= ? AND w.started_at < ? THEN w.id
		                     END) AS weekly_workouts,
		       COALESCE(SUM(CASE
		                      WHEN w.started_at >= ? AND w.started_at < ?
		                       AND ws.is_completed = TRUE
		                       AND ws.is_warmup = FALSE
		                      THEN COALESCE(ws.weight, 0) * COALESCE(ws.reps, 0)
		                      ELSE 0
		                    END), 0) AS weekly_volume,
		       COALESCE(SUM(CASE
		                      WHEN w.started_at >= ? AND w.started_at < ?
		                       AND ws.is_completed = TRUE
		                       AND ws.is_warmup = FALSE
		                      THEN COALESCE(ws.weight, 0) * COALESCE(ws.reps, 0)
		                      ELSE 0
		                    END), 0) AS last_week_volume
		FROM workouts w
		LEFT JOIN workout_exercises we ON we.workout_id = w.id
		LEFT JOIN workout_sets ws ON ws.workout_exercise_id = we.id
		WHERE w.user_id = ?`,
		currentWeekStart, currentWeekEnd,
		currentWeekStart, currentWeekEnd,
		lastWeekStart, currentWeekStart,
		userID,
	).Scan(&row).Error; err != nil {
		return nil, fmt.Errorf("get dashboard summary: %w", err)
	}

	return &dto.DashboardResponse{
		WeeklyWorkouts: row.WeeklyWorkouts,
		WeeklyVolume:   row.WeeklyVolume,
		LastWeekVolume: row.LastWeekVolume,
	}, nil
}

func (r *GormStatsRepository) GetPRHistory(userID uuid.UUID, limit int) ([]dto.PRRecord, error) {
	if limit <= 0 {
		limit = 20
	}

	var items []dto.PRRecord
	if err := r.db.Raw(`
		SELECT pr.id,
		       e.name AS exercise_name,
		       pr.pr_type,
		       pr.value,
		       pr.unit,
		       pr.achieved_at
		FROM personal_records pr
		JOIN exercises e ON e.id = pr.exercise_id
		WHERE pr.user_id = ?
		ORDER BY pr.achieved_at DESC
		LIMIT ?`,
		userID, limit,
	).Scan(&items).Error; err != nil {
		return nil, fmt.Errorf("get pr history: %w", err)
	}

	return items, nil
}

func (r *GormStatsRepository) getPRHistoryByExercise(userID, exerciseID uuid.UUID, limit int) ([]dto.PRRecord, error) {
	var items []dto.PRRecord
	if err := r.db.Raw(`
		SELECT pr.id,
		       e.name AS exercise_name,
		       pr.pr_type,
		       pr.value,
		       pr.unit,
		       pr.achieved_at
		FROM personal_records pr
		JOIN exercises e ON e.id = pr.exercise_id
		WHERE pr.user_id = ?
		  AND pr.exercise_id = ?
		ORDER BY pr.achieved_at DESC
		LIMIT ?`,
		userID, exerciseID, limit,
	).Scan(&items).Error; err != nil {
		return nil, fmt.Errorf("get exercise pr history: %w", err)
	}

	return items, nil
}
