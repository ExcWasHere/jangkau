import { z } from "zod";

import {
  ALLOWED_DOCUMENT_TYPES,
  ALLOWED_IMAGE_TYPES,
  DISASTER_TYPES,
  FEED_SECTIONS,
  MAX_PHOTOS_PER_POST,
  MAX_UPLOAD_BYTES,
  MEDIA_KINDS,
  MODERATION_REASONS,
  NEED_CATEGORIES,
  RECEIPT_DECISIONS,
  VERIFICATION_DOC_KINDS,
} from "./enums.js";

/** Koordinat WGS84 dari perangkat. */
export const coordinateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().nonnegative().max(100_000).optional(),
});

export type Coordinate = z.infer<typeof coordinateSchema>;

/**
 * Paginasi keyset. `cursor` adalah gabungan waktu aktivitas dan id, di-encode
 * base64 oleh server. Keyset dipilih supaya halaman berikutnya tidak bergeser
 * ketika ada event baru masuk di antara dua permintaan.
 */
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(200).optional(),
});

/**
 * Key R2 berbentuk `<prefix>/<scope>/<nama>.<ext>`; hanya karakter aman yang
 * diizinkan supaya tidak ada path traversal lewat body request.
 */
const mediaKeySchema = z
  .string()
  .min(1)
  .max(512)
  .regex(
    /^[a-z0-9-]+(\/[A-Za-z0-9._-]+){1,4}$/,
    "format key R2 tidak valid",
  );

export const postMediaSchema = z.object({
  key: mediaKeySchema,
  mimeType: z.string().max(100),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  width: z.number().int().positive().max(20_000).optional(),
  height: z.number().int().positive().max(20_000).optional(),
});

export type PostMediaInput = z.infer<typeof postMediaSchema>;

/**
 * Body `POST /api/v1/posts`.
 *
 * Klien TIDAK memilih event tujuan. Server yang memutuskan apakah post ini
 * bergabung ke event yang sudah ada (hasil penggabungan AI) atau membuka event
 * baru. `clientUuid` dibuat di perangkat dan menjadi kunci idempotensi, supaya
 * retry dari antrean offline tidak pernah membuat post ganda.
 */
export const createPostSchema = z.object({
  clientUuid: z.string().uuid(),
  body: z.string().trim().min(10).max(2000),
  location: coordinateSchema,
  capturedAt: z.iso.datetime({ offset: true }),
  placeLabel: z.string().trim().max(120).optional(),
  /** Petunjuk dari pengguna; AI tetap yang menentukan kategori akhir. */
  disasterTypeHint: z.enum(DISASTER_TYPES).optional(),
  media: z.array(postMediaSchema).max(MAX_PHOTOS_PER_POST).default([]),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;

export const eventFeedQuerySchema = paginationSchema.extend({
  /** `all` (default) mengembalikan ketiga section sekaligus, terurut waktu. */
  section: z.enum([...FEED_SECTIONS, "all"]).default("all"),
  q: z.string().trim().max(120).optional(),
  disasterType: z.enum(DISASTER_TYPES).optional(),
  province: z.string().trim().max(80).optional(),
});

export type EventFeedQuery = z.infer<typeof eventFeedQuerySchema>;

/** `POST /api/v1/events/:id/reports` — lapor konten palsu atau duplikat. */
export const contentReportSchema = z.object({
  reason: z.enum(MODERATION_REASONS),
  note: z.string().trim().max(500).optional(),
});

export type ContentReportInput = z.infer<typeof contentReportSchema>;

export const presignSchema = z.object({
  kind: z.enum(MEDIA_KINDS),
  contentType: z.string().max(100),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  /** `postId` untuk foto post, `expenseId` untuk struk, `profileId` untuk avatar. */
  scopeId: z.string().uuid().optional(),
});

export type PresignInput = z.infer<typeof presignSchema>;

export function isAllowedContentType(kind: string, contentType: string): boolean {
  const allow: readonly string[] =
    kind === "receipt" || kind === "verification_doc"
      ? [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOCUMENT_TYPES]
      : ALLOWED_IMAGE_TYPES;
  return allow.includes(contentType);
}

// ---------------------------------------------------------------- posko & kebutuhan

export const poskoNeedSchema = z.object({
  itemName: z.string().trim().min(2).max(80),
  category: z.enum(NEED_CATEGORIES).default("other"),
  unit: z.string().trim().min(1).max(20).default("unit"),
  quantityNeeded: z.number().positive().max(1_000_000),
  priority: z.number().int().min(1).max(5).default(3),
  note: z.string().trim().max(300).optional(),
});

export type PoskoNeedInput = z.infer<typeof poskoNeedSchema>;

export const createPoskoSchema = z.object({
  name: z.string().trim().min(3).max(120),
  address: z.string().trim().max(300).optional(),
  location: coordinateSchema,
  radiusM: z.number().int().min(10).max(5000).default(300),
  headcount: z.number().int().nonnegative().max(100_000).default(0),
  capacity: z.number().int().nonnegative().max(100_000).optional(),
  needs: z.array(poskoNeedSchema).max(50).default([]),
  /** `true` = survei selesai, kebutuhan langsung terbuka untuk publik. */
  surveyed: z.boolean().default(false),
});

export type CreatePoskoInput = z.infer<typeof createPoskoSchema>;

export const stockMovementSchema = z.object({
  itemName: z.string().trim().min(2).max(80),
  category: z.enum(NEED_CATEGORIES).default("other"),
  unit: z.string().trim().min(1).max(20).default("unit"),
  delta: z.number().refine((value) => value !== 0, "delta tidak boleh 0"),
  note: z.string().trim().max(300).optional(),
});

export type StockMovementInput = z.infer<typeof stockMovementSchema>;

// ---------------------------------------------------------------- penyalur

export const distributorProfileSchema = z.object({
  label: z.enum(["organization", "volunteer", "creator"]),
  displayName: z.string().trim().min(3).max(120),
  bio: z.string().trim().max(600).optional(),
  homeCity: z.string().trim().max(80).optional(),
  contactEmail: z.email().max(120).optional(),
  contactPhone: z.string().trim().max(30).optional(),
  socialUrl: z.url().max(300).optional(),
  followerCount: z.number().int().nonnegative().max(1_000_000_000).optional(),
});

export type DistributorProfileInput = z.infer<typeof distributorProfileSchema>;

export const verificationDocumentSchema = z.object({
  kind: z.enum(VERIFICATION_DOC_KINDS),
  key: mediaKeySchema,
  mimeType: z.string().max(100),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  note: z.string().trim().max(300).optional(),
});

export type VerificationDocumentInput = z.infer<typeof verificationDocumentSchema>;

export const picApplicationSchema = z.object({
  pitch: z.string().trim().min(50).max(500),
});

export type PicApplicationInput = z.infer<typeof picApplicationSchema>;

// ---------------------------------------------------------------- donasi & pencairan

export const createDonationSchema = z.object({
  picAssignmentId: z.string().uuid(),
  poskoId: z.string().uuid().optional(),
  amount: z.number().int().min(1000).max(1_000_000_000),
  donorName: z.string().trim().max(80).optional(),
  anonymous: z.boolean().default(false),
  guestEmail: z.email().max(120).optional(),
});

export type CreateDonationInput = z.infer<typeof createDonationSchema>;

export const claimDonationSchema = z.object({
  claimToken: z.string().min(8).max(200),
});

export const requestDisbursementSchema = z.object({
  amount: z.number().positive().max(1_000_000_000),
  purpose: z.string().trim().min(5).max(300),
});

export type RequestDisbursementInput = z.infer<typeof requestDisbursementSchema>;

export const createExpenseSchema = z.object({
  poskoId: z.string().uuid().optional(),
  itemName: z.string().trim().min(2).max(120),
  category: z.enum(NEED_CATEGORIES).default("other"),
  quantity: z.number().positive().max(1_000_000).optional(),
  unit: z.string().trim().max(20).optional(),
  amount: z.number().positive().max(1_000_000_000),
  merchant: z.string().trim().max(120).optional(),
  purchasedAt: z.iso.date().optional(),
  receiptKey: mediaKeySchema,
  note: z.string().trim().max(300).optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const confirmExpenseSchema = z.object({
  decision: z.enum(RECEIPT_DECISIONS),
  note: z.string().trim().max(500).optional(),
});

export type ConfirmExpenseInput = z.infer<typeof confirmExpenseSchema>;

/** Bentuk error seragam dari API. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
