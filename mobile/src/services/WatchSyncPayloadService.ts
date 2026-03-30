import { Q } from "@nozbe/watermelondb";

import { database } from "../database";
import { Plan, PlanDay, PlanExercise } from "../models";
import { loadWorkoutDetail } from "./HistoryService";

export interface WatchPlanSetPayload {
  reps: number | null;
  restSeconds: number;
  setNumber: number;
  targetWeight: number | null;
}

export interface WatchPlanExercisePayload {
  exerciseId: string;
  name: string;
  restSeconds: number;
  sets: WatchPlanSetPayload[];
  trackingType: string;
}

export interface WatchPlanDayPayload {
  dayId: string;
  exercises: WatchPlanExercisePayload[];
  name: string;
  planId: string;
  planName: string;
}

export interface WatchPlanSyncPayload {
  generatedAt: number;
  type: "plan_sync";
  version: number;
  workoutDays: WatchPlanDayPayload[];
}

export interface WatchWorkoutResultPayload {
  finishedAt: number;
  type: "workout_result";
  workoutId: string;
  workoutName: string;
  exercises: Array<{
    exerciseId: string;
    name: string;
    sets: Array<{
      isCompleted: boolean;
      isPr: boolean;
      reps: number | null;
      rpe: number | null;
      setNumber: number;
      unit: string;
      weight: number | null;
    }>;
  }>;
}

const DEFAULT_REST_SECONDS = 90;

const parseTargetReps = (targetReps: string | null): number | null => {
  if (!targetReps) {
    return null;
  }

  const candidates = targetReps
    .split("-")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (candidates.length === 0) {
    return null;
  }

  return Math.max(...candidates);
};

const buildExercisePayload = async (
  planExercise: PlanExercise,
): Promise<WatchPlanExercisePayload> => {
  const exercise = await planExercise.exercise.fetch();
  const restSeconds = planExercise.restSeconds ?? DEFAULT_REST_SECONDS;
  const setCount = Math.max(1, planExercise.targetSets);
  const targetReps = parseTargetReps(planExercise.targetReps);

  return {
    exerciseId: exercise.id,
    name: exercise.name,
    restSeconds,
    sets: Array.from({ length: setCount }, (_, index) => ({
      reps: targetReps,
      restSeconds,
      setNumber: index + 1,
      targetWeight: planExercise.targetWeight,
    })),
    trackingType: exercise.trackingType,
  };
};

const buildPlanDayPayload = async (
  plan: Plan,
  day: PlanDay,
): Promise<WatchPlanDayPayload> => {
  const exercises = (await day.exercises.fetch()).sort(
    (left, right) => left.sortOrder - right.sortOrder,
  );

  return {
    dayId: day.id,
    exercises: await Promise.all(exercises.map((item) => buildExercisePayload(item))),
    name: day.name,
    planId: plan.id,
    planName: plan.name,
  };
};

export const buildWatchPlanSyncPayload = async (): Promise<WatchPlanSyncPayload> => {
  const activePlan = (
    await database
      .get<Plan>("plans")
      .query(Q.where("is_active", true), Q.where("is_archived", false))
      .fetch()
  )[0];

  if (!activePlan) {
    return {
      generatedAt: Date.now(),
      type: "plan_sync",
      version: 1,
      workoutDays: [],
    };
  }

  const days = (await activePlan.days.fetch()).sort(
    (left, right) => left.sortOrder - right.sortOrder,
  );

  return {
    generatedAt: Date.now(),
    type: "plan_sync",
    version: 1,
    workoutDays: await Promise.all(days.map((day) => buildPlanDayPayload(activePlan, day))),
  };
};

export const buildWatchWorkoutResultPayload = async (
  workoutId: string,
): Promise<WatchWorkoutResultPayload> => {
  const detail = await loadWorkoutDetail(workoutId);

  return {
    exercises: detail.exercises.map((exercise) => ({
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      sets: exercise.sets.map((set) => ({
        isCompleted: set.isCompleted,
        isPr: set.isPr,
        reps: set.reps,
        rpe: set.rpe,
        setNumber: set.setNumber,
        unit: set.unit,
        weight: set.weight,
      })),
    })),
    finishedAt: Date.now(),
    type: "workout_result",
    workoutId: detail.workoutId,
    workoutName: detail.title,
  };
};
