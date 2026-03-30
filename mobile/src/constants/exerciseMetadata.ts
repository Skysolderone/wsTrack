import {
  Equipment,
  ExerciseCategory,
  MuscleGroup,
  TrackingType,
} from "./enums";

export type SupportedLanguage = "zh" | "en";

type LocalizedMap<T extends string> = Record<T, { zh: string; en: string }>;

export const muscleGroupLabels: LocalizedMap<MuscleGroup> = {
  [MuscleGroup.Chest]: { zh: "胸部", en: "Chest" },
  [MuscleGroup.Back]: { zh: "背部", en: "Back" },
  [MuscleGroup.Shoulders]: { zh: "肩部", en: "Shoulders" },
  [MuscleGroup.Biceps]: { zh: "肱二头", en: "Biceps" },
  [MuscleGroup.Triceps]: { zh: "肱三头", en: "Triceps" },
  [MuscleGroup.Forearms]: { zh: "前臂", en: "Forearms" },
  [MuscleGroup.Abs]: { zh: "腹部", en: "Abs" },
  [MuscleGroup.Glutes]: { zh: "臀部", en: "Glutes" },
  [MuscleGroup.Quads]: { zh: "股四头", en: "Quads" },
  [MuscleGroup.Hamstrings]: { zh: "腘绳肌", en: "Hamstrings" },
  [MuscleGroup.Calves]: { zh: "小腿", en: "Calves" },
  [MuscleGroup.FullBody]: { zh: "全身", en: "Full Body" },
};

export const equipmentLabels: LocalizedMap<Equipment> = {
  [Equipment.Barbell]: { zh: "杠铃", en: "Barbell" },
  [Equipment.Dumbbell]: { zh: "哑铃", en: "Dumbbell" },
  [Equipment.Machine]: { zh: "器械", en: "Machine" },
  [Equipment.Cable]: { zh: "拉索", en: "Cable" },
  [Equipment.Bodyweight]: { zh: "自重", en: "Bodyweight" },
  [Equipment.Band]: { zh: "弹力带", en: "Band" },
  [Equipment.Kettlebell]: { zh: "壶铃", en: "Kettlebell" },
  [Equipment.EzBar]: { zh: "EZ 杠", en: "EZ Bar" },
  [Equipment.SmithMachine]: { zh: "史密斯机", en: "Smith Machine" },
  [Equipment.Other]: { zh: "其他", en: "Other" },
};

export const categoryLabels: LocalizedMap<ExerciseCategory> = {
  [ExerciseCategory.Strength]: { zh: "力量", en: "Strength" },
  [ExerciseCategory.Cardio]: { zh: "有氧", en: "Cardio" },
  [ExerciseCategory.Bodyweight]: { zh: "自重", en: "Bodyweight" },
  [ExerciseCategory.Stretch]: { zh: "拉伸", en: "Stretch" },
};

export const trackingTypeLabels: LocalizedMap<TrackingType> = {
  [TrackingType.WeightReps]: { zh: "重量 + 次数", en: "Weight + Reps" },
  [TrackingType.Time]: { zh: "时长", en: "Time" },
  [TrackingType.Distance]: { zh: "距离", en: "Distance" },
  [TrackingType.RepsOnly]: { zh: "仅次数", en: "Reps Only" },
};

export const getLocalizedValue = <T extends string>(
  map: LocalizedMap<T>,
  key: T,
  language: SupportedLanguage,
): string => map[key][language];

export const allMuscleGroups = Object.values(MuscleGroup);
export const allEquipmentTypes = Object.values(Equipment);
export const allExerciseCategories = Object.values(ExerciseCategory);
export const allTrackingTypes = Object.values(TrackingType);
