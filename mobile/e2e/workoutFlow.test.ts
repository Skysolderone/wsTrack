import { by, element, expect, waitFor } from "detox";

import {
  createAndSaveSimpleWorkout,
  createPlanWithExercise,
  finishWorkout,
  recordSet,
  relaunchWithoutReset,
  resumeRecoveredWorkout,
  saveWorkoutSummary,
  skipRestTimerIfVisible,
  startBlankWorkout,
  startPlanWorkout,
  addExerciseToWorkout,
} from "./helpers/flows";
import { expectIdText, tapId, waitForId } from "./helpers/app";

describe("核心训练流程", () => {
  test("完整训练流程：计划开始→记录→完成", async () => {
    await createPlanWithExercise("测试计划", "胸日", "杠铃卧推");
    await startPlanWorkout("胸日");

    await recordSet(1, {
      weight: "100",
      reps: "10",
    });
    await waitForId("rest-timer-display");
    await skipRestTimerIfVisible();
    await expectIdText("active-workout-set-weight-value-2", "100");
    await expectIdText("active-workout-set-reps-value-2", "10");

    await tapId("active-workout-set-complete-2");
    await skipRestTimerIfVisible();

    await finishWorkout();
    await expectIdText("workout-summary-total-volume-value", "2000");
    await expectIdText("workout-summary-total-sets-value", "2");
    await saveWorkoutSummary();

    await tapId("tab-history");
    await waitFor(element(by.id("history-workout-card")).atIndex(0))
      .toBeVisible()
      .withTimeout(10000);
    await expect(element(by.id("history-workout-card")).atIndex(0)).toBeVisible();
  });

  test("空白训练：添加动作→记录→完成", async () => {
    await startBlankWorkout();
    await addExerciseToWorkout("哑铃弯举");

    await recordSet(1, { weight: "20", reps: "12" });
    await skipRestTimerIfVisible();
    await recordSet(2, { weight: "20", reps: "12" });
    await skipRestTimerIfVisible();
    await recordSet(3, { weight: "20", reps: "12" });
    await skipRestTimerIfVisible();

    await finishWorkout();
    await waitForId("workout-summary-screen");
    await saveWorkoutSummary();

    await tapId("tab-history");
    await expect(element(by.id("history-workout-card")).atIndex(0)).toBeVisible();
  });

  test("崩溃恢复", async () => {
    await startBlankWorkout();
    await addExerciseToWorkout("杠铃卧推");

    await recordSet(1, { weight: "100", reps: "10" });
    await skipRestTimerIfVisible();
    await recordSet(2, { weight: "100", reps: "10" });
    await skipRestTimerIfVisible();

    await relaunchWithoutReset();
    await resumeRecoveredWorkout();
    await expectIdText("active-workout-set-weight-value-1", "100");
    await expectIdText("active-workout-set-reps-value-1", "10");
    await expectIdText("active-workout-set-weight-value-2", "100");
    await expectIdText("active-workout-set-reps-value-2", "10");
  });

  test("智能预填", async () => {
    await createAndSaveSimpleWorkout("杠铃卧推", [{ weight: "100", reps: "10" }]);

    await startBlankWorkout();
    await addExerciseToWorkout("杠铃卧推");

    await waitForId("active-workout-screen");
    await expectIdText("active-workout-set-weight-value-1", "100");
    await expectIdText("active-workout-set-reps-value-1", "10");
  });
});
