jest.mock("react-native", () => ({
  Vibration: {
    vibrate: jest.fn(),
  },
}));

jest.mock("../../services/WorkoutService", () => ({
  addExerciseToWorkoutSession: jest.fn(),
  addSetToWorkoutExercise: jest.fn(),
  buildPlanWorkoutTemplate: jest.fn(),
  buildRepeatWorkoutTemplate: jest.fn(),
  createWorkoutSession: jest.fn(),
  finalizeWorkoutSession: jest.fn(),
  recalculateWorkoutTotals: jest.fn(),
  removeWorkoutExerciseRecord: jest.fn(),
  removeWorkoutSetRecord: jest.fn(),
  reorderWorkoutExercises: jest.fn(),
  saveWorkoutSummary: jest.fn(),
  updateWorkoutSetRecord: jest.fn(),
}));

jest.mock("../../services/PRService", () => ({
  checkForPR: jest.fn(),
}));

jest.mock("../../services/ChallengeService", () => ({
  updateProgress: jest.fn(),
}));

jest.mock("../../services/HealthKitService", () => ({
  writeWorkout: jest.fn(),
}));

jest.mock("../../services/SyncService", () => ({
  requestSync: jest.fn(),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Vibration } from "react-native";

import { WeightUnit } from "../../constants/enums";
import { ChallengeType, PRType } from "../../constants/enums";
import { updateProgress } from "../../services/ChallengeService";
import { writeWorkout } from "../../services/HealthKitService";
import { checkForPR } from "../../services/PRService";
import { requestSync } from "../../services/SyncService";
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
  saveWorkoutSummary,
  updateWorkoutSetRecord,
} from "../../services/WorkoutService";
import { useSettingsStore } from "../settingsStore";
import type { ActiveExercise, ActiveSet, ActiveWorkout } from "../workoutStore";
import { useWorkoutStore } from "../workoutStore";

const mockedBuildPlanWorkoutTemplate = jest.mocked(buildPlanWorkoutTemplate);
const mockedBuildRepeatWorkoutTemplate = jest.mocked(buildRepeatWorkoutTemplate);
const mockedCreateWorkoutSession = jest.mocked(createWorkoutSession);
const mockedAddExerciseToWorkoutSession = jest.mocked(addExerciseToWorkoutSession);
const mockedAddSetToWorkoutExercise = jest.mocked(addSetToWorkoutExercise);
const mockedUpdateWorkoutSetRecord = jest.mocked(updateWorkoutSetRecord);
const mockedRecalculateWorkoutTotals = jest.mocked(recalculateWorkoutTotals);
const mockedRemoveWorkoutSetRecord = jest.mocked(removeWorkoutSetRecord);
const mockedRemoveWorkoutExerciseRecord = jest.mocked(removeWorkoutExerciseRecord);
const mockedReorderWorkoutExercises = jest.mocked(reorderWorkoutExercises);
const mockedSaveWorkoutSummary = jest.mocked(saveWorkoutSummary);
const mockedFinalizeWorkoutSession = jest.mocked(finalizeWorkoutSession);
const mockedCheckForPR = jest.mocked(checkForPR);
const mockedUpdateProgress = jest.mocked(updateProgress);
const mockedWriteWorkout = jest.mocked(writeWorkout);
const mockedRequestSync = jest.mocked(requestSync);
const mockedVibrate = jest.mocked(Vibration.vibrate);

const initialWorkoutState = useWorkoutStore.getState();
const initialSettingsState = useSettingsStore.getState();

let nextId = 1;

const makeId = (prefix: string): string => `${prefix}-${nextId++}`;

const flushAsync = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const calculateExerciseVolumeForTest = (sets: ActiveSet[]): number =>
  Number(
    sets
      .reduce((total, set) => {
        if (!set.isCompleted || set.isWarmup || set.weight === null || set.reps === null) {
          return total;
        }

        return total + set.weight * set.reps;
      }, 0)
      .toFixed(2),
  );

const calculateWorkoutVolumeForTest = (exercises: ActiveExercise[]): number =>
  Number(
    exercises
      .reduce((total, exercise) => total + calculateExerciseVolumeForTest(exercise.sets), 0)
      .toFixed(2),
  );

const calculateTotalSetsForTest = (exercises: ActiveExercise[]): number =>
  exercises.reduce(
    (total, exercise) =>
      total + exercise.sets.filter((set) => set.isCompleted && !set.isWarmup).length,
    0,
  );

const buildSet = (overrides: Partial<ActiveSet> = {}): ActiveSet => ({
  isCompleted: false,
  isPr: false,
  isWarmup: false,
  previousReps: null,
  previousWeight: null,
  reps: null,
  rpe: null,
  setNumber: 1,
  unit: WeightUnit.KG,
  weight: null,
  workoutSetId: makeId("set"),
  ...overrides,
});

const buildExercise = (overrides: Partial<ActiveExercise> = {}): ActiveExercise => {
  const sets = overrides.sets ?? [buildSet()];

  return {
    exerciseId: makeId("exercise"),
    exerciseName: "杠铃卧推",
    restSeconds: 90,
    sets,
    volume: calculateExerciseVolumeForTest(sets),
    workoutExerciseId: makeId("workout-exercise"),
    ...overrides,
  };
};

const buildWorkout = (overrides: Partial<ActiveWorkout> = {}): ActiveWorkout => {
  const exercises = overrides.exercises ?? [];

  return {
    elapsedSeconds: 0,
    exercises,
    isRestTimerActive: false,
    restTimeRemaining: 0,
    restTimerDuration: 0,
    startedAt: new Date("2026-03-30T10:00:00.000Z"),
    totalSets: calculateTotalSetsForTest(exercises),
    totalVolume: calculateWorkoutVolumeForTest(exercises),
    workoutId: makeId("workout"),
    ...overrides,
  };
};

const buildSessionSetSnapshot = (
  overrides: Partial<ActiveSet> = {},
): Awaited<ReturnType<typeof addSetToWorkoutExercise>> => ({
  isCompleted: false,
  isPr: false,
  isWarmup: false,
  previousReps: null,
  previousWeight: null,
  reps: null,
  rpe: null,
  setNumber: 1,
  unit: WeightUnit.KG,
  weight: null,
  workoutSetId: makeId("snapshot-set"),
  ...overrides,
});

const seedWorkout = (activeWorkout: ActiveWorkout): void => {
  useWorkoutStore.setState(
    (state) => ({
      ...state,
      activeWorkout,
      challengeCelebration: null,
      lastCompletedSetId: null,
      lastFinishedWorkoutId: null,
      prCelebration: null,
      restTimerSetId: null,
      restTimerStartedAt: null,
    }),
    true,
  );
};

describe("workoutStore", () => {
  beforeEach(async () => {
    nextId = 1;
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-03-30T10:00:00.000Z"));
    jest.clearAllMocks();
    useWorkoutStore.setState(initialWorkoutState, true);
    useSettingsStore.setState(initialSettingsState, true);
    await AsyncStorage.clear();

    mockedBuildPlanWorkoutTemplate.mockResolvedValue({
      exercises: [],
      planDayId: "plan-day-1",
    });
    mockedBuildRepeatWorkoutTemplate.mockResolvedValue({
      exercises: [],
      planDayId: "repeat-plan-day-1",
    });
    mockedCreateWorkoutSession.mockImplementation(async (input) => ({
      exercises: input.exercises.map((exercise) => ({
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.exerciseName,
        restSeconds: exercise.restSeconds,
        sets: exercise.sets.map((set, index) => ({
          ...set,
          isCompleted: false,
          isPr: false,
          setNumber: index + 1,
          workoutSetId: makeId("session-set"),
        })),
        volume: 0,
        workoutExerciseId: makeId("session-exercise"),
      })),
      ...(input.planDayId ? { planDayId: input.planDayId } : {}),
      startedAt: input.startedAt,
      workoutId: makeId("session-workout"),
    }));
    mockedAddExerciseToWorkoutSession.mockResolvedValue({
      exerciseId: "exercise-1",
      exerciseName: "杠铃深蹲",
      restSeconds: 90,
      sets: [buildSessionSetSnapshot()],
      volume: 0,
      workoutExerciseId: "workout-exercise-1",
    });
    mockedAddSetToWorkoutExercise.mockResolvedValue(
      buildSessionSetSnapshot({
        previousReps: 10,
        previousWeight: 100,
        reps: 10,
        setNumber: 2,
        weight: 100,
        workoutSetId: "set-2",
      }),
    );
    mockedUpdateWorkoutSetRecord.mockResolvedValue(undefined);
    mockedRecalculateWorkoutTotals.mockResolvedValue(undefined);
    mockedRemoveWorkoutSetRecord.mockResolvedValue(undefined);
    mockedRemoveWorkoutExerciseRecord.mockResolvedValue(undefined);
    mockedReorderWorkoutExercises.mockResolvedValue(undefined);
    mockedSaveWorkoutSummary.mockResolvedValue(undefined);
    mockedFinalizeWorkoutSession.mockResolvedValue(undefined);
    mockedCheckForPR.mockResolvedValue([]);
    mockedUpdateProgress.mockResolvedValue([]);
    mockedWriteWorkout.mockResolvedValue(undefined);
    mockedRequestSync.mockResolvedValue({
      lastSyncAt: null,
      pulled: 0,
      pushed: 0,
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe("startWorkout", () => {
    test("初始化状态：elapsedSeconds=0, exercises=[], totalVolume=0", async () => {
      const workoutId = await useWorkoutStore.getState().startWorkout();
      const state = useWorkoutStore.getState().activeWorkout;

      expect(workoutId).toBe(state?.workoutId);
      expect(state?.elapsedSeconds).toBe(0);
      expect(state?.exercises).toEqual([]);
      expect(state?.totalVolume).toBe(0);
      expect(state?.totalSets).toBe(0);
    });

    test("从计划开始：planDayId 设置正确", async () => {
      await useWorkoutStore.getState().startWorkout("plan-day-1");

      expect(mockedBuildPlanWorkoutTemplate).toHaveBeenCalledWith(
        "plan-day-1",
        WeightUnit.KG,
      );
      expect(useWorkoutStore.getState().activeWorkout?.planDayId).toBe("plan-day-1");
    });

    test("空白开始：planDayId=undefined", async () => {
      await useWorkoutStore.getState().startWorkout();

      expect(mockedBuildPlanWorkoutTemplate).not.toHaveBeenCalled();
      expect(useWorkoutStore.getState().activeWorkout?.planDayId).toBeUndefined();
    });

    test("已有进行中训练时返回当前 workoutId", async () => {
      seedWorkout(buildWorkout({ workoutId: "active-workout-1" }));

      const workoutId = await useWorkoutStore.getState().startWorkout("plan-day-1");

      expect(workoutId).toBe("active-workout-1");
      expect(mockedCreateWorkoutSession).not.toHaveBeenCalled();
    });
  });

  describe("hydrateActiveWorkout", () => {
    test("无缓存时仅标记 hasHydrated", async () => {
      await useWorkoutStore.getState().hydrateActiveWorkout();

      expect(useWorkoutStore.getState().hasHydrated).toBe(true);
      expect(useWorkoutStore.getState().activeWorkout).toBeNull();
    });

    test("恢复缓存训练并启动 elapsed timer", async () => {
      await AsyncStorage.setItem(
        "active_workout",
        JSON.stringify({
          activeWorkout: {
            elapsedSeconds: 0,
            exercises: [],
            isRestTimerActive: false,
            restTimeRemaining: 0,
            restTimerDuration: 0,
            startedAt: new Date("2026-03-30T09:59:58.000Z").toISOString(),
            totalSets: 0,
            totalVolume: 0,
            workoutId: "recovered-workout-1",
          },
          lastCompletedSetId: null,
          restTimerSetId: null,
          restTimerStartedAt: null,
        }),
      );

      await useWorkoutStore.getState().hydrateActiveWorkout();
      jest.advanceTimersByTime(1000);
      await flushAsync();

      expect(useWorkoutStore.getState().activeWorkout?.workoutId).toBe("recovered-workout-1");
      expect(useWorkoutStore.getState().activeWorkout?.elapsedSeconds).toBe(3);
      expect(useWorkoutStore.getState().hasHydrated).toBe(true);
    });

    test("缓存损坏时清空恢复状态", async () => {
      await AsyncStorage.setItem("active_workout", "{broken");

      await useWorkoutStore.getState().hydrateActiveWorkout();

      expect(useWorkoutStore.getState().activeWorkout).toBeNull();
      expect(useWorkoutStore.getState().hasHydrated).toBe(true);
      expect(jest.mocked(AsyncStorage.removeItem)).toHaveBeenCalledWith("active_workout");
    });

    test("恢复时已过期的 rest timer 会自动完成", async () => {
      await AsyncStorage.setItem(
        "active_workout",
        JSON.stringify({
          activeWorkout: {
            elapsedSeconds: 0,
            exercises: [],
            isRestTimerActive: true,
            restTimeRemaining: 30,
            restTimerDuration: 30,
            startedAt: new Date("2026-03-30T09:50:00.000Z").toISOString(),
            totalSets: 0,
            totalVolume: 0,
            workoutId: "recovered-workout-2",
          },
          lastCompletedSetId: "set-1",
          restTimerSetId: "set-1",
          restTimerStartedAt: new Date("2026-03-30T09:59:00.000Z").getTime(),
        }),
      );

      await useWorkoutStore.getState().hydrateActiveWorkout();

      expect(mockedUpdateWorkoutSetRecord).toHaveBeenCalledWith("set-1", {
        restSeconds: 60,
      });
      expect(useWorkoutStore.getState().activeWorkout?.isRestTimerActive).toBe(false);
    });
  });

  describe("recovery helpers", () => {
    test("discardRecoveredWorkout 清空状态和缓存", async () => {
      seedWorkout(buildWorkout({ workoutId: "recovering-workout-1" }));

      await useWorkoutStore.getState().discardRecoveredWorkout();

      expect(useWorkoutStore.getState().activeWorkout).toBeNull();
      expect(jest.mocked(AsyncStorage.removeItem)).toHaveBeenCalledWith("active_workout");
    });

    test("clearChallengeCelebration 和 clearPRCelebration 生效", () => {
      useWorkoutStore.setState(
        (state) => ({
          ...state,
          challengeCelebration: {
            challenges: [],
          },
          prCelebration: {
            exerciseId: "exercise-1",
            exerciseName: "卧推",
            records: [],
            workoutSetId: "set-1",
          },
        }),
        true,
      );

      useWorkoutStore.getState().clearChallengeCelebration();
      useWorkoutStore.getState().clearPRCelebration();

      expect(useWorkoutStore.getState().challengeCelebration).toBeNull();
      expect(useWorkoutStore.getState().prCelebration).toBeNull();
    });
  });

  describe("startWorkoutFromRepeat", () => {
    test("从历史训练开始：planDayId 设置正确", async () => {
      await useWorkoutStore.getState().startWorkoutFromRepeat("workout-history-1");

      expect(mockedBuildRepeatWorkoutTemplate).toHaveBeenCalledWith(
        "workout-history-1",
        WeightUnit.KG,
      );
      expect(useWorkoutStore.getState().activeWorkout?.planDayId).toBe(
        "repeat-plan-day-1",
      );
    });

    test("已有进行中训练时复练返回当前 workoutId", async () => {
      seedWorkout(buildWorkout({ workoutId: "active-workout-2" }));

      const workoutId = await useWorkoutStore.getState().startWorkoutFromRepeat(
        "workout-history-1",
      );

      expect(workoutId).toBe("active-workout-2");
      expect(mockedBuildRepeatWorkoutTemplate).not.toHaveBeenCalled();
    });
  });

  describe("addExercise", () => {
    test("添加动作后 exercises 数组增加", async () => {
      seedWorkout(buildWorkout());

      await useWorkoutStore.getState().addExercise("exercise-1");

      expect(useWorkoutStore.getState().activeWorkout?.exercises).toHaveLength(1);
    });

    test("新添加的动作包含 1 个空白组", async () => {
      seedWorkout(buildWorkout());

      await useWorkoutStore.getState().addExercise("exercise-1");

      const addedExercise = useWorkoutStore.getState().activeWorkout?.exercises[0];
      expect(addedExercise?.sets).toHaveLength(1);
      expect(addedExercise?.sets[0]).toMatchObject({
        isCompleted: false,
        reps: null,
        weight: null,
      });
    });

    test("无 activeWorkout 时直接返回", async () => {
      await useWorkoutStore.getState().addExercise("exercise-1");

      expect(mockedAddExerciseToWorkoutSession).not.toHaveBeenCalled();
    });
  });

  describe("updateSet", () => {
    test("更新 weight：值正确更新", async () => {
      const set = buildSet({
        isCompleted: true,
        reps: 10,
        weight: 100,
        workoutSetId: "set-1",
      });
      seedWorkout(buildWorkout({ exercises: [buildExercise({ sets: [set] })] }));

      await useWorkoutStore.getState().updateSet("set-1", { weight: 110 });

      expect(useWorkoutStore.getState().activeWorkout?.exercises[0]?.sets[0]?.weight).toBe(110);
    });

    test("更新 reps：值正确更新", async () => {
      const set = buildSet({
        isCompleted: true,
        reps: 10,
        weight: 100,
        workoutSetId: "set-1",
      });
      seedWorkout(buildWorkout({ exercises: [buildExercise({ sets: [set] })] }));

      await useWorkoutStore.getState().updateSet("set-1", { reps: 12 });

      expect(useWorkoutStore.getState().activeWorkout?.exercises[0]?.sets[0]?.reps).toBe(12);
    });

    test("更新后容量重新计算", async () => {
      const set = buildSet({
        isCompleted: true,
        reps: 10,
        weight: 100,
        workoutSetId: "set-1",
      });
      seedWorkout(buildWorkout({ exercises: [buildExercise({ sets: [set] })] }));

      await useWorkoutStore.getState().updateSet("set-1", { weight: 110 });

      expect(useWorkoutStore.getState().activeWorkout?.exercises[0]?.volume).toBe(1100);
      expect(useWorkoutStore.getState().activeWorkout?.totalVolume).toBe(1100);
    });

    test("无 activeWorkout 时直接返回", async () => {
      await useWorkoutStore.getState().updateSet("set-1", { weight: 100 });

      expect(mockedUpdateWorkoutSetRecord).not.toHaveBeenCalled();
    });
  });

  describe("completeSet", () => {
    test("标记 isCompleted=true", async () => {
      const set = buildSet({
        reps: 10,
        weight: 100,
        workoutSetId: "set-1",
      });
      seedWorkout(buildWorkout({ exercises: [buildExercise({ sets: [set] })] }));

      await useWorkoutStore.getState().completeSet("set-1");

      expect(useWorkoutStore.getState().activeWorkout?.exercises[0]?.sets[0]?.isCompleted).toBe(
        true,
      );
    });

    test("自动在末尾添加下一组空行", async () => {
      const set = buildSet({
        reps: 10,
        weight: 100,
        workoutSetId: "set-1",
      });
      mockedAddSetToWorkoutExercise.mockResolvedValueOnce(
        buildSessionSetSnapshot({
          previousReps: 10,
          previousWeight: 100,
          reps: 10,
          setNumber: 2,
          weight: 100,
          workoutSetId: "set-2",
        }),
      );
      seedWorkout(buildWorkout({ exercises: [buildExercise({ sets: [set] })] }));

      await useWorkoutStore.getState().completeSet("set-1");

      const sets = useWorkoutStore.getState().activeWorkout?.exercises[0]?.sets;
      expect(sets).toHaveLength(2);
      expect(sets?.[1]).toMatchObject({
        previousReps: 10,
        previousWeight: 100,
        setNumber: 2,
      });
    });

    test("动作容量更新", async () => {
      const set = buildSet({
        reps: 10,
        weight: 100,
        workoutSetId: "set-1",
      });
      seedWorkout(buildWorkout({ exercises: [buildExercise({ sets: [set] })] }));

      await useWorkoutStore.getState().completeSet("set-1");

      expect(useWorkoutStore.getState().activeWorkout?.exercises[0]?.volume).toBe(1000);
    });

    test("总容量更新", async () => {
      const set = buildSet({
        reps: 10,
        weight: 100,
        workoutSetId: "set-1",
      });
      seedWorkout(buildWorkout({ exercises: [buildExercise({ sets: [set] })] }));

      await useWorkoutStore.getState().completeSet("set-1");

      expect(useWorkoutStore.getState().activeWorkout?.totalVolume).toBe(1000);
    });

    test("totalSets 增加", async () => {
      const set = buildSet({
        reps: 10,
        weight: 100,
        workoutSetId: "set-1",
      });
      seedWorkout(buildWorkout({ exercises: [buildExercise({ sets: [set] })] }));

      await useWorkoutStore.getState().completeSet("set-1");

      expect(useWorkoutStore.getState().activeWorkout?.totalSets).toBe(1);
    });

    test("warmup 组不增加 totalSets", async () => {
      const set = buildSet({
        isWarmup: true,
        reps: 10,
        weight: 60,
        workoutSetId: "set-1",
      });
      seedWorkout(buildWorkout({ exercises: [buildExercise({ sets: [set] })] }));

      await useWorkoutStore.getState().completeSet("set-1");

      expect(useWorkoutStore.getState().activeWorkout?.totalSets).toBe(0);
      expect(useWorkoutStore.getState().activeWorkout?.totalVolume).toBe(0);
    });

    test("PR 命中时设置 prCelebration", async () => {
      const set = buildSet({
        reps: 10,
        weight: 105,
        workoutSetId: "set-1",
      });
      mockedCheckForPR.mockResolvedValueOnce([
        {
          displayUnit: "kg",
          displayValue: 105,
          label: "最大重量",
          type: PRType.MaxWeight,
          value: 105,
        },
      ]);
      seedWorkout(buildWorkout({ exercises: [buildExercise({ sets: [set] })] }));

      await useWorkoutStore.getState().completeSet("set-1");

      expect(useWorkoutStore.getState().prCelebration).toMatchObject({
        exerciseName: "杠铃卧推",
        workoutSetId: "set-1",
      });
      expect(useWorkoutStore.getState().activeWorkout?.exercises[0]?.sets[0]?.isPr).toBe(
        true,
      );
    });

    test("已完成的组再次 complete 不重复处理", async () => {
      const set = buildSet({
        isCompleted: true,
        reps: 10,
        weight: 100,
        workoutSetId: "set-1",
      });
      seedWorkout(buildWorkout({ exercises: [buildExercise({ sets: [set] })] }));

      await useWorkoutStore.getState().completeSet("set-1");

      expect(mockedUpdateWorkoutSetRecord).not.toHaveBeenCalled();
    });
  });

  describe("addSet", () => {
    test("添加新组后 exercises 中组数增加", async () => {
      const workout = buildWorkout({
        exercises: [buildExercise({ workoutExerciseId: "workout-exercise-1" })],
      });
      seedWorkout(workout);

      await useWorkoutStore.getState().addSet("workout-exercise-1");

      expect(useWorkoutStore.getState().activeWorkout?.exercises[0]?.sets).toHaveLength(2);
    });

    test("目标动作不存在时直接返回", async () => {
      seedWorkout(buildWorkout());

      await useWorkoutStore.getState().addSet("missing-exercise");

      expect(mockedAddSetToWorkoutExercise).not.toHaveBeenCalled();
    });
  });

  describe("removeSet", () => {
    test("删除组后容量重新计算", async () => {
      const firstSet = buildSet({
        isCompleted: true,
        reps: 10,
        setNumber: 1,
        weight: 100,
        workoutSetId: "set-1",
      });
      const secondSet = buildSet({
        isCompleted: true,
        reps: 8,
        setNumber: 2,
        weight: 110,
        workoutSetId: "set-2",
      });
      seedWorkout(buildWorkout({ exercises: [buildExercise({ sets: [firstSet, secondSet] })] }));

      await useWorkoutStore.getState().removeSet("set-1");

      expect(useWorkoutStore.getState().activeWorkout?.exercises[0]?.volume).toBe(880);
      expect(useWorkoutStore.getState().activeWorkout?.totalVolume).toBe(880);
    });

    test("组号重新排列", async () => {
      const firstSet = buildSet({
        isCompleted: true,
        reps: 10,
        setNumber: 1,
        weight: 100,
        workoutSetId: "set-1",
      });
      const secondSet = buildSet({
        isCompleted: true,
        reps: 8,
        setNumber: 2,
        weight: 110,
        workoutSetId: "set-2",
      });
      seedWorkout(buildWorkout({ exercises: [buildExercise({ sets: [firstSet, secondSet] })] }));

      await useWorkoutStore.getState().removeSet("set-1");

      expect(useWorkoutStore.getState().activeWorkout?.exercises[0]?.sets[0]?.setNumber).toBe(
        1,
      );
    });

    test("无 activeWorkout 时直接返回", async () => {
      await useWorkoutStore.getState().removeSet("set-1");

      expect(mockedRemoveWorkoutSetRecord).not.toHaveBeenCalled();
    });
  });

  describe("removeExercise", () => {
    test("删除动作后总容量重新计算", async () => {
      const firstExercise = buildExercise({
        sets: [
          buildSet({
            isCompleted: true,
            reps: 10,
            weight: 100,
            workoutSetId: "set-1",
          }),
        ],
        volume: 1000,
        workoutExerciseId: "workout-exercise-1",
      });
      const secondExercise = buildExercise({
        sets: [
          buildSet({
            isCompleted: true,
            reps: 8,
            weight: 100,
            workoutSetId: "set-2",
          }),
        ],
        volume: 800,
        workoutExerciseId: "workout-exercise-2",
      });
      seedWorkout(buildWorkout({ exercises: [firstExercise, secondExercise] }));

      await useWorkoutStore.getState().removeExercise("workout-exercise-2");

      expect(useWorkoutStore.getState().activeWorkout?.exercises).toHaveLength(1);
      expect(useWorkoutStore.getState().activeWorkout?.totalVolume).toBe(1000);
    });

    test("无 activeWorkout 时直接返回", async () => {
      await useWorkoutStore.getState().removeExercise("workout-exercise-1");

      expect(mockedRemoveWorkoutExerciseRecord).not.toHaveBeenCalled();
    });
  });

  describe("reorderExercises", () => {
    test("按给定顺序重排动作", async () => {
      const workout = buildWorkout({
        exercises: [
          buildExercise({ workoutExerciseId: "workout-exercise-1" }),
          buildExercise({ workoutExerciseId: "workout-exercise-2" }),
        ],
      });
      seedWorkout(workout);

      await useWorkoutStore
        .getState()
        .reorderExercises(["workout-exercise-2", "workout-exercise-1"]);

      expect(
        useWorkoutStore.getState().activeWorkout?.exercises.map(
          (exercise) => exercise.workoutExerciseId,
        ),
      ).toEqual(["workout-exercise-2", "workout-exercise-1"]);
      expect(mockedReorderWorkoutExercises).toHaveBeenCalledWith(workout.workoutId, [
        "workout-exercise-2",
        "workout-exercise-1",
      ]);
    });

    test("无 activeWorkout 时不处理重排", async () => {
      await useWorkoutStore.getState().reorderExercises(["a", "b"]);

      expect(mockedReorderWorkoutExercises).not.toHaveBeenCalled();
    });
  });

  describe("rest timer", () => {
    test("startRestTimer 启动倒计时并按 tick 递减", async () => {
      const set = buildSet({
        isCompleted: true,
        reps: 10,
        weight: 100,
        workoutSetId: "set-1",
      });
      seedWorkout(buildWorkout({ exercises: [buildExercise({ sets: [set] })] }));
      useWorkoutStore.setState(
        (state) => ({
          ...state,
          lastCompletedSetId: "set-1",
        }),
        true,
      );

      await useWorkoutStore.getState().startRestTimer(30);
      jest.advanceTimersByTime(10_000);
      await flushAsync();

      expect(useWorkoutStore.getState().activeWorkout?.isRestTimerActive).toBe(true);
      expect(useWorkoutStore.getState().activeWorkout?.restTimeRemaining).toBe(20);
    });

    test("adjustRestTimer 可调整剩余时间", async () => {
      const set = buildSet({
        isCompleted: true,
        reps: 10,
        weight: 100,
        workoutSetId: "set-1",
      });
      seedWorkout(buildWorkout({ exercises: [buildExercise({ sets: [set] })] }));
      useWorkoutStore.setState(
        (state) => ({
          ...state,
          lastCompletedSetId: "set-1",
        }),
        true,
      );

      await useWorkoutStore.getState().startRestTimer(30);
      jest.advanceTimersByTime(10_000);
      await flushAsync();
      await useWorkoutStore.getState().adjustRestTimer(15);

      expect(useWorkoutStore.getState().activeWorkout?.restTimerDuration).toBe(45);
      expect(useWorkoutStore.getState().activeWorkout?.restTimeRemaining).toBe(35);
    });

    test("skipRestTimer 立即结束倒计时并记录实际休息时间", async () => {
      const set = buildSet({
        isCompleted: true,
        reps: 10,
        weight: 100,
        workoutSetId: "set-1",
      });
      seedWorkout(buildWorkout({ exercises: [buildExercise({ sets: [set] })] }));
      useWorkoutStore.setState(
        (state) => ({
          ...state,
          lastCompletedSetId: "set-1",
        }),
        true,
      );

      await useWorkoutStore.getState().startRestTimer(30);
      jest.advanceTimersByTime(10_000);
      await flushAsync();
      await useWorkoutStore.getState().skipRestTimer();

      expect(mockedUpdateWorkoutSetRecord).toHaveBeenCalledWith("set-1", {
        restSeconds: 10,
      });
      expect(useWorkoutStore.getState().activeWorkout?.isRestTimerActive).toBe(false);
    });

    test("倒计时结束时触发震动", async () => {
      const set = buildSet({
        isCompleted: true,
        reps: 10,
        weight: 100,
        workoutSetId: "set-1",
      });
      seedWorkout(buildWorkout({ exercises: [buildExercise({ sets: [set] })] }));
      useWorkoutStore.setState(
        (state) => ({
          ...state,
          lastCompletedSetId: "set-1",
        }),
        true,
      );

      await useWorkoutStore.getState().startRestTimer(0);

      expect(mockedVibrate).toHaveBeenCalledWith([0, 180, 80, 180]);
      expect(useWorkoutStore.getState().activeWorkout?.isRestTimerActive).toBe(false);
    });

    test("无 activeWorkout 或 restTimerSetId 时不启动", async () => {
      await useWorkoutStore.getState().startRestTimer(30);
      await useWorkoutStore.getState().adjustRestTimer(15);
      await useWorkoutStore.getState().skipRestTimer();

      expect(mockedUpdateWorkoutSetRecord).not.toHaveBeenCalled();
    });
  });

  describe("finishWorkout", () => {
    test("无 activeWorkout 返回 null", async () => {
      await expect(useWorkoutStore.getState().finishWorkout()).resolves.toBeNull();
    });

    test("计算最终 totalVolume 和 totalSets", async () => {
      useSettingsStore.setState(
        (state) => ({
          ...state,
          healthKitEnabled: true,
        }),
        true,
      );

      const completedSet = buildSet({
        isCompleted: true,
        reps: 10,
        weight: 100,
        workoutSetId: "set-1",
      });
      seedWorkout(
        buildWorkout({
          exercises: [buildExercise({ sets: [completedSet], volume: 999 })],
        }),
      );

      const workoutId = await useWorkoutStore.getState().finishWorkout();

      expect(workoutId).toBeDefined();
      expect(mockedFinalizeWorkoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          activeExercises: [
            expect.objectContaining({
              volume: 1000,
            }),
          ],
        }),
      );
      expect(mockedWriteWorkout).toHaveBeenCalledWith(
        expect.objectContaining({
          totalVolume: 1000,
        }),
      );
      expect(useWorkoutStore.getState().activeWorkout).toBeNull();
    });

    test("warmup 组不计入 totalVolume", async () => {
      const warmupSet = buildSet({
        isCompleted: true,
        isWarmup: true,
        reps: 10,
        weight: 60,
        workoutSetId: "set-1",
      });
      const workSet = buildSet({
        isCompleted: true,
        reps: 10,
        setNumber: 2,
        weight: 100,
        workoutSetId: "set-2",
      });
      seedWorkout(
        buildWorkout({
          exercises: [buildExercise({ sets: [warmupSet, workSet], volume: 9999 })],
        }),
      );

      await useWorkoutStore.getState().finishWorkout();

      expect(mockedFinalizeWorkoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          activeExercises: [
            expect.objectContaining({
              volume: 1000,
            }),
          ],
        }),
      );
    });

    test("未完成组不计入", async () => {
      const completedSet = buildSet({
        isCompleted: true,
        reps: 10,
        weight: 100,
        workoutSetId: "set-1",
      });
      const incompleteSet = buildSet({
        isCompleted: false,
        reps: 8,
        setNumber: 2,
        weight: 120,
        workoutSetId: "set-2",
      });
      seedWorkout(
        buildWorkout({
          exercises: [buildExercise({ sets: [completedSet, incompleteSet], volume: 9999 })],
        }),
      );

      await useWorkoutStore.getState().finishWorkout();

      expect(mockedFinalizeWorkoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          activeExercises: [
            expect.objectContaining({
              volume: 1000,
            }),
          ],
        }),
      );
    });

    test("训练结束后生成 challengeCelebration，并吞掉同步错误", async () => {
      const completedSet = buildSet({
        isCompleted: true,
        reps: 10,
        weight: 100,
        workoutSetId: "set-1",
      });
      mockedUpdateProgress.mockResolvedValueOnce([
        {
          createdAt: Date.now(),
          currentValue: 5000,
          endDate: Date.now() + 86_400_000,
          id: "challenge-1",
          isCompleted: true,
          progressPercent: 100,
          remainingDays: 1,
          startDate: Date.now() - 86_400_000,
          targetValue: 5000,
          type: ChallengeType.Volume,
          updatedAt: Date.now(),
        },
      ]);
      mockedRequestSync.mockRejectedValueOnce(new Error("sync failed"));
      seedWorkout(buildWorkout({ exercises: [buildExercise({ sets: [completedSet] })] }));

      await expect(useWorkoutStore.getState().finishWorkout()).resolves.toBeDefined();

      expect(useWorkoutStore.getState().challengeCelebration).toEqual({
        challenges: expect.arrayContaining([
          expect.objectContaining({
            id: "challenge-1",
          }),
        ]),
      });
    });

    test("challenge 更新失败时不阻塞训练结束", async () => {
      const completedSet = buildSet({
        isCompleted: true,
        reps: 10,
        weight: 100,
        workoutSetId: "set-1",
      });
      mockedUpdateProgress.mockRejectedValueOnce(new Error("challenge failed"));
      seedWorkout(buildWorkout({ exercises: [buildExercise({ sets: [completedSet] })] }));

      await expect(useWorkoutStore.getState().finishWorkout()).resolves.toBeDefined();

      expect(useWorkoutStore.getState().challengeCelebration).toBeNull();
    });
  });

  describe("saveWorkoutSummary", () => {
    test("保存摘要后触发持久化", async () => {
      await useWorkoutStore.getState().saveWorkoutSummary({
        notes: "今天状态很好",
        rating: 5,
        workoutId: "workout-1",
      });

      expect(mockedSaveWorkoutSummary).toHaveBeenCalledWith("workout-1", {
        notes: "今天状态很好",
        rating: 5,
      });
      expect(mockedRequestSync).toHaveBeenCalled();
    });

    test("同步失败时不抛错", async () => {
      mockedRequestSync.mockRejectedValueOnce(new Error("sync failed"));

      await expect(
        useWorkoutStore.getState().saveWorkoutSummary({
          notes: "keep local",
          rating: 4,
          workoutId: "workout-1",
        }),
      ).resolves.toBeUndefined();
    });

    test("clearWorkoutSummary 清空最后完成的训练 ID", () => {
      useWorkoutStore.setState(
        (state) => ({
          ...state,
          lastFinishedWorkoutId: "workout-1",
        }),
        true,
      );

      useWorkoutStore.getState().clearWorkoutSummary();

      expect(useWorkoutStore.getState().lastFinishedWorkoutId).toBeNull();
    });
  });
});
