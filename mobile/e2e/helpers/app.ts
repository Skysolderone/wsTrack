import { by, device, element, expect, waitFor } from "detox";

export const DEFAULT_TIMEOUT = 30000;

export const waitForId = async (
  testID: string,
  timeout = DEFAULT_TIMEOUT,
): Promise<void> => {
  await waitFor(element(by.id(testID))).toBeVisible().withTimeout(timeout);
};

export const tapId = async (
  testID: string,
  timeout = DEFAULT_TIMEOUT,
): Promise<void> => {
  await waitForId(testID, timeout);
  await element(by.id(testID)).tap();
};

export const tapIdAtIndex = async (
  testID: string,
  index: number,
  timeout = DEFAULT_TIMEOUT,
): Promise<void> => {
  await waitFor(element(by.id(testID)).atIndex(index)).toBeVisible().withTimeout(timeout);
  await element(by.id(testID)).atIndex(index).tap();
};

export const tapText = async (
  text: string,
  timeout = DEFAULT_TIMEOUT,
): Promise<void> => {
  await waitFor(element(by.text(text))).toBeVisible().withTimeout(timeout);
  await element(by.text(text)).tap();
};

export const maybeTapId = async (
  testID: string,
  timeout = 1500,
): Promise<boolean> => {
  try {
    await tapId(testID, timeout);
    return true;
  } catch {
    return false;
  }
};

export const maybeTapText = async (
  text: string,
  timeout = 1500,
): Promise<boolean> => {
  try {
    await tapText(text, timeout);
    return true;
  } catch {
    return false;
  }
};

export const replaceText = async (
  testID: string,
  value: string,
): Promise<void> => {
  await waitForId(testID);
  await element(by.id(testID)).tap();
  await element(by.id(testID)).replaceText(value);

  if (device.getPlatform() === "ios") {
    try {
      await element(by.id(testID)).tapReturnKey();
    } catch {
      // Some keyboards do not expose a return key in Detox.
    }
  }
};

export const expectIdText = async (
  testID: string,
  value: string,
): Promise<void> => {
  await waitForId(testID);
  await expect(element(by.id(testID))).toHaveText(value);
};

export const expectIdNotText = async (
  testID: string,
  value: string,
): Promise<void> => {
  await waitForId(testID);
  await expect(element(by.id(testID))).not.toHaveText(value);
};

export const enterNumericValue = async (
  fieldTestID: string,
  value: string,
): Promise<void> => {
  await tapId(fieldTestID);
  await waitForId("numeric-keypad-display");
  await maybeTapId("numeric-keypad-clear", 500);

  for (const character of value) {
    if (character === ".") {
      await tapId("numeric-keypad-key-decimal", 5000);
      continue;
    }

    if (character === "0") {
      await tapId("numeric-keypad-key-0", 5000);
      continue;
    }

    await tapId(`numeric-keypad-key-${character}`, 5000);
  }

  await tapId("numeric-keypad-confirm");
};

export const skipRestTimerIfVisible = async (): Promise<void> => {
  await maybeTapId("rest-timer-skip", 2000);
};

export const confirmAlert = async (buttonText: string): Promise<void> => {
  await tapText(buttonText, 8000);
};

export const pause = async (durationMs: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
