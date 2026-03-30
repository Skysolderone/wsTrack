import AsyncStorage from "@react-native-async-storage/async-storage";
import { findBestLanguageTag } from "react-native-localize";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { WeightUnit } from "../constants/enums";

export type AppLanguage = "zh" | "en";

const detectLanguage = (): AppLanguage =>
  findBestLanguageTag(["zh", "en"])?.languageTag === "zh" ? "zh" : "en";

interface SettingsState {
  defaultRestSeconds: number;
  healthKitEnabled: boolean;
  language: AppLanguage;
  setHealthKitEnabled: (enabled: boolean) => void;
  weightUnit: WeightUnit;
  setWeightUnit: (weightUnit: WeightUnit) => void;
  setDefaultRestSeconds: (seconds: number) => void;
  setLanguage: (language: AppLanguage) => void;
  applyProfilePreferences: (input: {
    weightUnit?: WeightUnit;
    language?: AppLanguage;
  }) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      weightUnit: WeightUnit.KG,
      defaultRestSeconds: 90,
      healthKitEnabled: false,
      language: detectLanguage(),
      setWeightUnit: (weightUnit) => set({ weightUnit }),
      setDefaultRestSeconds: (seconds) =>
        set({
          defaultRestSeconds: Math.max(0, Math.round(seconds)),
        }),
      setHealthKitEnabled: (enabled) => set({ healthKitEnabled: enabled }),
      setLanguage: (language) => set({ language }),
      applyProfilePreferences: ({ weightUnit, language }) =>
        set((state) => ({
          weightUnit: weightUnit ?? state.weightUnit,
          language: language ?? state.language,
        })),
    }),
    {
      name: "settings-store",
      partialize: (state) => ({
        defaultRestSeconds: state.defaultRestSeconds,
        healthKitEnabled: state.healthKitEnabled,
        language: state.language,
        weightUnit: state.weightUnit,
      }),
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
