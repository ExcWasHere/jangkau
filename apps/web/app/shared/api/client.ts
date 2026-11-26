import { publicEnv } from "~/shared/lib/env";

/**
 * Klien HTTP tunggal ke Hono API. Token Supabase dilampirkan bila ada.
 *
 * `ApiError` membawa `status` supaya pemanggil bisa membedakan kegagalan
 * permanen (4xx) dari yang layak dicoba ulang (5xx / jaringan) — penting
 * untuk antrean laporan offline.
 */
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

type ApiErrorBody = { error?: { code?: string; message?: string } };

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
