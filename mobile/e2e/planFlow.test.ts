import { by, element, expect } from "detox";

import {
  createPlanWithExercise,
  expectTextVisible,
  openTab,
} from "./helpers/flows";
import { maybeTapId, replaceText, tapId, tapText, waitForId } from "./helpers/app";

describe("计划管理流程", () => {
  test("创建计划→添加Day→添加动作→保存", async () => {
    await createPlanWithExercise("计划流程测试", "胸日", "杠铃卧推");

    await waitForId("plan-list-screen");
    await expectTextVisible("计划流程测试");
  });

  test("从模板创建计划", async () => {
    await openTab("plans");
    await tapId("plan-list-template-button");
    await waitForId("template-list-screen");
    await tapText("PPL 3天");
    await tapText("使用此模板");
    await waitForId("plan-editor-screen");
    await expect(element(by.text("Push"))).toBeVisible();
    await expect(element(by.text("Pull"))).toBeVisible();
    await expect(element(by.text("Legs"))).toBeVisible();
  });

  test("编辑计划→修改动作→保存", async () => {
    await createPlanWithExercise("编辑计划测试", "胸日", "杠铃卧推");

    await tapText("编辑计划测试");
    await waitForId("plan-editor-screen");
    await tapId("plan-editor-add-exercise-button");
    await waitForId("exercise-picker-modal");
    await replaceText("search-bar-input", "上斜杠铃卧推");
    await tapText("上斜杠铃卧推");
    await tapId("exercise-picker-confirm");
    await tapId("plan-editor-save-plan-button");
    await tapId("plan-editor-back-button");

    await tapText("编辑计划测试");
    await waitForId("plan-editor-screen");
    await expect(element(by.text("上斜杠铃卧推"))).toBeVisible();

    if (await maybeTapId("plan-editor-back-button", 1000)) {
      await waitForId("plan-list-screen");
    }
  });
});
