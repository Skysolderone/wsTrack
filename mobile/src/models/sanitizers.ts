import { MuscleGroup } from "../constants/enums";

const muscleGroupValues = new Set<string>(Object.values(MuscleGroup));

const sanitizeStringArray = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
};

export const sanitizeMuscleGroups = (raw: unknown): MuscleGroup[] =>
  sanitizeStringArray(raw).filter((value): value is MuscleGroup => muscleGroupValues.has(value));
