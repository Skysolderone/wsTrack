package testutil

import (
	"fmt"
	"sort"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"wsTrack/server/internal/dto"
	"wsTrack/server/internal/enum"
	"wsTrack/server/internal/model"
)

type StatsSeedData struct {
	ReferenceNow                  time.Time
	CurrentWeekStart              time.Time
	DateFrom                      time.Time
	DateTo                        time.Time
	WeeklyHistory                 []dto.VolumeDataPoint
	DailyHistory                  []dto.VolumeDataPoint
	MonthlyHistory                []dto.VolumeDataPoint
	FullRangeMuscleDistribution   []dto.MuscleVolumeData
	CurrentWeekMuscleDistribution []dto.MuscleVolumeData
	Dashboard                     StatsDashboardExpectation
	Frequency                     StatsFrequencyExpectation
	TargetExercise                StatsExerciseExpectation
}

type StatsDashboardExpectation struct {
	WeeklyWorkouts      int
	WeeklyVolume        float64
	LastWeekVolume      float64
	VolumeChangePercent float64
	CurrentStreak       int
	RecentPRs           []dto.PRRecord
}

type StatsFrequencyExpectation struct {
	WeeklyAvg     float64
	CurrentStreak int
	LongestStreak int
}

type StatsExerciseExpectation struct {
	ExerciseID       uuid.UUID
	ExerciseName     string
	VolumeHistory    []dto.VolumeDataPoint
	MaxWeightHistory []dto.VolumeDataPoint
	Estimated1RM     float64
	PersonalRecords  []dto.PRRecord
	TotalSessions    int
}

type LargeStatsSeedData struct {
	ReferenceNow   time.Time
	DateFrom       time.Time
	DateTo         time.Time
	TargetExercise uuid.UUID
}

type exerciseDefinition struct {
	Key              string
	Name             string
	NameEn           string
	PrimaryMuscles   []string
	SecondaryMuscles []string
	Equipment        enum.Equipment
	BaseWeight       float64
	RepBase          int
}

type sessionMetrics struct {
	Date          time.Time
	Volume        float64
	MaxWeight     float64
	BestEstimated float64
}

type muscleAggregate struct {
	Volume float64
	Sets   int
}

type volumeAggregate struct {
	Label   string
	SortKey time.Time
	Volume  float64
}

func SeedStatsTestData(db *gorm.DB, userID uuid.UUID) (*StatsSeedData, error) {
	referenceNow := time.Now().UTC().Truncate(time.Second)
	currentWeekStart := statsStartOfWeek(referenceNow)
	exercises, err := createStatsExercises(db, userID)
	if err != nil {
		return nil, err
	}

	templates := [][]string{
		{"row", "curl", "leg_raise", "calf_raise", "burpee"},
		{"squat", "overhead_press", "wrist_curl", "hip_thrust", "burpee"},
		{"romanian_deadlift", "pushdown", "row", "leg_raise", "calf_raise"},
		{"bench_press", "squat", "overhead_press", "pushdown", "wrist_curl"},
	}

	weeklyVolumes := make(map[string]*volumeAggregate)
	dailyVolumes := make(map[string]*volumeAggregate)
	monthlyVolumes := make(map[string]*volumeAggregate)
	fullRangeMuscles := make(map[string]*muscleAggregate)
	currentWeekMuscles := make(map[string]*muscleAggregate)
	workoutDates := make([]time.Time, 0, 32)
	targetSessions := make([]sessionMetrics, 0, 8)
	var latestBenchSet *model.WorkoutSet
	var latestBenchWorkout *model.Workout
	targetExercise := exercises["bench_press"]

	oldestWorkoutDate := referenceNow
	latestWorkoutDate := time.Time{}
	totalWorkouts := 0

	for weekOffset := 7; weekOffset >= 0; weekOffset-- {
		progressIndex := 7 - weekOffset
		weekStart := currentWeekStart.AddDate(0, 0, -7*weekOffset)
		workoutDatesForWeek := statsWeekWorkoutTimes(weekStart, referenceNow, weekOffset == 0)
		templateIndices := []int{0, 1, 2, 3}
		if weekOffset == 5 && len(workoutDatesForWeek) == 4 {
			workoutDatesForWeek = []time.Time{workoutDatesForWeek[0], workoutDatesForWeek[1], workoutDatesForWeek[3]}
			templateIndices = []int{0, 1, 3}
		}

		for workoutIndex, startedAt := range workoutDatesForWeek {
			workout, metrics, benchSet := buildStatsWorkout(
				userID,
				fmt.Sprintf("stats-week-%d-workout-%d", weekOffset, workoutIndex),
				startedAt,
				progressIndex,
				workoutIndex,
				templates[templateIndices[workoutIndex]],
				exercises,
			)
			if err := createFixtureWorkoutTree(db, workout); err != nil {
				return nil, fmt.Errorf("create stats workout: %w", err)
			}

			totalWorkouts++
			workoutDates = append(workoutDates, startedAt)
			if startedAt.Before(oldestWorkoutDate) {
				oldestWorkoutDate = startedAt
			}
			if latestWorkoutDate.IsZero() || startedAt.After(latestWorkoutDate) {
				latestWorkoutDate = startedAt
				latestBenchWorkout = workout
				latestBenchSet = benchSet
			}

			addVolumeAggregate(weeklyVolumes, statsISOWeekLabel(startedAt), statsStartOfWeek(startedAt), workout.TotalVolume)
			addVolumeAggregate(dailyVolumes, startedAt.Format("2006-01-02"), statsDayStart(startedAt), workout.TotalVolume)
			addVolumeAggregate(monthlyVolumes, startedAt.Format("2006-01"), statsMonthStart(startedAt), workout.TotalVolume)

			for muscle, aggregate := range metrics.Muscles {
				addMuscleAggregate(fullRangeMuscles, muscle, aggregate.Volume, aggregate.Sets)
				if !startedAt.Before(currentWeekStart) && !startedAt.After(referenceNow) {
					addMuscleAggregate(currentWeekMuscles, muscle, aggregate.Volume, aggregate.Sets)
				}
			}

			if metrics.Target != nil {
				targetSessions = append(targetSessions, *metrics.Target)
			}
		}
	}

	if latestBenchWorkout == nil || latestBenchSet == nil {
		return nil, fmt.Errorf("latest bench workout was not generated")
	}

	recentPRs, err := createStatsPRs(db, userID, targetExercise, latestBenchWorkout, latestBenchSet)
	if err != nil {
		return nil, err
	}

	weeklyHistory := orderedVolumeAggregates(weeklyVolumes)
	dailyHistory := orderedVolumeAggregates(dailyVolumes)
	monthlyHistory := orderedVolumeAggregates(monthlyVolumes)
	fullRangeMuscleDistribution := orderedMuscleAggregates(fullRangeMuscles)
	currentWeekMuscleDistribution := orderedMuscleAggregates(currentWeekMuscles)
	frequency := calculateFrequencyExpectation(referenceNow, workoutDates, totalWorkouts)
	targetStats := buildTargetExerciseExpectation(targetExercise, targetSessions, recentPRs)
	weeklyVolume := 0.0
	lastWeekVolume := 0.0
	currentWeekLabel := statsISOWeekLabel(referenceNow)
	lastWeekLabel := statsISOWeekLabel(currentWeekStart.AddDate(0, 0, -7))
	if aggregate, ok := weeklyVolumes[currentWeekLabel]; ok {
		weeklyVolume = aggregate.Volume
	}
	if aggregate, ok := weeklyVolumes[lastWeekLabel]; ok {
		lastWeekVolume = aggregate.Volume
	}

	return &StatsSeedData{
		ReferenceNow:                  referenceNow,
		CurrentWeekStart:              currentWeekStart,
		DateFrom:                      statsDayStart(oldestWorkoutDate),
		DateTo:                        referenceNow,
		WeeklyHistory:                 weeklyHistory,
		DailyHistory:                  dailyHistory,
		MonthlyHistory:                monthlyHistory,
		FullRangeMuscleDistribution:   fullRangeMuscleDistribution,
		CurrentWeekMuscleDistribution: currentWeekMuscleDistribution,
		Dashboard: StatsDashboardExpectation{
			WeeklyWorkouts:      4,
			WeeklyVolume:        weeklyVolume,
			LastWeekVolume:      lastWeekVolume,
			VolumeChangePercent: statsVolumeChange(weeklyVolume, lastWeekVolume),
			CurrentStreak:       frequency.CurrentStreak,
			RecentPRs:           recentPRs,
		},
		Frequency:      frequency,
		TargetExercise: targetStats,
	}, nil
}

func SeedLargeStatsTestData(db *gorm.DB, userID uuid.UUID, workoutCount int) (*LargeStatsSeedData, error) {
	referenceNow := time.Now().UTC().Truncate(time.Second)
	exercises, err := createStatsExercises(db, userID)
	if err != nil {
		return nil, err
	}

	targetExercise := exercises["bench_press"]
	startDate := referenceNow.AddDate(0, 0, -workoutCount+1)
	oldest := startDate
	for i := 0; i < workoutCount; i++ {
		startedAt := startDate.AddDate(0, 0, i)
		startedAt = time.Date(startedAt.Year(), startedAt.Month(), startedAt.Day(), 7+(i%12), 0, 0, 0, time.UTC)
		workout, _, _ := buildStatsWorkout(
			userID,
			fmt.Sprintf("stats-large-workout-%03d", i),
			startedAt,
			i%12,
			i%4,
			[]string{"bench_press", "squat", "row", "overhead_press", "calf_raise"},
			exercises,
		)
		if err := createFixtureWorkoutTree(db, workout); err != nil {
			return nil, fmt.Errorf("create large stats workout: %w", err)
		}
	}

	return &LargeStatsSeedData{
		ReferenceNow:   referenceNow,
		DateFrom:       statsDayStart(oldest),
		DateTo:         referenceNow,
		TargetExercise: targetExercise.ID,
	}, nil
}

type builtWorkoutMetrics struct {
	Muscles map[string]*muscleAggregate
	Target  *sessionMetrics
}

func buildStatsWorkout(
	userID uuid.UUID,
	clientID string,
	startedAt time.Time,
	progressIndex int,
	workoutIndex int,
	exerciseKeys []string,
	exercises map[string]*model.Exercise,
) (*model.Workout, builtWorkoutMetrics, *model.WorkoutSet) {
	workout := &model.Workout{
		UserID:          userID,
		ClientID:        clientID,
		StartedAt:       startedAt,
		FinishedAt:      statsTimePtr(startedAt.Add(70 * time.Minute)),
		DurationSeconds: 70 * 60,
		Exercises:       make([]model.WorkoutExercise, 0, len(exerciseKeys)),
	}
	metrics := builtWorkoutMetrics{
		Muscles: make(map[string]*muscleAggregate),
	}
	var latestBenchSet *model.WorkoutSet
	benchExerciseIndex := -1
	benchSetIndex := -1

	for exerciseIndex, key := range exerciseKeys {
		definition := statsExerciseDefinitions()[key]
		exercise := exercises[key]
		workoutExercise := model.WorkoutExercise{
			ClientID:   fmt.Sprintf("%s-exercise-%d", clientID, exerciseIndex),
			ExerciseID: exercise.ID,
			SortOrder:  exerciseIndex,
			Sets:       make([]model.WorkoutSet, 0, 4),
		}

		exerciseVolume := 0.0
		session := sessionMetrics{Date: startedAt}
		for setIndex := 0; setIndex < 4; setIndex++ {
			weightValue := definition.BaseWeight + float64(progressIndex*4+workoutIndex) + float64(setIndex)*2.5
			repsValue := maxInt(1, definition.RepBase+2-setIndex)
			set := model.WorkoutSet{
				ClientID:        fmt.Sprintf("%s-set-%d-%d", clientID, exerciseIndex, setIndex),
				SetNumber:       setIndex + 1,
				Weight:          statsFloatPtr(weightValue),
				Reps:            statsIntPtr(repsValue),
				IsWarmup:        false,
				IsCompleted:     true,
				Unit:            enum.WeightUnitKG,
				CompletedAt:     statsTimePtr(startedAt.Add(time.Duration(10+setIndex) * time.Minute)),
				RestSeconds:     statsIntPtr(90),
				DurationSeconds: nil,
			}
			setVolume := weightValue * float64(repsValue)
			exerciseVolume += setVolume
			workoutExercise.Sets = append(workoutExercise.Sets, set)

			if key == "bench_press" {
				if weightValue > session.MaxWeight {
					session.MaxWeight = weightValue
				}
				estimated := weightValue * (1 + float64(repsValue)/30.0)
				if estimated > session.BestEstimated {
					session.BestEstimated = estimated
				}
				session.Volume += setVolume
			}
		}
		workoutExercise.Volume = exerciseVolume
		workout.Exercises = append(workout.Exercises, workoutExercise)

		for _, muscle := range exercise.PrimaryMuscles {
			addMuscleAggregate(metrics.Muscles, muscle, exerciseVolume, len(workoutExercise.Sets))
		}

		if key == "bench_press" {
			metrics.Target = &session
			benchExerciseIndex = exerciseIndex
			benchSetIndex = len(workoutExercise.Sets) - 1
			latestBenchSet = &workoutExercise.Sets[benchSetIndex]
		}
	}

	recalculateFixtureWorkoutTotals(workout)
	if latestBenchSet != nil && benchExerciseIndex >= 0 && benchSetIndex >= 0 {
		latestBenchSet = &workout.Exercises[benchExerciseIndex].Sets[benchSetIndex]
	}

	return workout, metrics, latestBenchSet
}

func createStatsPRs(
	db *gorm.DB,
	userID uuid.UUID,
	exercise *model.Exercise,
	workout *model.Workout,
	set *model.WorkoutSet,
) ([]dto.PRRecord, error) {
	if set.Weight == nil || set.Reps == nil || set.CompletedAt == nil {
		return nil, fmt.Errorf("bench pr source set is incomplete")
	}

	estimated1RM := *set.Weight * (1 + float64(*set.Reps)/30.0)
	records := []model.PersonalRecord{
		{
			UserID:       userID,
			ExerciseID:   exercise.ID,
			WorkoutID:    &workout.ID,
			WorkoutSetID: &set.ID,
			PRType:       "estimated_1rm",
			Value:        estimated1RM,
			Unit:         "kg",
			AchievedAt:   set.CompletedAt.Add(-2 * time.Minute),
		},
		{
			UserID:       userID,
			ExerciseID:   exercise.ID,
			WorkoutID:    &workout.ID,
			WorkoutSetID: &set.ID,
			PRType:       "max_volume",
			Value:        *set.Weight * float64(*set.Reps),
			Unit:         "kg",
			AchievedAt:   set.CompletedAt.Add(-1 * time.Minute),
		},
		{
			UserID:       userID,
			ExerciseID:   exercise.ID,
			WorkoutID:    &workout.ID,
			WorkoutSetID: &set.ID,
			PRType:       "max_weight",
			Value:        *set.Weight,
			Unit:         "kg",
			AchievedAt:   *set.CompletedAt,
		},
	}
	if err := db.Create(&records).Error; err != nil {
		return nil, fmt.Errorf("create stats personal records: %w", err)
	}

	items := make([]dto.PRRecord, 0, len(records))
	for _, record := range records {
		items = append(items, dto.PRRecord{
			ID:           record.ID,
			ExerciseName: exercise.Name,
			PRType:       record.PRType,
			Value:        record.Value,
			Unit:         record.Unit,
			AchievedAt:   record.AchievedAt,
		})
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].AchievedAt.After(items[j].AchievedAt)
	})

	return items, nil
}

func createStatsExercises(db *gorm.DB, userID uuid.UUID) (map[string]*model.Exercise, error) {
	items := make(map[string]*model.Exercise)
	for key, definition := range statsExerciseDefinitions() {
		exercise := &model.Exercise{
			UserID:           &userID,
			Name:             definition.Name,
			NameEn:           statsStringPtr(definition.NameEn),
			Category:         enum.ExerciseCategoryStrength,
			PrimaryMuscles:   model.StringArray(definition.PrimaryMuscles),
			SecondaryMuscles: model.StringArray(definition.SecondaryMuscles),
			Equipment:        definition.Equipment,
			TrackingType:     enum.TrackingTypeWeightReps,
			IsCustom:         true,
			IsArchived:       false,
		}
		if err := db.Create(exercise).Error; err != nil {
			return nil, fmt.Errorf("create stats exercise: %w", err)
		}
		items[key] = exercise
	}
	return items, nil
}

func buildTargetExerciseExpectation(
	exercise *model.Exercise,
	sessions []sessionMetrics,
	personalRecords []dto.PRRecord,
) StatsExerciseExpectation {
	sort.Slice(sessions, func(i, j int) bool {
		return sessions[i].Date.Before(sessions[j].Date)
	})

	volumeHistory := make([]dto.VolumeDataPoint, 0, len(sessions))
	maxWeightHistory := make([]dto.VolumeDataPoint, 0, len(sessions))
	estimated1RM := 0.0
	for _, session := range sessions {
		volumeHistory = append(volumeHistory, dto.VolumeDataPoint{
			Date:   session.Date.Format("2006-01-02"),
			Volume: session.Volume,
		})
		maxWeightHistory = append(maxWeightHistory, dto.VolumeDataPoint{
			Date:   session.Date.Format("2006-01-02"),
			Volume: session.MaxWeight,
		})
		if session.BestEstimated > estimated1RM {
			estimated1RM = session.BestEstimated
		}
	}

	return StatsExerciseExpectation{
		ExerciseID:       exercise.ID,
		ExerciseName:     exercise.Name,
		VolumeHistory:    volumeHistory,
		MaxWeightHistory: maxWeightHistory,
		Estimated1RM:     estimated1RM,
		PersonalRecords:  personalRecords,
		TotalSessions:    len(sessions),
	}
}

func calculateFrequencyExpectation(referenceNow time.Time, workoutDates []time.Time, totalWorkouts int) StatsFrequencyExpectation {
	weekLabels := make(map[string]struct{})
	distinctDates := make(map[time.Time]struct{})
	for _, startedAt := range workoutDates {
		weekLabels[statsISOWeekLabel(startedAt)] = struct{}{}
		distinctDates[statsDayStart(startedAt)] = struct{}{}
	}

	dates := make([]time.Time, 0, len(distinctDates))
	for date := range distinctDates {
		dates = append(dates, date)
	}
	sort.Slice(dates, func(i, j int) bool {
		return dates[i].Before(dates[j])
	})

	longestStreak := 0
	currentStreak := 0
	streakLength := 0
	streakStart := time.Time{}
	streakEnd := time.Time{}
	for index, date := range dates {
		if index == 0 || !date.Equal(dates[index-1].AddDate(0, 0, 1)) {
			streakLength = 1
			streakStart = date
		} else {
			streakLength++
		}
		streakEnd = date
		if streakLength > longestStreak {
			longestStreak = streakLength
		}
		if !streakEnd.Before(statsDayStart(referenceNow).AddDate(0, 0, -1)) {
			if streakLength > currentStreak {
				currentStreak = streakLength
			}
		}
		_ = streakStart
	}

	weeklyAvg := 0.0
	if len(weekLabels) > 0 {
		weeklyAvg = float64(totalWorkouts) / float64(len(weekLabels))
	}

	return StatsFrequencyExpectation{
		WeeklyAvg:     weeklyAvg,
		CurrentStreak: currentStreak,
		LongestStreak: longestStreak,
	}
}

func orderedVolumeAggregates(items map[string]*volumeAggregate) []dto.VolumeDataPoint {
	values := make([]*volumeAggregate, 0, len(items))
	for _, item := range items {
		values = append(values, item)
	}
	sort.Slice(values, func(i, j int) bool {
		return values[i].SortKey.Before(values[j].SortKey)
	})

	result := make([]dto.VolumeDataPoint, 0, len(values))
	for _, item := range values {
		result = append(result, dto.VolumeDataPoint{
			Date:   item.Label,
			Volume: item.Volume,
		})
	}
	return result
}

func orderedMuscleAggregates(items map[string]*muscleAggregate) []dto.MuscleVolumeData {
	result := make([]dto.MuscleVolumeData, 0, len(items))
	for muscle, aggregate := range items {
		result = append(result, dto.MuscleVolumeData{
			Muscle: muscle,
			Volume: aggregate.Volume,
			Sets:   aggregate.Sets,
		})
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].Volume == result[j].Volume {
			if result[i].Sets == result[j].Sets {
				return result[i].Muscle < result[j].Muscle
			}
			return result[i].Sets > result[j].Sets
		}
		return result[i].Volume > result[j].Volume
	})
	return result
}

func recalculateFixtureWorkoutTotals(workout *model.Workout) {
	workout.TotalVolume = 0
	workout.TotalSets = 0
	for exerciseIndex := range workout.Exercises {
		workout.Exercises[exerciseIndex].Volume = 0
		workout.TotalSets += len(workout.Exercises[exerciseIndex].Sets)
		for _, set := range workout.Exercises[exerciseIndex].Sets {
			if !set.IsCompleted || set.IsWarmup || set.Weight == nil || set.Reps == nil {
				continue
			}
			setVolume := *set.Weight * float64(*set.Reps)
			workout.Exercises[exerciseIndex].Volume += setVolume
			workout.TotalVolume += setVolume
		}
	}
}

func createFixtureWorkoutTree(db *gorm.DB, workout *model.Workout) error {
	return db.Transaction(func(tx *gorm.DB) error {
		exercises := workout.Exercises
		workout.Exercises = nil
		if err := tx.Create(workout).Error; err != nil {
			return fmt.Errorf("create workout: %w", err)
		}

		for exerciseIndex := range exercises {
			sets := exercises[exerciseIndex].Sets
			exercises[exerciseIndex].Sets = nil
			exercises[exerciseIndex].WorkoutID = workout.ID

			if err := tx.Create(&exercises[exerciseIndex]).Error; err != nil {
				return fmt.Errorf("create workout exercise: %w", err)
			}

			for setIndex := range sets {
				sets[setIndex].WorkoutExerciseID = exercises[exerciseIndex].ID
				if err := tx.Create(&sets[setIndex]).Error; err != nil {
					return fmt.Errorf("create workout set: %w", err)
				}
			}

			exercises[exerciseIndex].Sets = sets
		}

		workout.Exercises = exercises
		return nil
	})
}

func statsWeekWorkoutTimes(weekStart, now time.Time, isCurrentWeek bool) []time.Time {
	if !isCurrentWeek {
		return []time.Time{
			time.Date(weekStart.Year(), weekStart.Month(), weekStart.Day(), 6, 0, 0, 0, time.UTC),
			time.Date(weekStart.AddDate(0, 0, 1).Year(), weekStart.AddDate(0, 0, 1).Month(), weekStart.AddDate(0, 0, 1).Day(), 12, 0, 0, 0, time.UTC),
			time.Date(weekStart.AddDate(0, 0, 3).Year(), weekStart.AddDate(0, 0, 3).Month(), weekStart.AddDate(0, 0, 3).Day(), 18, 0, 0, 0, time.UTC),
			time.Date(weekStart.AddDate(0, 0, 5).Year(), weekStart.AddDate(0, 0, 5).Month(), weekStart.AddDate(0, 0, 5).Day(), 20, 0, 0, 0, time.UTC),
		}
	}

	today := statsDayStart(now)
	days := make([]time.Time, 0, 4)
	for day := today; !day.Before(weekStart) && len(days) < 4; day = day.AddDate(0, 0, -1) {
		days = append(days, day)
	}
	for len(days) < 4 {
		days = append(days, today)
	}
	sort.Slice(days, func(i, j int) bool {
		return days[i].Before(days[j])
	})
	hours := []int{6, 12, 18, 20}
	result := make([]time.Time, 0, len(days))
	for index, day := range days {
		result = append(result, time.Date(day.Year(), day.Month(), day.Day(), hours[index], 0, 0, 0, time.UTC))
	}
	return result
}

func statsExerciseDefinitions() map[string]exerciseDefinition {
	return map[string]exerciseDefinition{
		"bench_press": {
			Key:              "bench_press",
			Name:             "杠铃卧推",
			NameEn:           "Barbell Bench Press",
			PrimaryMuscles:   []string{"chest"},
			SecondaryMuscles: []string{"shoulders", "triceps"},
			Equipment:        enum.EquipmentBarbell,
			BaseWeight:       80,
			RepBase:          8,
		},
		"row": {
			Key:              "row",
			Name:             "杠铃划船",
			NameEn:           "Barbell Row",
			PrimaryMuscles:   []string{"back"},
			SecondaryMuscles: []string{"biceps"},
			Equipment:        enum.EquipmentBarbell,
			BaseWeight:       70,
			RepBase:          10,
		},
		"curl": {
			Key:              "curl",
			Name:             "哑铃弯举",
			NameEn:           "Dumbbell Curl",
			PrimaryMuscles:   []string{"biceps"},
			SecondaryMuscles: []string{"forearms"},
			Equipment:        enum.EquipmentDumbbell,
			BaseWeight:       22,
			RepBase:          12,
		},
		"leg_raise": {
			Key:              "leg_raise",
			Name:             "悬垂举腿",
			NameEn:           "Hanging Leg Raise",
			PrimaryMuscles:   []string{"abs"},
			SecondaryMuscles: []string{"hip_flexors"},
			Equipment:        enum.EquipmentBodyweight,
			BaseWeight:       15,
			RepBase:          12,
		},
		"calf_raise": {
			Key:              "calf_raise",
			Name:             "提踵",
			NameEn:           "Calf Raise",
			PrimaryMuscles:   []string{"calves"},
			SecondaryMuscles: []string{},
			Equipment:        enum.EquipmentMachine,
			BaseWeight:       90,
			RepBase:          15,
		},
		"burpee": {
			Key:              "burpee",
			Name:             "波比跳",
			NameEn:           "Burpee",
			PrimaryMuscles:   []string{"full_body"},
			SecondaryMuscles: []string{"shoulders"},
			Equipment:        enum.EquipmentBodyweight,
			BaseWeight:       8,
			RepBase:          12,
		},
		"squat": {
			Key:              "squat",
			Name:             "杠铃深蹲",
			NameEn:           "Barbell Squat",
			PrimaryMuscles:   []string{"quads", "glutes"},
			SecondaryMuscles: []string{"hamstrings"},
			Equipment:        enum.EquipmentBarbell,
			BaseWeight:       110,
			RepBase:          8,
		},
		"overhead_press": {
			Key:              "overhead_press",
			Name:             "杠铃推举",
			NameEn:           "Barbell Overhead Press",
			PrimaryMuscles:   []string{"shoulders"},
			SecondaryMuscles: []string{"triceps"},
			Equipment:        enum.EquipmentBarbell,
			BaseWeight:       52.5,
			RepBase:          8,
		},
		"wrist_curl": {
			Key:              "wrist_curl",
			Name:             "腕弯举",
			NameEn:           "Wrist Curl",
			PrimaryMuscles:   []string{"forearms"},
			SecondaryMuscles: []string{"biceps"},
			Equipment:        enum.EquipmentDumbbell,
			BaseWeight:       18,
			RepBase:          15,
		},
		"hip_thrust": {
			Key:              "hip_thrust",
			Name:             "臀桥",
			NameEn:           "Barbell Hip Thrust",
			PrimaryMuscles:   []string{"glutes"},
			SecondaryMuscles: []string{"hamstrings"},
			Equipment:        enum.EquipmentBarbell,
			BaseWeight:       130,
			RepBase:          10,
		},
		"romanian_deadlift": {
			Key:              "romanian_deadlift",
			Name:             "罗马尼亚硬拉",
			NameEn:           "Romanian Deadlift",
			PrimaryMuscles:   []string{"hamstrings", "glutes"},
			SecondaryMuscles: []string{"back"},
			Equipment:        enum.EquipmentBarbell,
			BaseWeight:       95,
			RepBase:          8,
		},
		"pushdown": {
			Key:              "pushdown",
			Name:             "绳索下压",
			NameEn:           "Cable Pushdown",
			PrimaryMuscles:   []string{"triceps"},
			SecondaryMuscles: []string{"shoulders"},
			Equipment:        enum.EquipmentCable,
			BaseWeight:       36,
			RepBase:          12,
		},
	}
}

func addVolumeAggregate(items map[string]*volumeAggregate, label string, sortKey time.Time, volume float64) {
	if _, ok := items[label]; !ok {
		items[label] = &volumeAggregate{
			Label:   label,
			SortKey: sortKey,
		}
	}
	items[label].Volume += volume
}

func addMuscleAggregate(items map[string]*muscleAggregate, muscle string, volume float64, sets int) {
	if _, ok := items[muscle]; !ok {
		items[muscle] = &muscleAggregate{}
	}
	items[muscle].Volume += volume
	items[muscle].Sets += sets
}

func statsStartOfWeek(t time.Time) time.Time {
	weekday := int(t.Weekday())
	if weekday == 0 {
		weekday = 7
	}
	day := statsDayStart(t)
	return day.AddDate(0, 0, -(weekday - 1))
}

func statsDayStart(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
}

func statsMonthStart(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC)
}

func statsISOWeekLabel(t time.Time) string {
	year, week := statsStartOfWeek(t).ISOWeek()
	return fmt.Sprintf("%04d-W%02d", year, week)
}

func statsVolumeChange(current, previous float64) float64 {
	if previous == 0 {
		if current == 0 {
			return 0
		}
		return 100
	}
	return (current - previous) / previous * 100
}

func minInt(left, right int) int {
	if left < right {
		return left
	}
	return right
}

func maxInt(left, right int) int {
	if left > right {
		return left
	}
	return right
}

func statsStringPtr(value string) *string {
	return &value
}

func statsFloatPtr(value float64) *float64 {
	return &value
}

func statsIntPtr(value int) *int {
	return &value
}

func statsTimePtr(value time.Time) *time.Time {
	return &value
}
