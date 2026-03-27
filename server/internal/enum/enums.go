package enum

type MuscleGroup string

const (
	MuscleChest      MuscleGroup = "chest"
	MuscleBack       MuscleGroup = "back"
	MuscleShoulder   MuscleGroup = "shoulders"
	MuscleBiceps     MuscleGroup = "biceps"
	MuscleTriceps    MuscleGroup = "triceps"
	MuscleForearms   MuscleGroup = "forearms"
	MuscleAbs        MuscleGroup = "abs"
	MuscleGlutes     MuscleGroup = "glutes"
	MuscleQuads      MuscleGroup = "quads"
	MuscleHamstrings MuscleGroup = "hamstrings"
	MuscleCalves     MuscleGroup = "calves"
	MuscleFullBody   MuscleGroup = "full_body"
)

type Equipment string

const (
	EquipmentBarbell      Equipment = "barbell"
	EquipmentDumbbell     Equipment = "dumbbell"
	EquipmentMachine      Equipment = "machine"
	EquipmentCable        Equipment = "cable"
	EquipmentBodyweight   Equipment = "bodyweight"
	EquipmentBand         Equipment = "band"
	EquipmentKettlebell   Equipment = "kettlebell"
	EquipmentEZBar        Equipment = "ez_bar"
	EquipmentSmithMachine Equipment = "smith_machine"
	EquipmentOther        Equipment = "other"
)

type ExerciseCategory string

const (
	ExerciseCategoryStrength   ExerciseCategory = "strength"
	ExerciseCategoryCardio     ExerciseCategory = "cardio"
	ExerciseCategoryBodyweight ExerciseCategory = "bodyweight"
	ExerciseCategoryStretch    ExerciseCategory = "stretch"
)

type TrackingType string

const (
	TrackingTypeWeightReps TrackingType = "weight_reps"
	TrackingTypeTime       TrackingType = "time"
	TrackingTypeDistance   TrackingType = "distance"
	TrackingTypeRepsOnly   TrackingType = "reps_only"
)

type WeightUnit string

const (
	WeightUnitKG  WeightUnit = "kg"
	WeightUnitLBS WeightUnit = "lbs"
)

type PlanGoal string

const (
	PlanGoalHypertrophy PlanGoal = "hypertrophy"
	PlanGoalStrength    PlanGoal = "strength"
	PlanGoalEndurance   PlanGoal = "endurance"
	PlanGoalGeneral     PlanGoal = "general"
)
