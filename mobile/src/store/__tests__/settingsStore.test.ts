import AsyncStorage from "@react-native-async-storage/async-storage";

import { WeightUnit } from "../../constants/enums";
import { useSettingsStore } from "../settingsStore";

const initialSettingsState = useSettingsStore.getState();

describe("settingsStore", () => {
  beforeEach(async () => {
    useSettingsStore.setState(initialSettingsState, true);
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  test("默认值：weightUnit=kg, language=zh", () => {
    const state = useSettingsStore.getState();

    expect(state.weightUnit).toBe(WeightUnit.KG);
    expect(state.language).toBe("zh");
    expect(state.defaultRestSeconds).toBe(90);
  });

  test("切换 weightUnit 到 lbs", () => {
    useSettingsStore.getState().setWeightUnit(WeightUnit.LBS);

    expect(useSettingsStore.getState().weightUnit).toBe(WeightUnit.LBS);
  });

  test("切换 language 到 en", () => {
    useSettingsStore.getState().setLanguage("en");

    expect(useSettingsStore.getState().language).toBe("en");
  });

  test("设置 defaultRestSeconds", () => {
    useSettingsStore.getState().setDefaultRestSeconds(135.4);

    expect(useSettingsStore.getState().defaultRestSeconds).toBe(135);
  });
});
