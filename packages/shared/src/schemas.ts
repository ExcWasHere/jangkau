import { z } from "zod";

import {
  ALLOWED_DOCUMENT_TYPES,
  ALLOWED_IMAGE_TYPES,
  CAMPAIGN_STATUSES,
  MEDIA_KINDS,
  MAX_UPLOAD_BYTES,
  NEED_CATEGORIES,
  REPORT_STATUSES,
  SEVERITY_LEVELS,
  STOCK_REASONS,
} from "./enums.js";

/** Koordinat WGS84 dari perangkat. */
export const coordinateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().nonnegative().max(100_000).optional(),
});

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().uuid().optional(),
});

// Key R2 berbentuk `<prefix>/<scope>/[<user>/]<uuid>.<ext>`; hanya karakter
// aman yang diizinkan supaya tidak ada path traversal lewat body request.
const mediaKeySchema = z
  .string()
  .min(1)
  .max(512)
  .regex(
    /^[a-z0-9-]+(\/[A-Za-z0-9-]+){1,3}\/[A-Za-z0-9._-]+$/,
    "format key R2 tidak valid",
  );

/**
 * Body `POST /api/v1/reports`.
 * `clientUuid` dibuat di perangkat dan dipakai sebagai kunci idempotensi,
 * sehingga retry dari antrean offline tidak pernah membuat duplikat.
 */
export const createReportSchema = z
  .object({
    clientUuid: z.string().uuid(),
    postId: z.string().uuid(),
    bodyText: z.string().trim().min(10).max(2000).optional(),
    transcript: z.string().trim().min(1).max(2000).optional(),
    category: z.enum(NEED_CATEGORIES).optional(),
    severity: z.enum(SEVERITY_LEVELS).default("medium"),
    headcountDelta: z.number().int().min(-5000).max(5000).optional(),
    location: coordinateSchema,
    capturedAt: z.iso.datetime({ offset: true }),
    media: z
      .array(
        z.object({
          key: mediaKeySchema,
          mimeType: z.string().max(100),
          sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
        }),
      )
      .max(5)
      .default([]),
  })
  .refine((v) => Boolean(v.bodyText || v.transcript), {
    message: "Isi teks atau rekaman suara",
    path: ["bodyText"],
  });

export type CreateReportInput = z.infer<typeof createReportSchema>;

export const reportListQuerySchema = paginationSchema.extend({
  postId: z.string().uuid().optional(),
  status: z.enum(REPORT_STATUSES).optional(),
  /** `1` = hanya laporan milik pemanggil (dipakai halaman "Laporan saya"). */
  mine: z
    .enum(["0", "1"])
    .default("0")
    .transform((value) => value === "1"),
});

export const presignSchema = z.object({
  kind: z.enum(MEDIA_KINDS),
  contentType: z.string(),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  scopeId: z.string().uuid().optional(),
});

export type PresignInput = z.infer<typeof presignSchema>;

export function isAllowedContentType(kind: string, contentType: string): boolean {
  const allow: readonly string[] =
    kind === "org_document" || kind === "receipt"
      ? [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOCUMENT_TYPES]
      : ALLOWED_IMAGE_TYPES;
  return allow.includes(contentType);
}

export const budgetItemSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.enum(NEED_CATEGORIES).default("other"),
  quantity: z.number().positive().max(1_000_000),
  unit: z.string().trim().min(1).max(20),
  unitCost: z.number().nonnegative().max(1_000_000_000),
  note: z.string().trim().max(300).optional(),
});

export const createCampaignSchema = z.object({
  reportId: z.string().uuid(),
  title: z.string().trim().min(5).max(140),
  summary: z.string().trim().max(1000).optional(),
  items: z.array(budgetItemSchema).min(1).max(50),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const createDonationSchema = z.object({
  amount: z.number().positive().max(1_000_000_000),
  donorName: z.string().trim().max(80).optional(),
  anonymous: z.boolean().default(false),
});

export const stockMovementSchema = z.object({
  stockItemId: z.string().uuid(),
  delta: z.number().refine((v) => v !== 0, "delta tidak boleh 0"),
  reason: z.enum(STOCK_REASONS),
  refReportId: z.string().uuid().optional(),
  refTrancheId: z.string().uuid().optional(),
  note: z.string().trim().max(300).optional(),
});

export type StockMovementInput = z.infer<typeof stockMovementSchema>;

export const campaignStatusSchema = z.enum(CAMPAIGN_STATUSES);

/** Bentuk error seragam dari API. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
