import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Error yang aman ditampilkan ke client; pesan internal tidak bocor. */
export class AppError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (code: string, message: string, details?: unknown) =>
  new AppError(400, code, message, details);

export const unauthorized = (message = "Sesi tidak valid atau sudah kedaluwarsa") =>
  new AppError(401, "unauthorized", message);

export const forbidden = (message = "Tidak punya akses untuk aksi ini") =>
  new AppError(403, "forbidden", message);

export const notFound = (message = "Data tidak ditemukan") =>
  new AppError(404, "not_found", message);

export const conflict = (code: string, message: string, details?: unknown) =>
  new AppError(409, code, message, details);

export const unprocessable = (code: string, message: string, details?: unknown) =>
  new AppError(422, code, message, details);
