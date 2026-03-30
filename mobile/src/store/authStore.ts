import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { WeightUnit } from "../constants/enums";
import type { AppLanguage } from "./settingsStore";
import { useSettingsStore } from "./settingsStore";

export interface AuthUserInfo {
  id: string;
  email: string;
  nickname: string;
  weight_unit: WeightUnit;
  language: AppLanguage;
  role: string;
}

export interface AuthSessionPayload {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user?: AuthUserInfo;
}

interface AuthState {
  accessToken: string | null;
  expiresIn: number | null;
  hasHydrated: boolean;
  refreshToken: string | null;
  setHasHydrated: (value: boolean) => void;
  user: AuthUserInfo | null;
  setSession: (payload: AuthSessionPayload) => void;
  setUser: (user: AuthUserInfo | null) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      expiresIn: null,
      hasHydrated: false,
      user: null,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      setSession: (payload) => {
        if (payload.user) {
          useSettingsStore.getState().applyProfilePreferences({
            weightUnit: payload.user.weight_unit,
            language: payload.user.language,
          });
        }

        set({
          accessToken: payload.access_token,
          refreshToken: payload.refresh_token,
          expiresIn: payload.expires_in,
          user: payload.user ?? null,
        });
      },
      setUser: (user) => {
        if (user) {
          useSettingsStore.getState().applyProfilePreferences({
            weightUnit: user.weight_unit,
            language: user.language,
          });
        }

        set({ user });
      },
      clearSession: () =>
        set({
          accessToken: null,
          refreshToken: null,
          expiresIn: null,
          user: null,
        }),
    }),
    {
      name: "auth-store",
      onRehydrateStorage: () => () => {
        useAuthStore.getState().setHasHydrated(true);
      },
      partialize: (state) => ({
        accessToken: state.accessToken,
        expiresIn: state.expiresIn,
        refreshToken: state.refreshToken,
        user: state.user,
      }),
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
