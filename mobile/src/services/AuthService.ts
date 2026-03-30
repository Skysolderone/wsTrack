import { Platform } from "react-native";
import { appleAuth } from "@invertase/react-native-apple-authentication";

import { resetToLogin } from "../navigation/navigationRef";
import { useAuthStore, type AuthSessionPayload, type AuthUserInfo } from "../store/authStore";
import { api, extractApiData } from "./api";
import { AUTH } from "./apiEndpoints";
import { fullSync } from "./SyncService";

interface AuthStateSnapshot {
  isAuthenticated: boolean;
  user: AuthUserInfo | null;
}

interface AppleLoginRequestPayload {
  authorization_code: string | null;
  email: string | null;
  full_name: string | null;
  identity_token: string;
  user: string | null;
}

const applySession = async (payload: AuthSessionPayload): Promise<AuthUserInfo | null> => {
  useAuthStore.getState().setSession(payload);
  try {
    await fullSync();
  } catch {
    // Keep sign-in successful even if the first sync attempt cannot complete yet.
  }
  return payload.user ?? null;
};

const buildApplePayload = async (): Promise<AppleLoginRequestPayload> => {
  if (Platform.OS !== "ios") {
    throw new Error("Apple 登录仅在 iOS 可用");
  }

  const appleCredential = await appleAuth.performRequest({
    requestedOperation: appleAuth.Operation.LOGIN,
    requestedScopes: [appleAuth.Scope.EMAIL, appleAuth.Scope.FULL_NAME],
  });

  if (!appleCredential.identityToken) {
    throw new Error("Apple 登录未返回 identity token");
  }

  const fullName = [appleCredential.fullName?.familyName, appleCredential.fullName?.givenName]
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .join("");

  return {
    authorization_code: appleCredential.authorizationCode ?? null,
    email: appleCredential.email ?? null,
    full_name: fullName.length > 0 ? fullName : null,
    identity_token: appleCredential.identityToken,
    user: appleCredential.user ?? null,
  };
};

export const signUp = async (
  email: string,
  password: string,
): Promise<AuthUserInfo | null> => {
  const response = await api.post(AUTH.REGISTER, {
    email: email.trim(),
    password,
  });

  return applySession(extractApiData<AuthSessionPayload>(response));
};

export const signIn = async (
  email: string,
  password: string,
): Promise<AuthUserInfo | null> => {
  const response = await api.post(AUTH.LOGIN, {
    email: email.trim(),
    password,
  });

  return applySession(extractApiData<AuthSessionPayload>(response));
};

export const signInWithApple = async (): Promise<AuthUserInfo | null> => {
  const response = await api.post(AUTH.APPLE, await buildApplePayload());
  return applySession(extractApiData<AuthSessionPayload>(response));
};

export const signOut = async (): Promise<void> => {
  useAuthStore.getState().clearSession();
  resetToLogin();
};

export const getCurrentUser = async (): Promise<AuthUserInfo | null> => {
  const accessToken = useAuthStore.getState().accessToken;
  if (!accessToken) {
    return null;
  }

  const response = await api.get(AUTH.PROFILE);
  const user = extractApiData<AuthUserInfo>(response);
  useAuthStore.getState().setUser(user);
  return user;
};

export const onAuthStateChange = (
  callback: (state: AuthStateSnapshot) => void,
): (() => void) => {
  const emit = (): void => {
    const state = useAuthStore.getState();
    callback({
      isAuthenticated: Boolean(state.accessToken),
      user: state.user,
    });
  };

  emit();

  return useAuthStore.subscribe((state, previousState) => {
    if (
      state.accessToken !== previousState.accessToken ||
      state.user !== previousState.user
    ) {
      emit();
    }
  });
};
