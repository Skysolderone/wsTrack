import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { Vibration } from "react-native";

import { WeightUnit } from "../constants/enums";
import { updateProgress, type ChallengeItem } from "../services/ChallengeService";
import { writeWorkout as writeWorkoutToHealthKit } from "../services/HealthKitService";
import { checkForPR, type PRHit } from "../services/PRService";
import { requestSync } from "../services/SyncService";
import { useSettingsStore } from "./settingsStore";
import {
  addExerciseToWorkoutSession,
  addSetToWorkoutExercise,
  buildPlanWorkoutTemplate,
  buildRepeatWorkoutTemplate,
  createWorkoutSession,
  finalizeWorkoutSession,
  recalculateWorkoutTotals,
  removeWorkoutExerciseRecord,
  removeWorkoutSetRecord,
  reorderWorkoutExercises,
  saveWorkoutSummary as persistWorkoutSummary,
  updateWorkoutSetRecord,
  type WorkoutSessionExerciseSnapshot,
} from "../services/WorkoutService";

const ACTIVE_WORKOUT_STORAGE_KEY = "active_workout";
const REST_TICK_INTERVAL_MS = 250;
const ELAPSED_TICK_INTERVAL_MS = 1000;

let elapsedTimer: ReturnType<typeof setInterval> | null = null;
let restTimer: ReturnType<typeof setInterval> | null = null;

export interface PRCelebrationPayload {
  exerciseId: string;
  exerciseName: string;
  records: PRHit[];
  workoutSetId: string;
}

export interface ChallengeCelebrationPayload {
  challenges: ChallengeItem[];
}

export interface ActiveWorkout {
  elapsedSeconds: number;
  exercises: ActiveExercise[];
  isRestTimerActive: boolean;
  planDayId?: string;
  restTimeRemaining: number;
  restTimerDuration: number;
  startedAt: Date;
  totalSets: number;
  totalVolume: number;
  workoutId: string;
}

export interface ActiveExercise {
  exerciseId: string;
  exerciseName: string;
  restSeconds: number;
  sets: ActiveSet[];
  volume: number;
  workoutExerciseId: string;
}

export interface ActiveSet {
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

interface PersistedActiveWorkout {
  activeWorkout: Omit<ActiveWorkout, "startedAt"> & {
    startedAt: string;
  };
  lastCompletedSetId: string | null;
  restTimerSetId: string | null;
  restTimerStartedAt: number | null;
}

interface WorkoutStoreState {
  activeWorkout: ActiveWorkout | null;
  addExercise: (exerciseId: string) => Promise<void>;
  addSet: (workoutExerciseId: string) => Promise<void>;
  adjustRestTimer: (deltaSeconds: number) => Promise<void>;
  challengeCelebration: ChallengeCelebrationPayload | null;
  clearChallengeCelebration: () => void;
  clearPRCelebration: () => void;
  clearWorkoutSummary: () => void;
  completeSet: (setId: string) => Promise<void>;
  discardRecoveredWorkout: () => Promise<void>;
  finishWorkout: () => Promise<string | null>;
  hasHydrated: boolean;
  hydrateActiveWorkout: () => Promise<void>;
  lastCompletedSetId: string | null;
  lastFinishedWorkoutId: string | null;
  prCelebration: PRCelebrationPayload | null;
  removeExercise: (workoutExerciseId: string) => Promise<void>;
  removeSet: (setId: string) => Promise<void>;
  reorderExercises: (orderedIds: string[]) => Promise<void>;
  skipRestTimer: () => Promise<void>;
  startRestTimer: (duration: number) => Promise<void>;
  startWorkout: (planDayId?: string) => Promise<string | null>;
  startWorkoutFromRepeat: (workoutId: string) => Promise<string | null>;
  updateSet: (
    setId: string,
    updates: Partial<Pick<ActiveSet, "isWarmup" | "reps" | "rpe" | "weight">>,
  ) => Promise<void>;
  saveWorkoutSummary: (input: {
    notes: string;
    rating: number | null;
    workoutId: string;
  }) => Promise<void>;
  restTimerSetId: string | null;
  restTimerStartedAt: number | null;
}

const computeElapsedSeconds = (startedAt: Date): number =>
  Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000));

const calculateExerciseVolume = (sets: ActiveSet[]): number =>
  Number(
    sets.reduce((total, set) => {
      if (set.isWarmup || !set.isCompleted) {
        return total;
      }

      return total + (set.weight ?? 0) * (set.reps ?? 0);
    }, 0).toFixed(2),
  );

const calculateWorkoutTotals = (exercises: ActiveExercise[]): {
  totalSets: number;
  totalVolume: number;
} => ({
  totalSets: exercises.reduce(
    (total, exercise) =>
      total + exercise.sets.filter((set) => set.isCompleted && !set.isWarmup).length,
    0,
  ),
  totalVolume: Number(
    exercises.reduce((total, exercise) => total + exercise.volume, 0).toFixed(2),
  ),
});

const normalizeExercises = (exercises: ActiveExercise[]): ActiveExercise[] =>
  exercises.map((exercise) => {
    const sets = exercise.sets.map((set, index) => ({
      ...set,
      setNumber: index + 1,
    }));

    return {
      ...exercise,
      sets,
      volume: calculateExerciseVolume(sets),
    };
  });

const buildActiveWorkout = (snapshot: {
  exercises: WorkoutSessionExerciseSnapshot[];
  planDayId?: string;
  startedAt: number;
  workoutId: string;
}): ActiveWorkout => {
  const exercises = snapshot.exercises.map((exercise) => ({
    exerciseId: exercise.exerciseId,
    exerciseName: exercise.exerciseName,
    restSeconds: exercise.restSeconds,
    sets: exercise.sets.map((set) => ({
      ...set,
      isPr: set.isPr,
      unit: set.unit,
    })),
    volume: calculateExerciseVolume(exercise.sets),
    workoutExerciseId: exercise.workoutExerciseId,
  }));
  const totals = calculateWorkoutTotals(exercises);

  return {
    elapsedSeconds: computeElapsedSeconds(new Date(snapshot.startedAt)),
    exercises,
    isRestTimerActive: false,
    planDayId: snapshot.planDayId,
    restTimeRemaining: 0,
    restTimerDuration: 0,
    startedAt: new Date(snapshot.startedAt),
    totalSets: totals.totalSets,
    totalVolume: totals.totalVolume,
    workoutId: snapshot.workoutId,
  };
};

const serializeWorkout = (
  state: Pick<
    WorkoutStoreState,
    "activeWorkout" | "lastCompletedSetId" | "restTimerSetId" | "restTimerStartedAt"
  >,
): string | null => {
  if (!state.activeWorkout) {
    return null;
  }

  const payload: PersistedActiveWorkout = {
    activeWorkout: {
      ...state.activeWorkout,
      startedAt: state.activeWorkout.startedAt.toISOString(),
    },
    lastCompletedSetId: state.lastCompletedSetId,
    restTimerSetId: state.restTimerSetId,
    restTimerStartedAt: state.restTimerStartedAt,
  };

  return JSON.stringify(payload);
};

const hydrateSerializedWorkout = (
  payload: PersistedActiveWorkout,
): Pick<
  WorkoutStoreState,
  "activeWorkout" | "lastCompletedSetId" | "restTimerSetId" | "restTimerStartedAt"
> => {
  const startedAt = new Date(payload.activeWorkout.startedAt);
  const activeWorkout: ActiveWorkout = {
    ...payload.activeWorkout,
    elapsedSeconds: computeElapsedSeconds(startedAt),
    startedAt,
  };

  return {
    activeWorkout,
    lastCompletedSetId: payload.lastCompletedSetId,
    restTimerSetId: payload.restTimerSetId,
    restTimerStartedAt: payload.restTimerStartedAt,
  };
};

const persistWorkoutState = async (
  state: Pick<
    WorkoutStoreState,
    "activeWorkout" | "lastCompletedSetId" | "restTimerSetId" | "restTimerStartedAt"
  >,
): Promise<void> => {
  const serialized = serializeWorkout(state);

  if (!serialized) {
    await AsyncStorage.removeItem(ACTIVE_WORKOUT_STORAGE_KEY);
    return;
  }

  await AsyncStorage.setItem(ACTIVE_WORKOUT_STORAGE_KEY, serialized);
};

const clearElapsedTimer = (): void => {
  if (elapsedTimer) {
    clearInterval(elapsedTimer);
    elapsedTimer = null;
  }
};

const clearRestTimer = (): void => {
  if (restTimer) {
    clearInterval(restTimer);
    restTimer = null;
  }
};

const startElapsedTimer = (
  set: (
    partial:
      | WorkoutStoreState
      | Partial<WorkoutStoreState>
      | ((state: WorkoutStoreState) => WorkoutStoreState | Partial<WorkoutStoreState>),
    replace?: false,
  ) => void,
  get: () => WorkoutStoreState,
): void => {
  clearElapsedTimer();

  elapsedTimer = setInterval(() => {
    const activeWorkout = get().activeWorkout;
    if (!activeWorkout) {
      clearElapsedTimer();
      return;
    }

    set((state) => ({
      activeWorkout: state.activeWorkout
        ? {
            ...state.activeWorkout,
            elapsedSeconds: computeElapsedSeconds(state.activeWorkout.startedAt),
          }
        : null,
    }));
  }, ELAPSED_TICK_INTERVAL_MS);
};

const finalizeRestTimer = async (
  set: (
    partial:
      | WorkoutStoreState
      | Partial<WorkoutStoreState>
      | ((state: WorkoutStoreState) => WorkoutStoreState | Partial<WorkoutStoreState>),
    replace?: false,
  ) => void,
  get: () => WorkoutStoreState,
  shouldVibrate: boolean,
): Promise<void> => {
  const state = get();
  const activeWorkout = state.activeWorkout;
  const restTimerSetId = state.restTimerSetId;
  const restTimerStartedAt = state.restTimerStartedAt;

  clearRestTimer();

  if (!activeWorkout) {
    set({
      lastCompletedSetId: null,
      restTimerSetId: null,
      restTimerStartedAt: null,
    });
    await persistWorkoutState(get());
    return;
  }

  let actualRestSeconds: number | null = null;
  if (restTimerSetId && restTimerStartedAt) {
    actualRestSeconds = Math.max(
      0,
      Math.floor((Date.now() - restTimerStartedAt) / 1000),
    );
    await updateWorkoutSetRecord(restTimerSetId, {
      restSeconds: actualRestSeconds,
    });
  }

  set((current) => ({
    activeWorkout: current.activeWorkout
      ? {
          ...current.activeWorkout,
          isRestTimerActive: false,
          restTimeRemaining: 0,
          restTimerDuration: 0,
        }
      : null,
    lastCompletedSetId: null,
    restTimerSetId: null,
    restTimerStartedAt: null,
  }));

  await persistWorkoutState(get());

  if (shouldVibrate && actualRestSeconds !== null) {
    Vibration.vibrate([0, 180, 80, 180]);
  }
};

const startRestTimerLoop = (
  set: (
    partial:
      | WorkoutStoreState
      | Partial<WorkoutStoreState>
      | ((state: WorkoutStoreState) => WorkoutStoreState | Partial<WorkoutStoreState>),
    replace?: false,
  ) => void,
  get: () => WorkoutStoreState,
): void => {
  clearRestTimer();

  restTimer = setInterval(() => {
    const state = get();
    const activeWorkout = state.activeWorkout;
    const startedAt = state.restTimerStartedAt;
    if (!activeWorkout || !activeWorkout.isRestTimerActive || !startedAt) {
      clearRestTimer();
      return;
    }

    const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
    const remaining = Math.max(0, activeWorkout.restTimerDuration - elapsedSeconds);

    set((current) => ({
      activeWorkout: current.activeWorkout
        ? {
            ...current.activeWorkout,
            restTimeRemaining: remaining,
          }
        : null,
    }));

    if (remaining <= 0) {
      void finalizeRestTimer(set, get, true);
    }
  }, REST_TICK_INTERVAL_MS);
};

const updateExercisesForSet = (
  exercises: ActiveExercise[],
  setId: string,
  transform: (set: ActiveSet) => ActiveSet,
): ActiveExercise[] =>
  normalizeExercises(
    exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => (set.workoutSetId === setId ? transform(set) : set)),
    })),
  );

const appendSetToExercise = (
  exercises: ActiveExercise[],
  workoutExerciseId: string,
  set: ActiveSet,
): ActiveExercise[] =>
  normalizeExercises(
    exercises.map((exercise) =>
      exercise.workoutExerciseId === workoutExerciseId
        ? {
            ...exercise,
            sets: [...exercise.sets, set],
          }
        : exercise,
    ),
  );

const findSet = (
  exercises: ActiveExercise[],
  setId: string,
): {
  exercise: ActiveExercise;
  set: ActiveSet;
  setIndex: number;
} | null => {
  for (const exercise of exercises) {
    const setIndex = exercise.sets.findIndex((set) => set.workoutSetId === setId);
    if (setIndex >= 0) {
      const set = exercise.sets[setIndex];
      if (!set) {
        return null;
      }

      return {
        exercise,
        set,
        setIndex,
      };
    }
  }

  return null;
};

const buildNextSetSeed = (exercise: ActiveExercise): {
  previousReps: number | null;
  previousWeight: number | null;
  reps: number | null;
  rpe: number | null;
  unit: WeightUnit;
  weight: number | null;
} => {
  const lastSet = exercise.sets[exercise.sets.length - 1];
  const fallbackUnit = useSettingsStore.getState().weightUnit;

  return {
    previousReps: lastSet?.reps ?? null,
    previousWeight: lastSet?.weight ?? null,
    reps: lastSet?.reps ?? null,
    rpe: null,
    unit: lastSet?.unit ?? fallbackUnit,
    weight: lastSet?.weight ?? null,
  };
};

export const useWorkoutStore = create<WorkoutStoreState>((set, get) => ({
  activeWorkout: null,
  challengeCelebration: null,
  hasHydrated: false,
  lastCompletedSetId: null,
  lastFinishedWorkoutId: null,
  prCelebration: null,
  restTimerSetId: null,
  restTimerStartedAt: null,

  hydrateActiveWorkout: async () => {
    try {
      const raw = await AsyncStorage.getItem(ACTIVE_WORKOUT_STORAGE_KEY);
      if (!raw) {
        set({ hasHydrated: true });
        return;
      }

      const payload = JSON.parse(raw) as PersistedActiveWorkout;
      const hydrated = hydrateSerializedWorkout(payload);

      set({
        ...hydrated,
        hasHydrated: true,
      });

      const activeWorkout = hydrated.activeWorkout;
      if (activeWorkout) {
        startElapsedTimer(set, get);

        if (
          hydrated.restTimerSetId &&
          hydrated.restTimerStartedAt &&
          activeWorkout.isRestTimerActive
        ) {
          const elapsed = Math.floor((Date.now() - hydrated.restTimerStartedAt) / 1000);
          if (elapsed >= activeWorkout.restTimerDuration) {
            await finalizeRestTimer(set, get, false);
          } else {
            startRestTimerLoop(set, get);
          }
        }
      }
    } catch {
      await AsyncStorage.removeItem(ACTIVE_WORKOUT_STORAGE_KEY);
      set({
        activeWorkout: null,
        challengeCelebration: null,
        hasHydrated: true,
        lastCompletedSetId: null,
        prCelebration: null,
        restTimerSetId: null,
        restTimerStartedAt: null,
      });
    }
  },

  discardRecoveredWorkout: async () => {
    clearElapsedTimer();
    clearRestTimer();
    set({
      activeWorkout: null,
      challengeCelebration: null,
      lastCompletedSetId: null,
      prCelebration: null,
      restTimerSetId: null,
      restTimerStartedAt: null,
    });
    await AsyncStorage.removeItem(ACTIVE_WORKOUT_STORAGE_KEY);
  },

  clearChallengeCelebration: () => {
    set({ challengeCelebration: null });
  },

  clearPRCelebration: () => {
    set({ prCelebration: null });
  },

  startWorkout: async (planDayId) => {
    const current = get().activeWorkout;
    if (current) {
      return current.workoutId;
    }

    const weightUnit = useSettingsStore.getState().weightUnit;
    const startedAt = Date.now();
    const template = planDayId
      ? await buildPlanWorkoutTemplate(planDayId, weightUnit)
      : {
          exercises: [],
          planDayId: undefined,
        };
    const snapshot = await createWorkoutSession({
      exercises: template.exercises,
      planDayId: template.planDayId,
      startedAt,
    });
    const activeWorkout = buildActiveWorkout(snapshot);

    set({
      activeWorkout,
      challengeCelebration: null,
      lastCompletedSetId: null,
      lastFinishedWorkoutId: null,
      prCelebration: null,
      restTimerSetId: null,
      restTimerStartedAt: null,
    });
    startElapsedTimer(set, get);
    await persistWorkoutState(get());

    return activeWorkout.workoutId;
  },

  startWorkoutFromRepeat: async (workoutId) => {
    const current = get().activeWorkout;
    if (current) {
      return current.workoutId;
    }

    const startedAt = Date.now();
    const template = await buildRepeatWorkoutTemplate(
      workoutId,
      useSettingsStore.getState().weightUnit,
    );
    const snapshot = await createWorkoutSession({
      exercises: template.exercises,
      planDayId: template.planDayId,
      startedAt,
    });
    const activeWorkout = buildActiveWorkout(snapshot);

    set({
      activeWorkout,
      challengeCelebration: null,
      lastCompletedSetId: null,
      lastFinishedWorkoutId: null,
      prCelebration: null,
      restTimerSetId: null,
      restTimerStartedAt: null,
    });
    startElapsedTimer(set, get);
    await persistWorkoutState(get());

    return activeWorkout.workoutId;
  },

  addExercise: async (exerciseId) => {
    const activeWorkout = get().activeWorkout;
    if (!activeWorkout) {
      return;
    }

    const snapshot = await addExerciseToWorkoutSession({
      defaultUnit: useSettingsStore.getState().weightUnit,
      exerciseId,
      workoutId: activeWorkout.workoutId,
    });
    const exercises = normalizeExercises([
      ...activeWorkout.exercises,
      {
        exerciseId: snapshot.exerciseId,
        exerciseName: snapshot.exerciseName,
        restSeconds: snapshot.restSeconds,
        sets: snapshot.sets,
        volume: snapshot.volume,
        workoutExerciseId: snapshot.workoutExerciseId,
      },
    ]);
    const totals = calculateWorkoutTotals(exercises);

    set((state) => ({
      activeWorkout: state.activeWorkout
        ? {
            ...state.activeWorkout,
            exercises,
            totalSets: totals.totalSets,
            totalVolume: totals.totalVolume,
          }
        : null,
    }));
    await recalculateWorkoutTotals(activeWorkout.workoutId);
    await persistWorkoutState(get());
  },

  removeExercise: async (workoutExerciseId) => {
    const activeWorkout = get().activeWorkout;
    if (!activeWorkout) {
      return;
    }

    await removeWorkoutExerciseRecord(workoutExerciseId);

    const exercises = normalizeExercises(
      activeWorkout.exercises.filter(
        (exercise) => exercise.workoutExerciseId !== workoutExerciseId,
      ),
    );
    const totals = calculateWorkoutTotals(exercises);

    set((state) => ({
      activeWorkout: state.activeWorkout
        ? {
            ...state.activeWorkout,
            exercises,
            totalSets: totals.totalSets,
            totalVolume: totals.totalVolume,
          }
        : null,
    }));
    await recalculateWorkoutTotals(activeWorkout.workoutId);
    await persistWorkoutState(get());
  },

  reorderExercises: async (orderedIds) => {
    const activeWorkout = get().activeWorkout;
    if (!activeWorkout) {
      return;
    }

    const exercises = orderedIds
      .map((id) =>
        activeWorkout.exercises.find((exercise) => exercise.workoutExerciseId === id) ?? null,
      )
      .filter((exercise): exercise is ActiveExercise => exercise !== null);

    set((state) => ({
      activeWorkout: state.activeWorkout
        ? {
            ...state.activeWorkout,
            exercises,
          }
        : null,
    }));

    await reorderWorkoutExercises(activeWorkout.workoutId, orderedIds);
    await persistWorkoutState(get());
  },

  updateSet: async (setId, updates) => {
    const activeWorkout = get().activeWorkout;
    if (!activeWorkout) {
      return;
    }

    const exercises = updateExercisesForSet(activeWorkout.exercises, setId, (set) => ({
      ...set,
      ...updates,
    }));
    const totals = calculateWorkoutTotals(exercises);

    set((state) => ({
      activeWorkout: state.activeWorkout
        ? {
            ...state.activeWorkout,
            exercises,
            totalSets: totals.totalSets,
            totalVolume: totals.totalVolume,
          }
        : null,
    }));

    await updateWorkoutSetRecord(setId, {
      isWarmup: updates.isWarmup,
      reps: updates.reps,
      rpe: updates.rpe,
      weight: updates.weight,
    });
    await recalculateWorkoutTotals(activeWorkout.workoutId);
    await persistWorkoutState(get());
  },

  completeSet: async (setId) => {
    const existingWorkout = get().activeWorkout;
    if (existingWorkout?.isRestTimerActive) {
      await finalizeRestTimer(set, get, false);
    }

    const activeWorkout = get().activeWorkout;
    if (!activeWorkout) {
      return;
    }

    const resolved = findSet(activeWorkout.exercises, setId);
    if (!resolved || resolved.set.isCompleted) {
      return;
    }

    const completedAt = Date.now();
    await updateWorkoutSetRecord(setId, {
      completedAt,
      isCompleted: true,
    });

    const prHits = await checkForPR(resolved.exercise.exerciseId, {
      achievedAt: completedAt,
      isWarmup: resolved.set.isWarmup,
      reps: resolved.set.reps,
      unit: resolved.set.unit,
      weight: resolved.set.weight,
      workoutSetId: setId,
    });
    let exercises = updateExercisesForSet(activeWorkout.exercises, setId, (set) => ({
      ...set,
      isCompleted: true,
      isPr: prHits.length > 0 ? true : set.isPr,
    }));

    const updatedExercise = exercises.find(
      (exercise) => exercise.workoutExerciseId === resolved.exercise.workoutExerciseId,
    );
    const isLastSet = resolved.setIndex === resolved.exercise.sets.length - 1;

    if (isLastSet && updatedExercise) {
      const seed = buildNextSetSeed(updatedExercise);
      const addedSet = await addSetToWorkoutExercise({
        previousReps: seed.previousReps,
        previousWeight: seed.previousWeight,
        reps: seed.reps,
        rpe: seed.rpe,
        unit: seed.unit,
        weight: seed.weight,
        workoutExerciseId: updatedExercise.workoutExerciseId,
      });

      exercises = appendSetToExercise(
        exercises,
        resolved.exercise.workoutExerciseId,
        addedSet,
      );
    }

    const totals = calculateWorkoutTotals(exercises);

    set((state) => ({
      activeWorkout: state.activeWorkout
        ? {
            ...state.activeWorkout,
            exercises,
            totalSets: totals.totalSets,
            totalVolume: totals.totalVolume,
          }
        : null,
      lastCompletedSetId: setId,
      prCelebration:
        prHits.length > 0
          ? {
              exerciseId: resolved.exercise.exerciseId,
              exerciseName: resolved.exercise.exerciseName,
              records: prHits,
              workoutSetId: setId,
            }
          : state.prCelebration,
      restTimerSetId: setId,
      restTimerStartedAt: Date.now(),
    }));

    await recalculateWorkoutTotals(activeWorkout.workoutId);
    await get().startRestTimer(
      updatedExercise?.restSeconds ?? useSettingsStore.getState().defaultRestSeconds,
    );
    await persistWorkoutState(get());
  },

  addSet: async (workoutExerciseId) => {
    const activeWorkout = get().activeWorkout;
    if (!activeWorkout) {
      return;
    }

    const exercise = activeWorkout.exercises.find(
      (item) => item.workoutExerciseId === workoutExerciseId,
    );
    if (!exercise) {
      return;
    }

    const seed = buildNextSetSeed(exercise);
    const snapshot = await addSetToWorkoutExercise({
      previousReps: seed.previousReps,
      previousWeight: seed.previousWeight,
      reps: seed.reps,
      rpe: seed.rpe,
      unit: seed.unit,
      weight: seed.weight,
      workoutExerciseId,
    });

    const exercises = appendSetToExercise(activeWorkout.exercises, workoutExerciseId, snapshot);
    const totals = calculateWorkoutTotals(exercises);

    set((state) => ({
      activeWorkout: state.activeWorkout
        ? {
            ...state.activeWorkout,
            exercises,
            totalSets: totals.totalSets,
            totalVolume: totals.totalVolume,
          }
        : null,
    }));
    await recalculateWorkoutTotals(activeWorkout.workoutId);
    await persistWorkoutState(get());
  },

  removeSet: async (setId) => {
    const activeWorkout = get().activeWorkout;
    if (!activeWorkout) {
      return;
    }

    await removeWorkoutSetRecord(setId);

    const exercises = normalizeExercises(
      activeWorkout.exercises.map((exercise) => ({
        ...exercise,
        sets: exercise.sets.filter((set) => set.workoutSetId !== setId),
      })),
    );
    const totals = calculateWorkoutTotals(exercises);

    set((state) => ({
      activeWorkout: state.activeWorkout
        ? {
            ...state.activeWorkout,
            exercises,
            totalSets: totals.totalSets,
            totalVolume: totals.totalVolume,
          }
        : null,
    }));
    await recalculateWorkoutTotals(activeWorkout.workoutId);
    await persistWorkoutState(get());
  },

  startRestTimer: async (duration) => {
    const activeWorkout = get().activeWorkout;
    const restTimerSetId = get().restTimerSetId ?? get().lastCompletedSetId;

    if (!activeWorkout || !restTimerSetId) {
      return;
    }

    clearRestTimer();

    const nextDuration = Math.max(0, Math.round(duration));
    const startedAt = Date.now();

    set((state) => ({
      activeWorkout: state.activeWorkout
        ? {
            ...state.activeWorkout,
            isRestTimerActive: true,
            restTimeRemaining: nextDuration,
            restTimerDuration: nextDuration,
          }
        : null,
      restTimerSetId,
      restTimerStartedAt: startedAt,
    }));

    if (nextDuration <= 0) {
      await finalizeRestTimer(set, get, true);
      return;
    }

    await persistWorkoutState(get());
    startRestTimerLoop(set, get);
  },

  adjustRestTimer: async (deltaSeconds) => {
    const activeWorkout = get().activeWorkout;
    if (!activeWorkout || !activeWorkout.isRestTimerActive) {
      return;
    }

    const nextDuration = Math.max(0, activeWorkout.restTimerDuration + deltaSeconds);
    const startedAt = get().restTimerStartedAt ?? Date.now();
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    const remaining = Math.max(0, nextDuration - elapsed);

    set((state) => ({
      activeWorkout: state.activeWorkout
        ? {
            ...state.activeWorkout,
            restTimeRemaining: remaining,
            restTimerDuration: nextDuration,
          }
        : null,
    }));
    await persistWorkoutState(get());

    if (remaining <= 0) {
      await finalizeRestTimer(set, get, true);
    }
  },

  skipRestTimer: async () => {
    await finalizeRestTimer(set, get, false);
  },

  finishWorkout: async () => {
    const activeWorkout = get().activeWorkout;
    if (!activeWorkout) {
      return null;
    }

    if (activeWorkout.isRestTimerActive) {
      await finalizeRestTimer(set, get, false);
    }

    const latestWorkout = get().activeWorkout;
    if (!latestWorkout) {
      return null;
    }

    const finalizedExercises = normalizeExercises(latestWorkout.exercises);
    const finalizedTotals = calculateWorkoutTotals(finalizedExercises);

    const finishedAt = Date.now();
    await finalizeWorkoutSession({
      activeExercises: finalizedExercises.map((exercise) => ({
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.exerciseName,
        restSeconds: exercise.restSeconds,
        sets: exercise.sets,
        volume: exercise.volume,
        workoutExerciseId: exercise.workoutExerciseId,
      })),
      startedAt: latestWorkout.startedAt.getTime(),
      workoutId: latestWorkout.workoutId,
    });

    if (useSettingsStore.getState().healthKitEnabled) {
      try {
        await writeWorkoutToHealthKit({
          durationSeconds: Math.max(
            0,
            Math.floor((finishedAt - latestWorkout.startedAt.getTime()) / 1000),
          ),
          endedAt: finishedAt,
          startedAt: latestWorkout.startedAt.getTime(),
          totalVolume: finalizedTotals.totalVolume,
          workoutId: latestWorkout.workoutId,
        });
      } catch {
        // Keep workout completion non-blocking when HealthKit is unavailable.
      }
    }

    let completedChallenges: ChallengeItem[] = [];
    try {
      completedChallenges = await updateProgress();
    } catch {
      completedChallenges = [];
    }

    clearElapsedTimer();
    clearRestTimer();
    set({
      activeWorkout: null,
      challengeCelebration:
        completedChallenges.length > 0
          ? {
              challenges: completedChallenges,
            }
          : null,
      lastCompletedSetId: null,
      lastFinishedWorkoutId: latestWorkout.workoutId,
      prCelebration: null,
      restTimerSetId: null,
      restTimerStartedAt: null,
    });
    await AsyncStorage.removeItem(ACTIVE_WORKOUT_STORAGE_KEY);
    try {
      await requestSync();
    } catch {
      // Leave queued changes locally when sync cannot run immediately.
    }

    return latestWorkout.workoutId;
  },

  saveWorkoutSummary: async ({ notes, rating, workoutId }) => {
    await persistWorkoutSummary(workoutId, {
      notes,
      rating,
    });

    try {
      await requestSync();
    } catch {
      // Keep local update queued for the next foreground/network sync pass.
    }
  },

  clearWorkoutSummary: () => {
    set({ lastFinishedWorkoutId: null });
  },
}));
