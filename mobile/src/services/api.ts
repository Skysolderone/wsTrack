import axios, {
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";
import Config from "react-native-config";

import { resetToLogin } from "../navigation/navigationRef";
import { useAuthStore, type AuthSessionPayload } from "../store/authStore";
import { AUTH } from "./apiEndpoints";

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export interface PaginationMeta {
  total: number;
  page: number;
  page_size: number;
}

export interface PagedResponse<T> {
  items: T[];
  pagination: PaginationMeta;
}

export interface ApiErrorPayload {
  status: number;
  code: number;
  message: string;
  details?: unknown;
  raw?: unknown;
}

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
  skipAuthRefresh?: boolean;
};

interface RefreshQueueEntry {
  resolve: (token: string) => void;
  reject: (error: ApiErrorPayload) => void;
}

const apiBaseURL = Config.API_BASE_URL ?? "";

const defaultHeaders = {
  Accept: "application/json",
  "Content-Type": "application/json",
};

export const api = axios.create({
  baseURL: apiBaseURL,
  timeout: 15000,
  headers: defaultHeaders,
});

const refreshClient = axios.create({
  baseURL: apiBaseURL,
  timeout: 15000,
  headers: defaultHeaders,
});

let isRefreshing = false;
let refreshQueue: RefreshQueueEntry[] = [];

api.interceptors.request.use((requestConfig) => {
  const accessToken = useAuthStore.getState().accessToken;

  if (accessToken) {
    attachBearerToken(requestConfig, accessToken);
  }

  return requestConfig;
});

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    const normalizedError = normalizeApiError(error);

    if (!axios.isAxiosError<ApiResponse<unknown>>(error)) {
      return Promise.reject(normalizedError);
    }

    const requestConfig = error.config as RetryableRequestConfig | undefined;
    if (!shouldRefreshToken(error.response?.status, requestConfig)) {
      return Promise.reject(normalizedError);
    }

    if (!requestConfig) {
      handleUnauthorized();
      return Promise.reject(normalizedError);
    }

    const refreshToken = useAuthStore.getState().refreshToken;
    if (!refreshToken) {
      handleUnauthorized();
      return Promise.reject(normalizedError);
    }

    if (isRefreshing) {
      try {
        const token = await enqueueRefresh();
        attachBearerToken(requestConfig, token);
        return api(requestConfig);
      } catch (refreshError) {
        return Promise.reject(normalizeApiError(refreshError));
      }
    }

    requestConfig._retry = true;
    isRefreshing = true;

    try {
      const nextToken = await performTokenRefresh(refreshToken);
      resolveRefreshQueue(nextToken);
      attachBearerToken(requestConfig, nextToken);
      return api(requestConfig);
    } catch (refreshError) {
      const refreshApiError = normalizeApiError(refreshError);
      rejectRefreshQueue(refreshApiError);
      handleUnauthorized();
      return Promise.reject(refreshApiError);
    } finally {
      isRefreshing = false;
    }
  },
);

export const extractApiData = <T>(response: AxiosResponse<ApiResponse<T>>): T => response.data.data;

export const normalizeApiError = (error: unknown): ApiErrorPayload => {
  if (isApiErrorPayload(error)) {
    return error;
  }

  if (axios.isAxiosError<ApiResponse<unknown>>(error)) {
    return {
      status: error.response?.status ?? 0,
      code: typeof error.response?.data?.code === "number" ? error.response.data.code : -1,
      message:
        error.response?.data?.message ??
        error.message ??
        "Unexpected network error",
      details: error.response?.data,
      raw: error,
    };
  }

  if (error instanceof Error) {
    return {
      status: 0,
      code: -1,
      message: error.message,
      raw: error,
    };
  }

  return {
    status: 0,
    code: -1,
    message: "Unknown error",
    raw: error,
  };
};

const attachBearerToken = (
  requestConfig: InternalAxiosRequestConfig,
  token: string,
): void => {
  const headers = AxiosHeaders.from(requestConfig.headers);
  headers.set("Authorization", `Bearer ${token}`);
  requestConfig.headers = headers;
};

const enqueueRefresh = (): Promise<string> =>
  new Promise((resolve, reject) => {
    refreshQueue.push({ resolve, reject });
  });

const resolveRefreshQueue = (token: string): void => {
  refreshQueue.forEach((entry) => entry.resolve(token));
  refreshQueue = [];
};

const rejectRefreshQueue = (error: ApiErrorPayload): void => {
  refreshQueue.forEach((entry) => entry.reject(error));
  refreshQueue = [];
};

const handleUnauthorized = (): void => {
  useAuthStore.getState().clearSession();
  resetToLogin();
};

const shouldRefreshToken = (
  status: number | undefined,
  requestConfig?: RetryableRequestConfig,
): boolean => {
  if (status !== 401 || !requestConfig) {
    return false;
  }

  if (requestConfig._retry || requestConfig.skipAuthRefresh) {
    return false;
  }

  return !isRefreshEndpointRequest(requestConfig.url);
};

const isRefreshEndpointRequest = (url?: string): boolean =>
  typeof url === "string" && url.includes(AUTH.REFRESH);

const isApiErrorPayload = (value: unknown): value is ApiErrorPayload => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  return "status" in value && "code" in value && "message" in value;
};

const performTokenRefresh = async (refreshToken: string): Promise<string> => {
  const response = await refreshClient.post<ApiResponse<AuthSessionPayload>>(
    AUTH.REFRESH,
    {
      refresh_token: refreshToken,
    },
  );

  const payload = response.data.data;
  if (!payload.access_token || !payload.refresh_token) {
    throw {
      status: 401,
      code: 40100,
      message: "Refresh token response is invalid",
      details: response.data,
    } satisfies ApiErrorPayload;
  }

  useAuthStore.getState().setSession(payload);

  return payload.access_token;
};

export default api;
