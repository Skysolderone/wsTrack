import { by, device, element, expect, waitFor } from "detox";

import {
  confirmAlert,
  enterNumericValue,
  maybeTapId,
  replaceText,
  skipRestTimerIfVisible,
  tapId,
  tapIdAtIndex,
  tapText,
  waitForId,
} from "./app";

interface Credentials {
  email: string;
  password: string;
}

export const openTab = async (
  tab: "training" | "plans" | "history" | "analytics" | "settings",
): Promise<void> => {
  await tapId(`tab-${tab}`);
};

export const openAccountScreen = async (): Promise<void> => {
  await openTab("settings");
  await tapId("settings-account-button");
};

export const signUpInApp = async (credentials: Credentials): Promise<void> => {
  await openAccountScreen();
  await tapId("login-go-signup-button");
  await replaceText("signup-email-input", credentials.email);
  await replaceText("signup-password-input", credentials.password);
  await replaceText("signup-confirm-password-input", credentials.password);
  await tapId("signup-submit-button");
  await waitForId("tab-training");
};

export const createPlanWithExercise = async (
  planName: string,
  dayName: string,
  exerciseName: string,
): Promise<void> => {
  await openTab("plans");

  if (!(await maybeTapId("plan-list-create-button", 2000))) {
    await tapId("plan-list-empty-create");
  }

  await waitForId("plan-editor-screen");
  await replaceText("plan-editor-name-input", planName);

  if (!(await maybeTapId("plan-editor-add-first-day-button", 2000))) {
    await tapId("plan-editor-add-day-button");
  }

  await tapId("plan-editor-rename-day-button");
  await replaceText("plan-editor-rename-input", dayName);
  await tapId("plan-editor-rename-save-button");
  await waitFor(element(by.text(dayName))).toBeVisible().withTimeout(10000);

  await tapId("plan-editor-add-exercise-button");
  await waitForId("exercise-picker-modal");
  await replaceText("search-bar-input", exerciseName);
  await waitFor(element(by.text(exerciseName))).toBeVisible().withTimeout(10000);
  await tapText(exerciseName);
  await tapId("exercise-picker-confirm");
  await waitFor(element(by.text(exerciseName))).toBeVisible().withTimeout(10000);

  await tapId("plan-editor-save-plan-button");
  await tapId("plan-editor-back-button");
  await waitForId("plan-list-screen");
};

export const startPlanWorkout = async (dayName: string): Promise<void> => {
  await openTab("training");
  await waitForId("start-workout-screen");
  await tapText(dayName);
  await waitForId("active-workout-screen");
};

export const startBlankWorkout = async (): Promise<void> => {
  await openTab("training");
  await tapId("start-workout-blank-button");
  await waitForId("active-workout-screen");
};

export const addExerciseToWorkout = async (exerciseName: string): Promise<void> => {
  await tapId("active-workout-add-exercise-button");
  await waitForId("exercise-picker-modal");
  await replaceText("search-bar-input", exerciseName);
  await waitFor(element(by.text(exerciseName))).toBeVisible().withTimeout(10000);
  await tapText(exerciseName);
  await tapId("exercise-picker-confirm");
  await waitFor(element(by.text(exerciseName))).toBeVisible().withTimeout(10000);
};

export const recordSet = async (
  setNumber: number,
  input: {
    reps: string;
    weight: string;
  },
): Promise<void> => {
  await enterNumericValue(`active-workout-set-weight-${setNumber}`, input.weight);
  await enterNumericValue(`active-workout-set-reps-${setNumber}`, input.reps);
  await tapId(`active-workout-set-complete-${setNumber}`);
};

export const finishWorkout = async (): Promise<void> => {
  await tapId("active-workout-finish-button");
  await confirmAlert("结束");
  await waitForId("workout-summary-screen");
};

export const saveWorkoutSummary = async (): Promise<void> => {
  await tapId("workout-summary-save-button");
  await waitForId("tab-training");
};

export const createAndSaveSimpleWorkout = async (
  exerciseName: string,
  sets: Array<{ reps: string; weight: string }>,
): Promise<void> => {
  await startBlankWorkout();
  await addExerciseToWorkout(exerciseName);

  for (let index = 0; index < sets.length; index += 1) {
    const setNumber = index + 1;
    await recordSet(setNumber, sets[index]);
    await skipRestTimerIfVisible();
  }

  await finishWorkout();
  await saveWorkoutSummary();
};

export const openFirstHistoryWorkout = async (): Promise<void> => {
  await openTab("history");
  await waitForId("history-screen");
  await waitFor(element(by.id("history-workout-card")).atIndex(0))
    .toBeVisible()
    .withTimeout(10000);
  await tapIdAtIndex("history-workout-card", 0);
  await waitForId("workout-detail-screen");
};

export const relaunchWithoutReset = async (): Promise<void> => {
  await device.terminateApp();
  await device.launchApp({
    delete: false,
    newInstance: true,
  });
};

export const resumeRecoveredWorkout = async (): Promise<void> => {
  if (!(await maybeTapId("start-workout-resume-button", 5000))) {
    await tapText("恢复训练", 5000);
  }

  await waitForId("active-workout-screen");
};

export const expectTextVisible = async (text: string): Promise<void> => {
  await waitFor(element(by.text(text))).toBeVisible().withTimeout(10000);
  await expect(element(by.text(text))).toBeVisible();
};
