import axios, {
  AxiosError,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";

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

export interface AuthUserInfo {
  id: string;
  email: string;
  nickname: string;
  weight_unit: string;
  language: string;
  role: string;
}

export interface AuthResponsePayload {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user?: AuthUserInfo;
}

export interface ApiErrorPayload {
  status: number;
  code: number;
  message: string;
  details?: unknown;
  raw?: unknown;
}

export interface ApiAuthAdapter {
  getAccessToken: () => string | null | undefined;
  getRefreshToken: () => string | null | undefined;
  setAuthResponse: (payload: AuthResponsePayload) => void | Promise<void>;
  clearAuth: () => void | Promise<void>;
}

export interface ZustandStoreLike<TState> {
  getState: () => TState;
}

export interface ZustandAuthSelectors<TState> {
  getAccessToken: (state: TState) => string | null | undefined;
  getRefreshToken: (state: TState) => string | null | undefined;
  setAuthResponse: (state: TState, payload: AuthResponsePayload) => void | Promise<void>;
  clearAuth: (state: TState) => void | Promise<void>;
}

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
  skipAuthRefresh?: boolean;
};

let authAdapter: ApiAuthAdapter | null = null;
let unauthorizedHandler: (() => void | Promise<void>) | null = null;
let isRefreshing = false;
let refreshQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: ApiErrorPayload) => void;
}> = [];

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  process.env.API_BASE_URL ??
  process.env.REACT_APP_API_BASE_URL ??
  "";

const apiConfig: AxiosRequestConfig = {
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
};

const api = axios.create(apiConfig);
const refreshClient = axios.create(apiConfig);

export const setApiAuthAdapter = (adapter: ApiAuthAdapter | null) => {
  authAdapter = adapter;
};

export const setUnauthorizedHandler = (handler: (() => void | Promise<void>) | null) => {
  unauthorizedHandler = handler;
};

export const bindZustandAuthStore = <TState>(
  store: ZustandStoreLike<TState>,
  selectors: ZustandAuthSelectors<TState>,
) => {
  setApiAuthAdapter({
    getAccessToken: () => selectors.getAccessToken(store.getState()),
    getRefreshToken: () => selectors.getRefreshToken(store.getState()),
    setAuthResponse: (payload) => selectors.setAuthResponse(store.getState(), payload),
    clearAuth: () => selectors.clearAuth(store.getState()),
  });
};

api.interceptors.request.use(
  async (config) => {
    const requestConfig = config as RetryableRequestConfig;
    const accessToken = authAdapter?.getAccessToken();

    if (accessToken) {
      const headers = requestConfig.headers;
      headers?.set?.("Authorization", `Bearer ${accessToken}`);
      if (!headers?.get?.("Authorization") && headers) {
        headers.Authorization = `Bearer ${accessToken}`;
      }
    }

    return requestConfig;
  },
  async (error) => Promise.reject(normalizeApiError(error)),
);

api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError<ApiResponse<unknown>>) => {
    const requestConfig = error.config as RetryableRequestConfig | undefined;
    const status = error.response?.status;

    if (!shouldRefreshToken(status, requestConfig)) {
      return Promise.reject(normalizeApiError(error));
    }

    const refreshToken = authAdapter?.getRefreshToken();
    if (!refreshToken) {
      await handleUnauthorized();
      return Promise.reject(normalizeApiError(error));
    }

    if (isRefreshing) {
      try {
        const nextToken = await enqueueRefresh();
        attachBearerToken(requestConfig, nextToken);
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
      const normalizedError = normalizeApiError(refreshError);
      rejectRefreshQueue(normalizedError);
      await handleUnauthorized();
      return Promise.reject(normalizedError);
    } finally {
      isRefreshing = false;
    }
  },
);

export const extractApiData = <T>(response: AxiosResponse<ApiResponse<T>>) => response.data.data;

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

async function performTokenRefresh(refreshToken: string): Promise<string> {
  const response = await refreshClient.post<ApiResponse<AuthResponsePayload>>(
    AUTH.REFRESH,
    { refresh_token: refreshToken },
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  const payload = response.data.data;
  if (!payload?.access_token || !payload?.refresh_token) {
    throw {
      status: 401,
      code: 40100,
      message: "Refresh token response is invalid",
      details: response.data,
    } satisfies ApiErrorPayload;
  }

  await authAdapter?.setAuthResponse(payload);
  return payload.access_token;
}

function shouldRefreshToken(
  status: number | undefined,
  requestConfig?: RetryableRequestConfig,
): boolean {
  if (status !== 401 || !requestConfig) {
    return false;
  }

  if (requestConfig._retry || requestConfig.skipAuthRefresh) {
    return false;
  }

  return !isRefreshEndpointRequest(requestConfig.url);
}

function isRefreshEndpointRequest(url?: string): boolean {
  if (!url) {
    return false;
  }

  return url.includes(AUTH.REFRESH);
}

function attachBearerToken(config: RetryableRequestConfig, accessToken: string) {
  const headers = config.headers;
  headers?.set?.("Authorization", `Bearer ${accessToken}`);
  if (!headers?.get?.("Authorization") && headers) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
}

function enqueueRefresh(): Promise<string> {
  return new Promise((resolve, reject) => {
    refreshQueue.push({ resolve, reject });
  });
}

function resolveRefreshQueue(accessToken: string) {
  for (const item of refreshQueue) {
    item.resolve(accessToken);
  }
  refreshQueue = [];
}

function rejectRefreshQueue(error: ApiErrorPayload) {
  for (const item of refreshQueue) {
    item.reject(error);
  }
  refreshQueue = [];
}

async function handleUnauthorized() {
  await authAdapter?.clearAuth();
  await unauthorizedHandler?.();
}

function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "message" in value && "code" in value;
}

export { API_BASE_URL, api };

export default api;
