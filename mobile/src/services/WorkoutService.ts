import { Q } from "@nozbe/watermelondb";

import { PlanGoal, WeightUnit } from "../constants/enums";
import { database } from "../database";
import {
  Exercise,
  Plan,
  PlanDay,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from "../models";
import {
  queueSyncChange,
  serializeWorkoutExerciseRecord,
  serializeWorkoutRecord,
  serializeWorkoutSetRecord,
} from "./SyncService";
import { calculateVolume } from "../utils";
import { buildPrefilledSets } from "./PrefillService";

export interface WorkoutTemplateSet {
  isWarmup: boolean;
  previousReps: number | null;
  previousWeight: number | null;
  reps: number | null;
  rpe: number | null;
  unit: WeightUnit;
  weight: number | null;
}

export interface WorkoutTemplateExercise {
  exerciseId: string;
  exerciseName: string;
  restSeconds: number;
  sets: WorkoutTemplateSet[];
  sortOrder: number;
}

export interface WorkoutStartPlanDayOption {
  exerciseCount: number;
  id: string;
  lastUsedAt: number | null;
  name: string;
  planGoal: PlanGoal | null;
  planName: string;
}

export interface RecentWorkoutOption {
  exerciseCount: number;
  planDayId?: string;
  startedAt: number;
  title: string;
  totalSets: number;
  totalVolume: number;
  workoutId: string;
}

export interface WorkoutStartOptions {
  activePlanDays: WorkoutStartPlanDayOption[];
  activePlanName: string | null;
  recentWorkouts: RecentWorkoutOption[];
}

export interface WorkoutSessionSnapshot {
  exercises: WorkoutSessionExerciseSnapshot[];
  planDayId?: string;
  startedAt: number;
  workoutId: string;
}

export interface WorkoutSessionExerciseSnapshot {
  exerciseId: string;
  exerciseName: string;
  restSeconds: number;
  sets: WorkoutSessionSetSnapshot[];
  volume: number;
  workoutExerciseId: string;
}

export interface WorkoutSessionSetSnapshot {
  isCompleted: boolean;
  isPr: boolean;
  isWarmup: boolean;
  previousReps: number | null;
  previousWeight: number | null;
  reps: number | null;
  rpe: number | null;
  setNumber: number;
  unit: WeightUnit;
  weight: number | null;
  workoutSetId: string;
}

export interface WorkoutSummaryData {
  dateLabel: string;
  durationSeconds: number;
  exerciseCount: number;
  notes: string;
  prItems: string[];
  rating: number | null;
  title: string;
  totalSets: number;
  totalVolume: number;
  workoutId: string;
}

const DEFAULT_REST_SECONDS = 90;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const formatSummaryDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");

  return `${date.getFullYear()}/${month}/${day} ${hour}:${minute}`;
};

const buildSessionSetSnapshot = (
  setId: string,
  setNumber: number,
  input: WorkoutTemplateSet,
): WorkoutSessionSetSnapshot => ({
  isCompleted: false,
  isPr: false,
  isWarmup: input.isWarmup,
  previousReps: input.previousReps,
  previousWeight: input.previousWeight,
  reps: input.reps,
  rpe: input.rpe,
  setNumber,
  unit: input.unit,
  weight: input.weight,
  workoutSetId: setId,
});

const resolveWorkoutTitle = async (workout: Workout): Promise<string> => {
  if (workout.planDayId) {
    const planDay = await workout.planDay.fetch();
    return planDay.name;
  }

  const exercises = await workout.exercises.fetch();
  if (exercises.length === 0) {
    return "空白训练";
  }

  const firstExercise = exercises.sort((left, right) => left.sortOrder - right.sortOrder)[0];
  if (!firstExercise) {
    return "空白训练";
  }

  const exercise = await firstExercise.exercise.fetch();
  return `${exercise.name} 等`;
};

const loadPlanDayLastUsedAt = async (day: PlanDay): Promise<number | null> => {
  const workouts = await day.workouts.fetch();
  if (workouts.length === 0) {
    return null;
  }

  return workouts.reduce((latest, workout) => Math.max(latest, workout.startedAt), 0);
};

const calculateExerciseVolume = (sets: WorkoutSessionSetSnapshot[]): number =>
  calculateVolume(
    sets.map((set) => ({
      isCompleted: set.isCompleted,
      isWarmup: set.isWarmup,
      reps: set.reps,
      weight: set.weight,
    })),
  );

const calculateTotalSets = (exercises: WorkoutSessionExerciseSnapshot[]): number =>
  exercises.reduce(
    (total, exercise) => total + exercise.sets.filter((set) => set.isCompleted).length,
    0,
  );

const calculateTotalVolume = (exercises: WorkoutSessionExerciseSnapshot[]): number =>
  Number(exercises.reduce((total, exercise) => total + exercise.volume, 0).toFixed(2));

export const loadWorkoutStartOptions = async (): Promise<WorkoutStartOptions> => {
  const activePlan = (
    await database
      .get<Plan>("plans")
      .query(Q.where("is_active", true), Q.where("is_archived", false))
      .fetch()
  )[0] ?? null;

  const activePlanDays = activePlan
    ? await Promise.all(
        (await activePlan.days.fetch())
          .sort((left, right) => left.sortOrder - right.sortOrder)
          .map(async (day) => ({
            exerciseCount: (await day.exercises.fetch()).length,
            id: day.id,
            lastUsedAt: await loadPlanDayLastUsedAt(day),
            name: day.name,
            planGoal: activePlan.goal,
            planName: activePlan.name,
          })),
      )
    : [];

  const recentWorkouts = (
    await database
      .get<Workout>("workouts")
      .query(Q.sortBy("started_at", Q.desc))
      .fetch()
  )
    .filter(
      (workout) =>
        workout.finishedAt !== null && workout.startedAt >= Date.now() - SEVEN_DAYS_MS,
    )
    .slice(0, 7);

  return {
    activePlanDays,
    activePlanName: activePlan?.name ?? null,
    recentWorkouts: await Promise.all(
      recentWorkouts.map(async (workout) => ({
        exerciseCount: (await workout.exercises.fetch()).length,
        planDayId: workout.planDayId ?? undefined,
        startedAt: workout.startedAt,
        title: await resolveWorkoutTitle(workout),
        totalSets: workout.totalSets,
        totalVolume: workout.totalVolume,
        workoutId: workout.id,
      })),
    ),
  };
};

export const buildPlanWorkoutTemplate = async (
  planDayId: string,
  defaultUnit: WeightUnit,
): Promise<{
  exercises: WorkoutTemplateExercise[];
  planDayId: string;
}> => {
  const day = await database.get<PlanDay>("plan_days").find(planDayId);
  const planExercises = (await day.exercises.fetch()).sort(
    (left, right) => left.sortOrder - right.sortOrder,
  );

  const exercises = await Promise.all(
    planExercises.map(async (planExercise) => {
      const exercise = await planExercise.exercise.fetch();
      const sets = await buildPrefilledSets(exercise.id, {
        defaultUnit,
        targetReps: planExercise.targetReps,
        targetSets: planExercise.targetSets,
        targetWeight: planExercise.targetWeight,
      });

      return {
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        restSeconds: planExercise.restSeconds ?? DEFAULT_REST_SECONDS,
        sets,
        sortOrder: planExercise.sortOrder,
      };
    }),
  );

  return {
    exercises,
    planDayId,
  };
};

export const buildRepeatWorkoutTemplate = async (
  sourceWorkoutId: string,
  defaultUnit: WeightUnit,
): Promise<{
  exercises: WorkoutTemplateExercise[];
  planDayId?: string;
}> => {
  const workout = await database.get<Workout>("workouts").find(sourceWorkoutId);
  const workoutExercises = (await workout.exercises.fetch()).sort(
    (left, right) => left.sortOrder - right.sortOrder,
  );

  const exercises = await Promise.all(
    workoutExercises.map(async (workoutExercise) => {
      const exercise = await workoutExercise.exercise.fetch();
      const sets = (await workoutExercise.sets.fetch())
        .sort((left, right) => left.setNumber - right.setNumber)
        .map((set) => ({
          isWarmup: set.isWarmup,
          previousReps: set.reps,
          previousWeight: set.weight,
          reps: set.reps,
          rpe: set.rpe,
          unit: set.unit,
          weight: set.weight,
        }));

      return {
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        restSeconds: DEFAULT_REST_SECONDS,
        sets: sets.length > 0
          ? sets
          : [
              {
                isWarmup: false,
                previousReps: null,
                previousWeight: null,
                reps: null,
                rpe: null,
                unit: defaultUnit,
                weight: null,
              },
            ],
        sortOrder: workoutExercise.sortOrder,
      };
    }),
  );

  return {
    exercises,
    planDayId: workout.planDayId ?? undefined,
  };
};

export const createWorkoutSession = async (input: {
  exercises: WorkoutTemplateExercise[];
  planDayId?: string;
  startedAt: number;
}): Promise<WorkoutSessionSnapshot> => {
  const workoutCollection = database.get<Workout>("workouts");
  const workoutExerciseCollection = database.get<WorkoutExercise>("workout_exercises");
  const workoutSetCollection = database.get<WorkoutSet>("workout_sets");

  let snapshot: WorkoutSessionSnapshot | null = null;

  await database.write(async () => {
    const timestamp = input.startedAt;
    const workout = await workoutCollection.create((record) => {
      record.planDayId = input.planDayId ?? null;
      record.startedAt = input.startedAt;
      record.finishedAt = null;
      record.durationSeconds = 0;
      record.totalVolume = 0;
      record.totalSets = 0;
      record.rating = null;
      record.notes = null;
      record.updatedAt = timestamp;
    });

    const exercises = await Promise.all(
      input.exercises.map(async (exerciseInput, exerciseIndex) => {
        const workoutExercise = await workoutExerciseCollection.create((record) => {
          record.workoutId = workout.id;
          record.exerciseId = exerciseInput.exerciseId;
          record.sortOrder = exerciseInput.sortOrder ?? exerciseIndex;
          record.volume = 0;
          record.notes = null;
          record.updatedAt = timestamp;
        });

        const sets = await Promise.all(
          exerciseInput.sets.map(async (setInput, setIndex) => {
            const workoutSet = await workoutSetCollection.create((record) => {
              record.workoutExerciseId = workoutExercise.id;
              record.setNumber = setIndex + 1;
              record.weight = setInput.weight;
              record.reps = setInput.reps;
              record.durationSeconds = null;
              record.distance = null;
              record.rpe = setInput.rpe;
              record.isWarmup = setInput.isWarmup;
              record.isCompleted = false;
              record.restSeconds = null;
              record.isPr = false;
              record.unit = setInput.unit;
              record.completedAt = null;
              record.updatedAt = timestamp;
            });

            await queueSyncChange({
              action: "create",
              payload: serializeWorkoutSetRecord(workoutSet),
              recordId: workoutSet.id,
              table: "workout_sets",
            });

            return buildSessionSetSnapshot(workoutSet.id, setIndex + 1, setInput);
          }),
        );

        await queueSyncChange({
          action: "create",
          payload: serializeWorkoutExerciseRecord(workoutExercise),
          recordId: workoutExercise.id,
          table: "workout_exercises",
        });

        return {
          exerciseId: exerciseInput.exerciseId,
          exerciseName: exerciseInput.exerciseName,
          restSeconds: exerciseInput.restSeconds,
          sets,
          volume: 0,
          workoutExerciseId: workoutExercise.id,
        };
      }),
    );

    await queueSyncChange({
      action: "create",
      payload: serializeWorkoutRecord(workout),
      recordId: workout.id,
      table: "workouts",
    });

    snapshot = {
      exercises,
      planDayId: input.planDayId,
      startedAt: input.startedAt,
      workoutId: workout.id,
    };
  });

  if (!snapshot) {
    throw new Error("Failed to create workout session");
  }

  return snapshot;
};

export const addExerciseToWorkoutSession = async (input: {
  defaultUnit: WeightUnit;
  exerciseId: string;
  workoutId: string;
}): Promise<WorkoutSessionExerciseSnapshot> => {
  const exercise = await database.get<Exercise>("exercises").find(input.exerciseId);
  const existingExercises = await database
    .get<WorkoutExercise>("workout_exercises")
    .query(Q.where("workout_id", input.workoutId), Q.sortBy("sort_order", Q.desc))
    .fetch();
  const nextSortOrder = (existingExercises[0]?.sortOrder ?? -1) + 1;
  const prefills = await buildPrefilledSets(input.exerciseId, {
    defaultUnit: input.defaultUnit,
    targetSets: 1,
  });

  let snapshot: WorkoutSessionExerciseSnapshot | null = null;

  await database.write(async () => {
    const timestamp = Date.now();
    const workoutExercise = await database
      .get<WorkoutExercise>("workout_exercises")
      .create((record) => {
        record.workoutId = input.workoutId;
        record.exerciseId = input.exerciseId;
        record.sortOrder = nextSortOrder;
        record.volume = 0;
        record.notes = null;
        record.updatedAt = timestamp;
      });

    const sets = await Promise.all(
      prefills.map(async (prefill, index) => {
        const workoutSet = await database.get<WorkoutSet>("workout_sets").create((record) => {
          record.workoutExerciseId = workoutExercise.id;
          record.setNumber = index + 1;
          record.weight = prefill.weight;
          record.reps = prefill.reps;
          record.durationSeconds = null;
          record.distance = null;
          record.rpe = prefill.rpe;
          record.isWarmup = prefill.isWarmup;
          record.isCompleted = false;
          record.restSeconds = null;
          record.isPr = false;
          record.unit = prefill.unit;
          record.completedAt = null;
          record.updatedAt = timestamp;
        });

        await queueSyncChange({
          action: "create",
          payload: serializeWorkoutSetRecord(workoutSet),
          recordId: workoutSet.id,
          table: "workout_sets",
        });

        return buildSessionSetSnapshot(workoutSet.id, index + 1, prefill);
      }),
    );

    await queueSyncChange({
      action: "create",
      payload: serializeWorkoutExerciseRecord(workoutExercise),
      recordId: workoutExercise.id,
      table: "workout_exercises",
    });

    snapshot = {
      exerciseId: input.exerciseId,
      exerciseName: exercise.name,
      restSeconds: DEFAULT_REST_SECONDS,
      sets,
      volume: 0,
      workoutExerciseId: workoutExercise.id,
    };
  });

  if (!snapshot) {
    throw new Error("Failed to add exercise");
  }

  return snapshot;
};

export const addSetToWorkoutExercise = async (input: {
  previousReps: number | null;
  previousWeight: number | null;
  reps: number | null;
  rpe: number | null;
  unit: WeightUnit;
  weight: number | null;
  workoutExerciseId: string;
}): Promise<WorkoutSessionSetSnapshot> => {
  const existingSets = await database
    .get<WorkoutSet>("workout_sets")
    .query(Q.where("workout_exercise_id", input.workoutExerciseId), Q.sortBy("set_number", Q.desc))
    .fetch();
  const nextSetNumber = (existingSets[0]?.setNumber ?? 0) + 1;

  let snapshot: WorkoutSessionSetSnapshot | null = null;

  await database.write(async () => {
    const timestamp = Date.now();
    const workoutSet = await database.get<WorkoutSet>("workout_sets").create((record) => {
      record.workoutExerciseId = input.workoutExerciseId;
      record.setNumber = nextSetNumber;
      record.weight = input.weight;
      record.reps = input.reps;
      record.durationSeconds = null;
      record.distance = null;
      record.rpe = input.rpe;
      record.isWarmup = false;
      record.isCompleted = false;
      record.restSeconds = null;
      record.isPr = false;
      record.unit = input.unit;
      record.completedAt = null;
      record.updatedAt = timestamp;
    });

    await queueSyncChange({
      action: "create",
      payload: serializeWorkoutSetRecord(workoutSet),
      recordId: workoutSet.id,
      table: "workout_sets",
    });

    snapshot = {
      isCompleted: false,
      isPr: false,
      isWarmup: false,
      previousReps: input.previousReps,
      previousWeight: input.previousWeight,
      reps: input.reps,
      rpe: input.rpe,
      setNumber: nextSetNumber,
      unit: input.unit,
      weight: input.weight,
      workoutSetId: workoutSet.id,
    };
  });

  if (!snapshot) {
    throw new Error("Failed to add set");
  }

  return snapshot;
};

export const updateWorkoutSetRecord = async (
  workoutSetId: string,
  updates: Partial<{
    completedAt: number | null;
    isCompleted: boolean;
    isWarmup: boolean;
    reps: number | null;
    restSeconds: number | null;
    rpe: number | null;
    unit: WeightUnit;
    weight: number | null;
  }>,
): Promise<void> => {
  const workoutSet = await database.get<WorkoutSet>("workout_sets").find(workoutSetId);

  await database.write(async () => {
    const updatedAt = Date.now();
    await workoutSet.update((record) => {
      if (updates.weight !== undefined) {
        record.weight = updates.weight;
      }
      if (updates.reps !== undefined) {
        record.reps = updates.reps;
      }
      if (updates.rpe !== undefined) {
        record.rpe = updates.rpe;
      }
      if (updates.isWarmup !== undefined) {
        record.isWarmup = updates.isWarmup;
      }
      if (updates.isCompleted !== undefined) {
        record.isCompleted = updates.isCompleted;
      }
      if (updates.restSeconds !== undefined) {
        record.restSeconds = updates.restSeconds;
      }
      if (updates.unit !== undefined) {
        record.unit = updates.unit;
      }
      if (updates.completedAt !== undefined) {
        record.completedAt = updates.completedAt;
      }

      record.updatedAt = updatedAt;
    });

    await queueSyncChange({
      action: "update",
      payload: serializeWorkoutSetRecord(workoutSet),
      recordId: workoutSet.id,
      table: "workout_sets",
    });
  });
};

export const removeWorkoutSetRecord = async (workoutSetId: string): Promise<void> => {
  const workoutSet = await database.get<WorkoutSet>("workout_sets").find(workoutSetId);
  const workoutExerciseId = workoutSet.workoutExerciseId;

  await database.write(async () => {
    const deletedAt = Date.now();
    const deletedPayload = {
      ...serializeWorkoutSetRecord(workoutSet),
      updated_at: deletedAt,
    };
    await workoutSet.markAsDeleted();
    await queueSyncChange({
      action: "delete",
      payload: deletedPayload,
      recordId: workoutSet.id,
      table: "workout_sets",
    });

    const remainingSets = await database
      .get<WorkoutSet>("workout_sets")
      .query(Q.where("workout_exercise_id", workoutExerciseId), Q.sortBy("set_number", Q.asc))
      .fetch();

    for (const [index, set] of remainingSets.entries()) {
      await set.update((record) => {
        record.setNumber = index + 1;
        record.updatedAt = deletedAt;
      });

      await queueSyncChange({
        action: "update",
        payload: serializeWorkoutSetRecord(set),
        recordId: set.id,
        table: "workout_sets",
      });
    }
  });
};

export const removeWorkoutExerciseRecord = async (workoutExerciseId: string): Promise<void> => {
  const workoutExercise = await database
    .get<WorkoutExercise>("workout_exercises")
    .find(workoutExerciseId);
  const workoutId = workoutExercise.workoutId;
  const sets = await workoutExercise.sets.fetch();

  await database.write(async () => {
    const deletedAt = Date.now();
    for (const set of sets) {
      const payload = {
        ...serializeWorkoutSetRecord(set),
        updated_at: deletedAt,
      };
      await set.markAsDeleted();
      await queueSyncChange({
        action: "delete",
        payload,
        recordId: set.id,
        table: "workout_sets",
      });
    }

    const exercisePayload = {
      ...serializeWorkoutExerciseRecord(workoutExercise),
      updated_at: deletedAt,
    };
    await workoutExercise.markAsDeleted();
    await queueSyncChange({
      action: "delete",
      payload: exercisePayload,
      recordId: workoutExercise.id,
      table: "workout_exercises",
    });

    const remainingExercises = await database
      .get<WorkoutExercise>("workout_exercises")
      .query(Q.where("workout_id", workoutId), Q.sortBy("sort_order", Q.asc))
      .fetch();

    for (const [index, record] of remainingExercises.entries()) {
      await record.update((next) => {
        next.sortOrder = index;
        next.updatedAt = deletedAt;
      });

      await queueSyncChange({
        action: "update",
        payload: serializeWorkoutExerciseRecord(record),
        recordId: record.id,
        table: "workout_exercises",
      });
    }
  });
};

export const reorderWorkoutExercises = async (
  workoutId: string,
  orderedIds: string[],
): Promise<void> => {
  const exercises = await Promise.all(
    orderedIds.map((id) => database.get<WorkoutExercise>("workout_exercises").find(id)),
  );

  await database.write(async () => {
    const updatedAt = Date.now();
    for (const [index, exercise] of exercises.entries()) {
      await exercise.update((record) => {
        record.sortOrder = index;
        record.updatedAt = updatedAt;
      });

      await queueSyncChange({
        action: "update",
        payload: serializeWorkoutExerciseRecord(exercise),
        recordId: exercise.id,
        table: "workout_exercises",
      });
    }
  });

  await recalculateWorkoutTotals(workoutId);
};

export const recalculateWorkoutTotals = async (workoutId: string): Promise<void> => {
  const workout = await database.get<Workout>("workouts").find(workoutId);
  const workoutExercises = (await workout.exercises.fetch()).sort(
    (left, right) => left.sortOrder - right.sortOrder,
  );

  const exerciseStats = await Promise.all(
    workoutExercises.map(async (exercise) => {
      const sets = await exercise.sets.fetch();
      const volume = calculateVolume(
        sets.map((set) => ({
          isCompleted: set.isCompleted,
          isWarmup: set.isWarmup,
          reps: set.reps,
          weight: set.weight,
        })),
      );
      const totalSets = sets.filter((set) => set.isCompleted).length;

      return {
        exercise,
        totalSets,
        volume,
      };
    }),
  );

  await database.write(async () => {
    const updatedAt = Date.now();
    for (const stat of exerciseStats) {
      await stat.exercise.update((record) => {
        record.volume = stat.volume;
        record.updatedAt = updatedAt;
      });

      await queueSyncChange({
        action: "update",
        payload: serializeWorkoutExerciseRecord(stat.exercise),
        recordId: stat.exercise.id,
        table: "workout_exercises",
      });
    }

    await workout.update((record) => {
      record.totalSets = exerciseStats.reduce((sum, stat) => sum + stat.totalSets, 0);
      record.totalVolume = Number(
        exerciseStats.reduce((sum, stat) => sum + stat.volume, 0).toFixed(2),
      );
      record.updatedAt = updatedAt;
    });

    await queueSyncChange({
      action: "update",
      payload: serializeWorkoutRecord(workout),
      recordId: workout.id,
      table: "workouts",
    });
  });
};

export const finalizeWorkoutSession = async (input: {
  activeExercises: WorkoutSessionExerciseSnapshot[];
  startedAt: number;
  workoutId: string;
}): Promise<void> => {
  const workout = await database.get<Workout>("workouts").find(input.workoutId);
  const finishedAt = Date.now();
  const completedExercises = input.activeExercises.map((exercise) => ({
    ...exercise,
    volume: calculateExerciseVolume(exercise.sets),
  }));

  await database.write(async () => {
    for (const exercise of completedExercises) {
      const workoutExercise = await database
        .get<WorkoutExercise>("workout_exercises")
        .find(exercise.workoutExerciseId);

      await workoutExercise.update((record) => {
        record.volume = exercise.volume;
        record.updatedAt = finishedAt;
      });

      await queueSyncChange({
        action: "update",
        payload: serializeWorkoutExerciseRecord(workoutExercise),
        recordId: workoutExercise.id,
        table: "workout_exercises",
      });
    }

    await workout.update((record) => {
      record.finishedAt = finishedAt;
      record.durationSeconds = Math.max(
        0,
        Math.floor((finishedAt - input.startedAt) / 1000),
      );
      record.totalSets = calculateTotalSets(completedExercises);
      record.totalVolume = calculateTotalVolume(completedExercises);
      record.updatedAt = finishedAt;
    });

    await queueSyncChange({
      action: "update",
      payload: serializeWorkoutRecord(workout),
      recordId: workout.id,
      table: "workouts",
    });
  });
};

export const loadWorkoutSummary = async (workoutId: string): Promise<WorkoutSummaryData> => {
  const workout = await database.get<Workout>("workouts").find(workoutId);
  const title = await resolveWorkoutTitle(workout);
  const workoutExercises = (await workout.exercises.fetch()).sort(
    (left, right) => left.sortOrder - right.sortOrder,
  );

  const prItems = (
    await Promise.all(
      workoutExercises.map(async (workoutExercise) => {
        const exercise = await workoutExercise.exercise.fetch();
        const sets = (await workoutExercise.sets.fetch())
          .sort((left, right) => left.setNumber - right.setNumber)
          .filter((set) => set.isPr);

        return sets.map((set) => {
          const weight = set.weight ?? 0;
          const reps = set.reps ?? 0;
          return `${exercise.name} · ${weight}${set.unit} x ${reps}`;
        });
      }),
    )
  ).flat();

  return {
    dateLabel: formatSummaryDate(workout.startedAt),
    durationSeconds: workout.durationSeconds,
    exerciseCount: workoutExercises.length,
    notes: workout.notes ?? "",
    prItems,
    rating: workout.rating,
    title,
    totalSets: workout.totalSets,
    totalVolume: workout.totalVolume,
    workoutId: workout.id,
  };
};

export const saveWorkoutSummary = async (
  workoutId: string,
  input: {
    notes: string;
    rating: number | null;
  },
): Promise<void> => {
  const workout = await database.get<Workout>("workouts").find(workoutId);

  await database.write(async () => {
    const updatedAt = Date.now();
    await workout.update((record) => {
      record.notes = input.notes.trim() || null;
      record.rating = input.rating;
      record.updatedAt = updatedAt;
    });

    await queueSyncChange({
      action: "update",
      payload: serializeWorkoutRecord(workout),
      recordId: workout.id,
      table: "workouts",
    });
  });
};
