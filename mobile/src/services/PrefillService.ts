import { Q } from "@nozbe/watermelondb";

import { WeightUnit } from "../constants/enums";
import { database } from "../database";
import { WorkoutExercise } from "../models";

export interface LastWorkoutSetData {
  isWarmup: boolean;
  reps: number | null;
  rpe: number | null;
  setNumber: number;
  unit: WeightUnit;
  weight: number | null;
}

export interface PrefillSetDraft {
  isWarmup: boolean;
  previousReps: number | null;
  previousWeight: number | null;
  reps: number | null;
  rpe: number | null;
  unit: WeightUnit;
  weight: number | null;
}

interface PrefillOptions {
  defaultUnit: WeightUnit;
  targetReps?: string | null;
  targetSets?: number | null;
  targetWeight?: number | null;
}

const parseTargetReps = (value: string | null | undefined): number | null => {
  if (!value) {
    return null;
  }

  const matched = value.match(/\d+/);
  if (!matched) {
    return null;
  }

  const parsed = Number.parseInt(matched[0], 10);
  return Number.isFinite(parsed) ? parsed : null;
};

export const getLastWorkoutData = async (
  exerciseId: string,
): Promise<LastWorkoutSetData[]> => {
  const workoutExercises = await database
    .get<WorkoutExercise>("workout_exercises")
    .query(Q.where("exercise_id", exerciseId))
    .fetch();

  if (workoutExercises.length === 0) {
    return [];
  }

  const latestWorkoutExercise = (
    await Promise.all(
      workoutExercises.map(async (workoutExercise) => {
        const workout = await workoutExercise.workout.fetch();

        return {
          startedAt: workout.startedAt,
          workoutExercise,
        };
      }),
    )
  )
    .sort((left, right) => right.startedAt - left.startedAt)[0]?.workoutExercise;

  if (!latestWorkoutExercise) {
    return [];
  }

  const sets = await latestWorkoutExercise.sets.fetch();

  return [...sets]
    .sort((left, right) => left.setNumber - right.setNumber)
    .map((set) => ({
      isWarmup: set.isWarmup,
      reps: set.reps,
      rpe: set.rpe,
      setNumber: set.setNumber,
      unit: set.unit,
      weight: set.weight,
    }));
};

export const buildPrefilledSets = async (
  exerciseId: string,
  options: PrefillOptions,
): Promise<PrefillSetDraft[]> => {
  const lastWorkoutSets = await getLastWorkoutData(exerciseId);
  const targetReps = parseTargetReps(options.targetReps);
  const targetSets = Math.max(options.targetSets ?? 0, 0);
  const fallbackCount = Math.max(lastWorkoutSets.length, targetSets, 1);

  return Array.from({ length: fallbackCount }, (_, index) => {
    const lastSet = lastWorkoutSets[index] ?? lastWorkoutSets[lastWorkoutSets.length - 1] ?? null;
    const fallbackWeight = lastSet?.weight ?? options.targetWeight ?? null;
    const fallbackReps = lastSet?.reps ?? targetReps;

    return {
      isWarmup: lastSet?.isWarmup ?? false,
      previousReps: lastSet?.reps ?? targetReps,
      previousWeight: lastSet?.weight ?? options.targetWeight ?? null,
      reps: fallbackReps,
      rpe: lastSet?.rpe ?? null,
      unit: lastSet?.unit ?? options.defaultUnit,
      weight: fallbackWeight,
    };
  });
};
