import Config from "react-native-config";

export class SupabaseRequestError extends Error {
  details?: unknown;
  status: number;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "SupabaseRequestError";
    this.status = status;
    this.details = details;
  }
}

const supabaseUrl = Config.SUPABASE_URL ?? "";
const supabaseAnonKey = Config.SUPABASE_ANON_KEY ?? "";

const ensureSupabaseConfigured = (): void => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new SupabaseRequestError("Supabase 环境变量未配置", 0);
  }
};

const buildHeaders = (headers?: HeadersInit): HeadersInit => ({
  "Content-Type": "application/json",
  apikey: supabaseAnonKey,
  Authorization: `Bearer ${supabaseAnonKey}`,
  ...headers,
});

export const supabaseRequest = async <T>(
  path: string,
  init?: RequestInit,
): Promise<T> => {
  ensureSupabaseConfigured();

  const response = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: buildHeaders(init?.headers),
  });

  const text = await response.text();
  const payload = text.length > 0 ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    throw new SupabaseRequestError(
      typeof payload === "object" &&
        payload !== null &&
        "message" in payload &&
        typeof payload.message === "string"
        ? payload.message
        : "Supabase 请求失败",
      response.status,
      payload,
    );
  }

  return payload as T;
};
