import { Hono } from "hono";

import { isAllowedContentType, presignSchema } from "@jangkau/shared";

import type { AppEnv } from "../../env.js";
import { badRequest } from "../../shared/errors.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { presignPut } from "../../shared/r2.js";

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export const uploadRoutes = new Hono<AppEnv>();

uploadRoutes.use("*", requireAuth);

/**
 * Client meminta URL PUT, mengunggah langsung ke R2, lalu mengirim `key`
 * hasilnya ke endpoint domain (mis. `POST /posts`).
 *
 * Bucket dipilih per jenis: foto post, struk, dan avatar masuk bucket publik
 * supaya bisa disajikan lewat CDN; dokumen verifikasi penyalur masuk bucket
 * privat dan hanya dibaca admin lewat signed URL.
 */
uploadRoutes.post("/presign", async (c) => {
  const user = c.get("user");
  const parsed = presignSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw badRequest("invalid_body", "Permintaan presign tidak valid", parsed.error.issues);
  }

  const { kind, contentType, sizeBytes, scopeId } = parsed.data;
  if (!isAllowedContentType(kind, contentType)) {
    throw badRequest("unsupported_type", `Tipe ${contentType} tidak diizinkan untuk ${kind}`);
  }

  const ext = EXT_BY_TYPE[contentType];
  if (!ext) throw badRequest("unsupported_type", "Tipe file tidak dikenali");

  const filename = `${crypto.randomUUID()}.${ext}`;
  const key = buildKey(kind, user.id, scopeId, filename);
  const bucket = kind === "verification_doc" ? c.env.R2_BUCKET : c.env.R2_PUBLIC_BUCKET;

  return c.json({
    key,
    putUrl: await presignPut(c.env, bucket, key, contentType),
    publicUrl: kind === "verification_doc" ? null : `${c.env.R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`,
    expiresIn: 300,
    maxBytes: sizeBytes,
  });
});

function buildKey(
  kind: string,
  userId: string,
  scopeId: string | undefined,
  filename: string,
): string {
  const month = new Date().toISOString().slice(0, 7).replace("-", "/");

  switch (kind) {
    case "post_photo":
      return `posts/${month}/${userId}/${filename}`;
    case "receipt":
      if (!scopeId) throw badRequest("scope_required", "scopeId (pencairan) wajib untuk struk");
      return `receipts/${scopeId}/${filename}`;
    case "verification_doc":
      return `verification/${userId}/${filename}`;
    case "avatar":
      return `avatars/${userId}/${filename}`;
    default:
      throw badRequest("unsupported_kind", `Jenis media ${kind} tidak dikenali`);
  }
}
