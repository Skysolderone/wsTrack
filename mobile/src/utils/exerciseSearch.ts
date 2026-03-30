import type { Exercise } from "../models";
import { getPinyinInitials } from "./pinyin";

const normalize = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, "");

export const buildExerciseSearchIndex = (exercise: Pick<Exercise, "name" | "nameEn">): string[] => {
  const name = normalize(exercise.name);
  const englishName = normalize(exercise.nameEn ?? "");
  const initials = normalize(getPinyinInitials(exercise.name));

  return [name, englishName, initials].filter(Boolean);
};

export const matchesExerciseSearch = (
  exercise: Pick<Exercise, "name" | "nameEn">,
  searchQuery: string,
): boolean => {
  const query = normalize(searchQuery);

  if (!query) {
    return true;
  }

  return buildExerciseSearchIndex(exercise).some((token) => token.includes(query));
};
