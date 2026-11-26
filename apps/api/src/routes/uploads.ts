import { Hono } from "hono";

import { presignSchema, isAllowedContentType } from "@jangkau/shared";

import type { AppEnv } from "../env.js";
import { badRequest } from "../lib/errors.js";
import { presignPut } from "../lib/r2.js";

import { requireAuth } from "../middleware/auth.js";

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export const uploadRoutes = new Hono<AppEnv>();

uploadRoutes.use("*", requireAuth);

/**
 * Client meminta URL PUT, mengunggah langsung ke R2, lalu mengirim
 * `key` hasilnya ke endpoint domain (mis. POST /reports).
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

  const id = crypto.randomUUID();
  const key = buildKeyFor(kind, user.id, scopeId, `${id}.${ext}`);

  return c.json({
    key,
    putUrl: await presignPut(c.env, key, contentType),
    expiresIn: 300,
    maxBytes: sizeBytes,
  });
});

function buildKeyFor(
  kind: string,
  userId: string,
  scopeId: string | undefined,
  filename: string,
): string {
  switch (kind) {
    case "report_photo":
      if (!scopeId) throw badRequest("scope_required", "scopeId (postId) wajib untuk foto laporan");
      return `reports/${scopeId}/${userId}/${filename}`;
    case "receipt":
      if (!scopeId) throw badRequest("scope_required", "scopeId (trancheId) wajib untuk bukti");
      return `receipts/${scopeId}/${filename}`;
    case "org_document":
      return `org-docs/${userId}/${filename}`;
    case "campaign_photo":
      if (!scopeId) throw badRequest("scope_required", "scopeId (campaignId) wajib");
      return `campaigns/${scopeId}/${filename}`;
    case "avatar":
      return `avatars/${userId}/${filename}`;
    default:
      throw badRequest("unsupported_kind", `Jenis media ${kind} tidak dikenali`);
  }
}
