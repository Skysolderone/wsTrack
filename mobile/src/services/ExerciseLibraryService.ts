import type { Database } from "@nozbe/watermelondb";
import { Q } from "@nozbe/watermelondb";

import {
  ExerciseCategory,
  Equipment,
  TrackingType,
  type MuscleGroup,
} from "../constants/enums";
import { Exercise, WorkoutExercise, WorkoutSet } from "../models";
import { queueSyncChange, serializeExerciseRecord } from "./SyncService";
import { calculateVolume, estimate1RM } from "../utils";

export interface ExerciseDraft {
  equipment: Equipment;
  name: string;
  nameEn?: string;
  notes?: string;
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  trackingType: TrackingType;
}

export interface ExerciseTrendPoint {
  label: string;
  x: number;
  y: number;
}

export interface ExerciseLatestSummary {
  dateLabel: string;
  totalSets: number;
  volume: number;
}

export interface ExercisePersonalBest {
  estimatedOneRm: number;
  reps: number;
  weight: number;
}

export interface ExerciseHistoryInsights {
  latestSession: ExerciseLatestSummary | null;
  personalBest: ExercisePersonalBest | null;
  trend: ExerciseTrendPoint[];
}

interface SessionSnapshot {
  completedAt: number;
  estimatedOneRm: number;
  label: string;
  reps: number;
  totalSets: number;
  volume: number;
  weight: number;
}

const getDerivedCategory = (
  equipment: Equipment,
  trackingType: TrackingType,
): ExerciseCategory => {
  if (trackingType === TrackingType.Distance) {
    return ExerciseCategory.Cardio;
  }

  if (equipment === Equipment.Bodyweight && trackingType !== TrackingType.WeightReps) {
    return ExerciseCategory.Bodyweight;
  }

  return ExerciseCategory.Strength;
};

export const createCustomExercise = async (
  database: Database,
  draft: ExerciseDraft,
): Promise<string> => {
  const exercisesCollection = database.get<Exercise>("exercises");
  const timestamp = Date.now();

  let createdExerciseId = "";

  await database.write(async () => {
    const record = await exercisesCollection.create((exercise) => {
      exercise.name = draft.name.trim();
      exercise.nameEn = draft.nameEn?.trim() || null;
      exercise.category = getDerivedCategory(draft.equipment, draft.trackingType);
      exercise.primaryMuscles = draft.primaryMuscles;
      exercise.secondaryMuscles = draft.secondaryMuscles.filter(
        (muscle) => !draft.primaryMuscles.includes(muscle),
      );
      exercise.equipment = draft.equipment;
      exercise.trackingType = draft.trackingType;
      exercise.unitPreference = null;
      exercise.isCustom = true;
      exercise.isArchived = false;
      exercise.notes = draft.notes?.trim() || null;
      exercise.sortOrder = timestamp;
      exercise.createdAt = timestamp;
      exercise.updatedAt = timestamp;
    });

    await queueSyncChange({
      action: "create",
      payload: serializeExerciseRecord(record),
      recordId: record.id,
      table: "exercises",
    });

    createdExerciseId = record.id;
  });

  return createdExerciseId;
};

export const updateCustomExercise = async (
  database: Database,
  exerciseId: string,
  draft: ExerciseDraft,
): Promise<void> => {
  const exercise = await database.get<Exercise>("exercises").find(exerciseId);

  await database.write(async () => {
    const updatedAt = Date.now();
    await exercise.update((record) => {
      record.name = draft.name.trim();
      record.nameEn = draft.nameEn?.trim() || null;
      record.category = getDerivedCategory(draft.equipment, draft.trackingType);
      record.primaryMuscles = draft.primaryMuscles;
      record.secondaryMuscles = draft.secondaryMuscles.filter(
        (muscle) => !draft.primaryMuscles.includes(muscle),
      );
      record.equipment = draft.equipment;
      record.trackingType = draft.trackingType;
      record.notes = draft.notes?.trim() || null;
      record.updatedAt = updatedAt;
    });

    await queueSyncChange({
      action: "update",
      payload: serializeExerciseRecord(exercise),
      recordId: exercise.id,
      table: "exercises",
    });
  });
};

export const updateExerciseNotes = async (
  database: Database,
  exerciseId: string,
  notes: string,
): Promise<void> => {
  const exercise = await database.get<Exercise>("exercises").find(exerciseId);

  await database.write(async () => {
    const updatedAt = Date.now();
    await exercise.update((record) => {
      record.notes = notes.trim() || null;
      record.updatedAt = updatedAt;
    });

    await queueSyncChange({
      action: "update",
      payload: serializeExerciseRecord(exercise),
      recordId: exercise.id,
      table: "exercises",
    });
  });
};

export const loadExerciseInsights = async (
  database: Database,
  exerciseId: string,
): Promise<ExerciseHistoryInsights> => {
  const workoutExercises = await database
    .get<WorkoutExercise>("workout_exercises")
    .query(Q.where("exercise_id", exerciseId))
    .fetch();

  if (workoutExercises.length === 0) {
    return {
      latestSession: null,
      personalBest: null,
      trend: [],
    };
  }

  const sessions = (
    await Promise.all(
      workoutExercises.map(async (workoutExercise) => {
        const workout = await workoutExercise.workout.fetch();
        const sets = await workoutExercise.sets.fetch();

        return buildSessionSnapshot(workout.startedAt, sets);
      }),
    )
  )
    .filter((session): session is SessionSnapshot => session !== null)
    .sort((left, right) => left.completedAt - right.completedAt);

  if (sessions.length === 0) {
    return {
      latestSession: null,
      personalBest: null,
      trend: [],
    };
  }

  const latestSession = sessions[sessions.length - 1];
  if (!latestSession) {
    return {
      latestSession: null,
      personalBest: null,
      trend: [],
    };
  }

  const bestSession = sessions.reduce((currentBest, session) => {
    if (!currentBest || session.estimatedOneRm > currentBest.estimatedOneRm) {
      return session;
    }

    return currentBest;
  }, null as SessionSnapshot | null);

  return {
    latestSession: {
      dateLabel: latestSession.label,
      totalSets: latestSession.totalSets,
      volume: latestSession.volume,
    },
    personalBest: bestSession
      ? {
          estimatedOneRm: bestSession.estimatedOneRm,
          reps: bestSession.reps,
          weight: bestSession.weight,
        }
      : null,
    trend: sessions.map((session, index) => ({
      label: session.label,
      x: index + 1,
      y: session.volume,
    })),
  };
};

const buildSessionSnapshot = (
  startedAt: number,
  sets: WorkoutSet[],
): SessionSnapshot | null => {
  const completedSets = sets.filter((set) => set.isCompleted);

  if (completedSets.length === 0) {
    return null;
  }

  const volume = calculateVolume(
    completedSets.map((set) => ({
      isCompleted: set.isCompleted,
      isWarmup: set.isWarmup,
      reps: set.reps,
      weight: set.weight,
    })),
  );

  const bestSet = completedSets.reduce(
    (currentBest, currentSet) => {
      const weight = currentSet.weight ?? 0;
      const reps = currentSet.reps ?? 0;
      const estimated = weight > 0 && reps > 0 ? estimate1RM(weight, reps, "epley") : 0;

      if (!currentBest || estimated > currentBest.estimatedOneRm) {
        return {
          estimatedOneRm: estimated,
          reps,
          weight,
        };
      }

      return currentBest;
    },
    null as ExercisePersonalBest | null,
  );

  const sessionDate = new Date(startedAt);

  return {
    completedAt: startedAt,
    estimatedOneRm: bestSet?.estimatedOneRm ?? 0,
    label: `${sessionDate.getMonth() + 1}/${sessionDate.getDate()}`,
    reps: bestSet?.reps ?? 0,
    totalSets: completedSets.length,
    volume,
    weight: bestSet?.weight ?? 0,
  };
};
