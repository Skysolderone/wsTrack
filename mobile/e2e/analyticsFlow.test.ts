import { by, element, expect } from "detox";

import {
  createAndSaveSimpleWorkout,
  openFirstHistoryWorkout,
  openTab,
} from "./helpers/flows";
import { expectIdNotText, expectIdText, waitForId } from "./helpers/app";

describe("数据分析流程", () => {
  test("训练后 Dashboard 数据更新", async () => {
    await createAndSaveSimpleWorkout("杠铃卧推", [{ weight: "100", reps: "10" }]);

    await openTab("analytics");
    await waitForId("analytics-screen");
    await expectIdText("analytics-weekly-workout-count-value", "1");
    await expectIdNotText("analytics-weekly-volume-value", "0");
  });

  test("训练历史列表显示", async () => {
    await createAndSaveSimpleWorkout("杠铃卧推", [{ weight: "100", reps: "10" }]);

    await openFirstHistoryWorkout();
    await expect(element(by.text("训练截图分享"))).toBeVisible();
    await expect(element(by.text("Duration"))).toBeVisible();
  });
});
