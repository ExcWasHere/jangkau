import { publicEnv } from "./env";

type ApiErrorBody = { error?: { code?: string; message?: string } };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Satu pintu ke Hono API. Token Supabase dilampirkan bila ada;
 * error server dipetakan ke ApiError agar bisa ditampilkan apa adanya.
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, headers, ...rest } = init;

  const response = await fetch(`${publicEnv.apiBaseUrl}${path}`, {
    ...rest,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    throw new ApiError(
      response.status,
      body.error?.code ?? "unknown",
      body.error?.message ?? `Permintaan gagal (${response.status})`,
    );
  }

  return (await response.json()) as T;
}
