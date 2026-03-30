import { PlanGoal } from "../constants/enums";
import {
  addDayToPlan,
  addExerciseToDay,
  createPlan,
  loadPlanEditorData,
  setActivePlan,
  updatePlanExercise,
} from "./PlanService";

export interface PlanSnapshotExercise {
  exerciseId: string;
  exerciseName: string;
  notes: string | null;
  restSeconds: number | null;
  targetReps: string | null;
  targetSets: number;
  targetWeight: number | null;
}

export interface PlanSnapshotDay {
  exercises: PlanSnapshotExercise[];
  name: string;
}

export interface PlanSnapshot {
  days: PlanSnapshotDay[];
  goal: PlanGoal | null;
  name: string;
}

export const buildPlanSnapshot = async (planId: string): Promise<PlanSnapshot> => {
  const data = await loadPlanEditorData(planId);

  return {
    days: data.days.map((day) => ({
      exercises: day.exercises.map((exercise) => ({
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.exercise.name,
        notes: exercise.notes,
        restSeconds: exercise.restSeconds,
        targetReps: exercise.targetReps,
        targetSets: exercise.targetSets,
        targetWeight: exercise.targetWeight,
      })),
      name: day.name,
    })),
    goal: data.goal,
    name: data.name,
  };
};

export const importPlanSnapshot = async (
  snapshot: PlanSnapshot,
  options?: {
    activate?: boolean;
    nameOverride?: string;
  },
): Promise<string> => {
  const planId = await createPlan(
    options?.nameOverride ?? snapshot.name,
    snapshot.goal ?? PlanGoal.General,
  );

  for (const day of snapshot.days) {
    const dayId = await addDayToPlan(planId, day.name);

    for (const exercise of day.exercises) {
      const planExerciseId = await addExerciseToDay(
        dayId,
        exercise.exerciseId,
        exercise.targetSets,
      );

      await updatePlanExercise(planExerciseId, {
        notes: exercise.notes,
        restSeconds: exercise.restSeconds,
        targetReps: exercise.targetReps,
        targetSets: exercise.targetSets,
        targetWeight: exercise.targetWeight,
      });
    }
  }

  if (options?.activate) {
    await setActivePlan(planId);
  }

  return planId;
};
