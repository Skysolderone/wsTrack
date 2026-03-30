export enum MuscleGroup {
  Chest = "chest",
  Back = "back",
  Shoulders = "shoulders",
  Biceps = "biceps",
  Triceps = "triceps",
  Forearms = "forearms",
  Abs = "abs",
  Glutes = "glutes",
  Quads = "quads",
  Hamstrings = "hamstrings",
  Calves = "calves",
  FullBody = "full_body",
}

export enum Equipment {
  Barbell = "barbell",
  Dumbbell = "dumbbell",
  Machine = "machine",
  Cable = "cable",
  Bodyweight = "bodyweight",
  Band = "band",
  Kettlebell = "kettlebell",
  EzBar = "ez_bar",
  SmithMachine = "smith_machine",
  Other = "other",
}

export enum ExerciseCategory {
  Strength = "strength",
  Cardio = "cardio",
  Bodyweight = "bodyweight",
  Stretch = "stretch",
}

export enum TrackingType {
  WeightReps = "weight_reps",
  Time = "time",
  Distance = "distance",
  RepsOnly = "reps_only",
}

export enum WeightUnit {
  KG = "kg",
  LBS = "lbs",
}

export enum PlanGoal {
  Hypertrophy = "hypertrophy",
  Strength = "strength",
  Endurance = "endurance",
  General = "general",
}

export enum PRType {
  MaxWeight = "max_weight",
  MaxVolume = "max_volume",
  Estimated1RM = "estimated_1rm",
}

export enum ChallengeType {
  Volume = "volume",
  Frequency = "frequency",
  TimeSlot = "time_slot",
  CardioDuration = "cardio_duration",
}

export enum CoachClientStatus {
  Active = "active",
  Paused = "paused",
  Terminated = "terminated",
}

export enum SharedPlanDifficulty {
  Beginner = "beginner",
  Intermediate = "intermediate",
  Advanced = "advanced",
}
