package repository

import (
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"wsTrack/server/internal/dto"
	"wsTrack/server/internal/enum"
	"wsTrack/server/internal/model"
	"wsTrack/server/internal/testutil"
)

func BenchmarkGetDashboard(b *testing.B) {
	db := testutil.SetupTestDB(b)
	b.Cleanup(func() {
		closeBenchmarkDB(db)
		testutil.TearDown()
	})

	user, err := testutil.CreateTestUser(db, "bench-dashboard@example.com", "StrongPass123")
	if err != nil {
		b.Fatalf("create test user: %v", err)
	}
	fixture, err := testutil.SeedLargeStatsTestData(db, user.ID, 500)
	if err != nil {
		b.Fatalf("seed benchmark data: %v", err)
	}

	repo := NewStatsRepository(db)
	currentWeekStart := benchmarkStartOfWeek(fixture.ReferenceNow)
	currentWeekEnd := currentWeekStart.AddDate(0, 0, 7)
	lastWeekStart := currentWeekStart.AddDate(0, 0, -7)

	b.ReportAllocs()
	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		dashboard, err := repo.GetDashboardSummary(user.ID, currentWeekStart, currentWeekEnd, lastWeekStart)
		if err != nil {
			b.Fatalf("GetDashboardSummary: %v", err)
		}
		if dashboard == nil {
			b.Fatal("GetDashboardSummary returned nil")
		}

		frequency, err := repo.GetFrequencyStats(user.ID)
		if err != nil {
			b.Fatalf("GetFrequencyStats: %v", err)
		}
		if frequency == nil {
			b.Fatal("GetFrequencyStats returned nil")
		}

		if _, err := repo.GetPRHistory(user.ID, 5); err != nil {
			b.Fatalf("GetPRHistory: %v", err)
		}

		if _, err := repo.GetMuscleDistribution(user.ID, currentWeekStart, fixture.ReferenceNow); err != nil {
			b.Fatalf("GetMuscleDistribution: %v", err)
		}
	}
}

func BenchmarkGetVolumeHistory_6Months(b *testing.B) {
	db := testutil.SetupTestDB(b)
	b.Cleanup(func() {
		closeBenchmarkDB(db)
		testutil.TearDown()
	})

	user, err := testutil.CreateTestUser(db, "bench-volume@example.com", "StrongPass123")
	if err != nil {
		b.Fatalf("create test user: %v", err)
	}
	fixture, err := testutil.SeedLargeStatsTestData(db, user.ID, 500)
	if err != nil {
		b.Fatalf("seed benchmark data: %v", err)
	}

	repo := NewStatsRepository(db)
	req := dto.VolumeStatsRequest{
		Period:   "weekly",
		DateFrom: fixture.ReferenceNow.AddDate(0, -6, 0),
		DateTo:   fixture.ReferenceNow,
	}

	b.ReportAllocs()
	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		items, err := repo.GetVolumeHistory(user.ID, req)
		if err != nil {
			b.Fatalf("GetVolumeHistory: %v", err)
		}
		if items == nil {
			b.Fatal("GetVolumeHistory returned nil")
		}
	}
}

func BenchmarkGetMuscleDistribution(b *testing.B) {
	db := testutil.SetupTestDB(b)
	b.Cleanup(func() {
		closeBenchmarkDB(db)
		testutil.TearDown()
	})

	user, err := testutil.CreateTestUser(db, "bench-muscles@example.com", "StrongPass123")
	if err != nil {
		b.Fatalf("create test user: %v", err)
	}
	fixture, err := testutil.SeedLargeStatsTestData(db, user.ID, 500)
	if err != nil {
		b.Fatalf("seed benchmark data: %v", err)
	}

	repo := NewStatsRepository(db)
	dateFrom := fixture.ReferenceNow.AddDate(0, -6, 0)

	b.ReportAllocs()
	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		items, err := repo.GetMuscleDistribution(user.ID, dateFrom, fixture.ReferenceNow)
		if err != nil {
			b.Fatalf("GetMuscleDistribution: %v", err)
		}
		if items == nil {
			b.Fatal("GetMuscleDistribution returned nil")
		}
	}
}

func BenchmarkBatchSync_10Workouts(b *testing.B) {
	db := testutil.SetupTestDB(b)
	b.Cleanup(func() {
		closeBenchmarkDB(db)
		testutil.TearDown()
	})

	user, err := testutil.CreateTestUser(db, "bench-batch-sync@example.com", "StrongPass123")
	if err != nil {
		b.Fatalf("create test user: %v", err)
	}
	exerciseIDs, err := createBenchmarkExercises(db, user.ID)
	if err != nil {
		b.Fatalf("create benchmark exercises: %v", err)
	}

	repo := NewWorkoutRepository(db)

	b.ReportAllocs()
	b.ResetTimer()

	for i := 0; i < b.N; i++ {
		b.StopTimer()
		workouts := buildBenchmarkWorkoutBatch(exerciseIDs, i, 10)
		b.StartTimer()

		ids, err := repo.BatchSync(user.ID, workouts)
		if err != nil {
			b.Fatalf("BatchSync: %v", err)
		}
		if len(ids) != 10 {
			b.Fatalf("BatchSync synced %d workouts, want 10", len(ids))
		}

		b.StopTimer()
		if err := cleanupBenchmarkWorkouts(db, ids); err != nil {
			b.Fatalf("cleanup benchmark workouts: %v", err)
		}
	}
}

func createBenchmarkExercises(db *gorm.DB, userID uuid.UUID) ([]uuid.UUID, error) {
	definitions := []struct {
		name             string
		nameEn           string
		primaryMuscles   []string
		secondaryMuscles []string
		equipment        enum.Equipment
	}{
		{"杠铃卧推", "Barbell Bench Press", []string{"chest"}, []string{"triceps", "shoulders"}, enum.EquipmentBarbell},
		{"深蹲", "Back Squat", []string{"quads", "glutes"}, []string{"hamstrings"}, enum.EquipmentBarbell},
		{"硬拉", "Deadlift", []string{"back", "glutes", "hamstrings"}, []string{"forearms"}, enum.EquipmentBarbell},
		{"杠铃划船", "Barbell Row", []string{"back"}, []string{"biceps"}, enum.EquipmentBarbell},
		{"站姿推举", "Overhead Press", []string{"shoulders"}, []string{"triceps"}, enum.EquipmentBarbell},
	}

	ids := make([]uuid.UUID, 0, len(definitions))
	for _, definition := range definitions {
		exercise := &model.Exercise{
			UserID:           &userID,
			Name:             definition.name,
			NameEn:           benchmarkStringPtr(definition.nameEn),
			Category:         enum.ExerciseCategoryStrength,
			PrimaryMuscles:   model.StringArray(definition.primaryMuscles),
			SecondaryMuscles: model.StringArray(definition.secondaryMuscles),
			Equipment:        definition.equipment,
			TrackingType:     enum.TrackingTypeWeightReps,
			IsCustom:         true,
			IsArchived:       false,
		}
		if err := db.Create(exercise).Error; err != nil {
			return nil, fmt.Errorf("create exercise %s: %w", definition.name, err)
		}
		ids = append(ids, exercise.ID)
	}

	return ids, nil
}

func buildBenchmarkWorkoutBatch(exerciseIDs []uuid.UUID, iteration int, count int) []dto.WorkoutFullData {
	workouts := make([]dto.WorkoutFullData, 0, count)
	baseTime := time.Now().UTC().AddDate(0, 0, -count)
	for workoutIndex := 0; workoutIndex < count; workoutIndex++ {
		startedAt := baseTime.Add(time.Duration(workoutIndex) * 2 * time.Hour)
		workouts = append(workouts, buildBenchmarkWorkout(exerciseIDs, iteration, workoutIndex, startedAt))
	}
	return workouts
}

func buildBenchmarkWorkout(exerciseIDs []uuid.UUID, iteration int, workoutIndex int, startedAt time.Time) dto.WorkoutFullData {
	exercises := make([]dto.WorkoutExerciseData, 0, len(exerciseIDs))

	for exerciseIndex, exerciseID := range exerciseIDs {
		sets := make([]dto.WorkoutSetData, 0, 4)
		for setIndex := 0; setIndex < 4; setIndex++ {
			weight := 60 + float64(exerciseIndex*10) + float64(setIndex)*2.5 + float64((iteration+workoutIndex)%5)
			reps := 8 + ((iteration + workoutIndex + setIndex) % 4)
			sets = append(sets, dto.WorkoutSetData{
				ClientID:    fmt.Sprintf("bench-set-%d-%d-%d-%d", iteration, workoutIndex, exerciseIndex, setIndex),
				SetNumber:   setIndex + 1,
				Weight:      benchmarkFloatPtr(weight),
				Reps:        benchmarkIntPtr(reps),
				RPE:         benchmarkFloatPtr(8),
				IsWarmup:    false,
				IsCompleted: true,
				RestSeconds: benchmarkIntPtr(90),
				Unit:        string(enum.WeightUnitKG),
				CompletedAt: benchmarkTimePtr(startedAt.Add(time.Duration(setIndex+1) * 5 * time.Minute)),
			})
		}

		exercises = append(exercises, dto.WorkoutExerciseData{
			ClientID:   fmt.Sprintf("bench-exercise-%d-%d-%d", iteration, workoutIndex, exerciseIndex),
			ExerciseID: exerciseID,
			SortOrder:  exerciseIndex,
			Sets:       sets,
		})
	}

	finishedAt := startedAt.Add(45 * time.Minute)
	return dto.WorkoutFullData{
		ClientID:        fmt.Sprintf("bench-workout-%d-%d", iteration, workoutIndex),
		StartedAt:       startedAt,
		FinishedAt:      &finishedAt,
		DurationSeconds: int(finishedAt.Sub(startedAt).Seconds()),
		Exercises:       exercises,
	}
}

func cleanupBenchmarkWorkouts(db *gorm.DB, ids []uuid.UUID) error {
	if len(ids) == 0 {
		return nil
	}
	return db.Where("id IN ?", ids).Delete(&model.Workout{}).Error
}

func closeBenchmarkDB(db *gorm.DB) {
	if db == nil {
		return
	}
	sqlDB, err := db.DB()
	if err == nil {
		_ = sqlDB.Close()
	}
}

func benchmarkStartOfWeek(t time.Time) time.Time {
	weekday := int(t.Weekday())
	if weekday == 0 {
		weekday = 7
	}
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location()).AddDate(0, 0, -(weekday - 1))
}

func benchmarkStringPtr(value string) *string {
	return &value
}

func benchmarkIntPtr(value int) *int {
	return &value
}

func benchmarkFloatPtr(value float64) *float64 {
	return &value
}

func benchmarkTimePtr(value time.Time) *time.Time {
	return &value
}
