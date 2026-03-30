interface Credentials {
  email: string;
  password: string;
}

interface JsonObject {
  [key: string]: unknown;
}

const syncApiBaseURL = process.env.E2E_SYNC_API_BASE_URL ?? "";

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null;

const unwrapApiData = (payload: unknown): unknown => {
  if (isObject(payload) && "data" in payload) {
    return payload.data;
  }

  return payload;
};

const buildURL = (path: string): string => {
  const normalizedBase = syncApiBaseURL.endsWith("/")
    ? syncApiBaseURL.slice(0, -1)
    : syncApiBaseURL;

  return `${normalizedBase}${path}`;
};

const readResponseJson = async (response: Response): Promise<unknown> => {
  const text = await response.text();

  if (!text) {
    return {};
  }

  return JSON.parse(text) as unknown;
};

const extractAccessToken = (payload: unknown): string => {
  const data = unwrapApiData(payload);
  if (!isObject(data) || typeof data.access_token !== "string") {
    throw new Error("Login response did not include access_token.");
  }

  return data.access_token;
};

const extractWorkoutCount = (payload: unknown): number => {
  const data = unwrapApiData(payload);

  if (Array.isArray(data)) {
    return data.length;
  }

  if (!isObject(data)) {
    return 0;
  }

  if (Array.isArray(data.items)) {
    return data.items.length;
  }

  if (isObject(data.pagination) && typeof data.pagination.total === "number") {
    return data.pagination.total;
  }

  if (Array.isArray(data.workouts)) {
    return data.workouts.length;
  }

  return 0;
};

export const isCloudSyncTestEnabled = syncApiBaseURL.length > 0;

export const createCloudTestCredentials = (): Credentials => {
  const suffix = `${Date.now()}-${Math.round(Math.random() * 10000)}`;

  return {
    email: `detox.${suffix}@example.com`,
    password: "Detox12345!",
  };
};

export const fetchRemoteWorkoutCount = async (
  credentials: Credentials,
): Promise<number> => {
  if (!isCloudSyncTestEnabled) {
    throw new Error("E2E_SYNC_API_BASE_URL is required for sync Detox tests.");
  }

  const loginResponse = await fetch(buildURL("/api/v1/auth/login"), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(credentials),
  });
  const loginPayload = await readResponseJson(loginResponse);

  if (!loginResponse.ok) {
    throw new Error(`Cloud login failed with status ${loginResponse.status}.`);
  }

  const accessToken = extractAccessToken(loginPayload);
  const workoutsResponse = await fetch(buildURL("/api/v1/workouts?page=1&page_size=50"), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const workoutsPayload = await readResponseJson(workoutsResponse);

  if (!workoutsResponse.ok) {
    throw new Error(`Cloud workouts query failed with status ${workoutsResponse.status}.`);
  }

  return extractWorkoutCount(workoutsPayload);
};

export const getSyncApiBaseURL = (): string => syncApiBaseURL;
