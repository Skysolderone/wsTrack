import { device, expect } from "detox";

import {
  createCloudTestCredentials,
  fetchRemoteWorkoutCount,
  getSyncApiBaseURL,
  isCloudSyncTestEnabled,
} from "./helpers/cloud";
import {
  createAndSaveSimpleWorkout,
  openAccountScreen,
  openTab,
  signUpInApp,
} from "./helpers/flows";
import { expectIdText, tapId, waitForId } from "./helpers/app";

const describeIfSyncEnabled = isCloudSyncTestEnabled ? describe : describe.skip;

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const setURLBlacklist = async (patterns: string[]): Promise<void> => {
  const controllableDevice = device as typeof device & {
    setURLBlacklist?: (nextPatterns: string[]) => Promise<void>;
  };

  if (typeof controllableDevice.setURLBlacklist !== "function") {
    throw new Error("Current Detox runtime does not support device.setURLBlacklist().");
  }

  await controllableDevice.setURLBlacklist(patterns);
};

describeIfSyncEnabled("云同步流程", () => {
  test("注册→登录→数据同步", async () => {
    const credentials = createCloudTestCredentials();

    await createAndSaveSimpleWorkout("杠铃卧推", [{ weight: "100", reps: "10" }]);
    await signUpInApp(credentials);
    await openAccountScreen();
    await waitForId("profile-screen");
    await tapId("profile-sync-button");
    await expectIdText("profile-pending-count-value", "0");

    const remoteWorkoutCount = await fetchRemoteWorkoutCount(credentials);
    expect(remoteWorkoutCount).toBeGreaterThan(0);
  });

  test("离线训练→恢复网络→自动同步", async () => {
    const credentials = createCloudTestCredentials();

    await signUpInApp(credentials);

    const apiBaseURL = getSyncApiBaseURL();
    const blockedPattern = escapeRegExp(apiBaseURL);
    await setURLBlacklist([blockedPattern]);

    await createAndSaveSimpleWorkout("哑铃弯举", [{ weight: "20", reps: "12" }]);

    await setURLBlacklist([]);
    await device.sendToHome();
    await device.launchApp({
      delete: false,
      newInstance: false,
    });

    await openTab("settings");
    await tapId("settings-account-button");
    await waitForId("profile-screen");
    await expectIdText("profile-pending-count-value", "0");

    const remoteWorkoutCount = await fetchRemoteWorkoutCount(credentials);
    expect(remoteWorkoutCount).toBeGreaterThan(0);
  });
});
