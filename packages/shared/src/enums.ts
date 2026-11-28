/**
 * Enum & label yang dipakai bersama oleh API dan web.
 *
 * Harus identik dengan `create type ... as enum` di
 * packages/db/migrations/0002_community_feed.sql. Ubah keduanya bersamaan,
 * lalu jalankan `bun run db:types` untuk menyegarkan tipe database.
 *
 * Label bahasa Indonesia dan Inggris tinggal di `apps/web/app/i18n`, bukan di
 * sini: API tidak pernah merender teks UI, dan satu sumber istilah lebih mudah
 * dijaga daripada dua daftar yang harus disamakan manual.
 */

// ---------------------------------------------------------------- akun

/** Pilihan saat registrasi. Bukan pagar hak akses: keduanya boleh lapor & donasi. */
export const ACCOUNT_TYPES = ["resident", "distributor"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** Lencana otomatis dari kontribusi, bukan peran. */
export const BADGE_KINDS = ["reporter", "funder"] as const;
export type BadgeKind = (typeof BADGE_KINDS)[number];

export const DISTRIBUTOR_LABELS = ["organization", "volunteer", "creator"] as const;
export type DistributorLabel = (typeof DISTRIBUTOR_LABELS)[number];

export const VERIFICATION_STATUSES = [
  "unverified",
  "pending",
  "verified",
  "rejected",
  "suspended",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const VERIFICATION_DOC_KINDS = [
  "legal_deed",
  "sk_kemenkumham",
  "pic_identity",
  "pic_selfie",
  "org_letter",
  "social_profile",
  "follower_stats",
  "field_proof",
  "other",
] as const;
export type VerificationDocKind = (typeof VERIFICATION_DOC_KINDS)[number];

export const DOC_REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;
export type DocReviewStatus = (typeof DOC_REVIEW_STATUSES)[number];

/**
 * Dokumen wajib per label. Penyalur baru bisa mendapat centang terverifikasi
 * setelah SEMUA dokumen di daftarnya berstatus `approved` oleh admin.
 *
 * Daftar ini juga dipakai UI untuk menampilkan mana yang masih kurang, jadi
 * jangan disimpan di dua tempat.
 */
export const REQUIRED_VERIFICATION_DOCS: Record<
  DistributorLabel,
  readonly VerificationDocKind[]
> = {
  organization: ["legal_deed", "sk_kemenkumham", "pic_identity", "org_letter"],
  volunteer: ["pic_identity", "pic_selfie", "field_proof"],
  creator: ["pic_identity", "pic_selfie", "social_profile", "follower_stats"],
};

// ---------------------------------------------------------------- bencana

export const DISASTER_TYPES = [
  "flood",
  "flash_flood",
  "landslide",
  "volcanic_eruption",
  "earthquake",
  "tsunami",
  "fire",
  "storm",
  "drought",
  "other",
] as const;
export type DisasterType = (typeof DISASTER_TYPES)[number];

export const EVENT_STATUSES = ["open", "monitoring", "resolved", "archived"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

/** Section feed dihitung dari data, tidak disimpan. Lihat `v_event_feed`. */
export const FEED_SECTIONS = ["terbaru", "leaderboard", "pantau"] as const;
export type FeedSection = (typeof FEED_SECTIONS)[number];

export const POST_STATUSES = ["published", "hidden", "removed"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const MODERATION_REASONS = [
  "hoax",
  "duplicate",
  "irrelevant",
  "graphic",
  "other",
] as const;
export type ModerationReason = (typeof MODERATION_REASONS)[number];

export const MODERATION_STATUSES = ["open", "reviewed", "actioned", "dismissed"] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

// ---------------------------------------------------------------- posko

export const POSKO_STATUSES = ["draft", "active", "closed"] as const;
export type PoskoStatus = (typeof POSKO_STATUSES)[number];

export const POSKO_ORIGINS = ["reporter", "distributor"] as const;
export type PoskoOrigin = (typeof POSKO_ORIGINS)[number];

export const NEED_CATEGORIES = [
  "food",
  "water",
  "health",
  "shelter",
  "clothing",
  "sanitation",
  "energy",
  "education",
  "other",
] as const;
export type NeedCategory = (typeof NEED_CATEGORIES)[number];

export const NEED_STATUSES = ["open", "partial", "fulfilled", "cancelled"] as const;
export type NeedStatus = (typeof NEED_STATUSES)[number];

// ---------------------------------------------------------------- penyaluran

export const ASSIGNMENT_STATUSES = ["applied", "approved", "rejected", "revoked"] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const DONATION_STATUSES = ["pending", "paid", "expired", "failed", "refunded"] as const;
export type DonationStatus = (typeof DONATION_STATUSES)[number];

export const LEDGER_ENTRY_KINDS = [
  "donation_in",
  "disbursement_out",
  "refund",
  "fee",
] as const;
export type LedgerEntryKind = (typeof LEDGER_ENTRY_KINDS)[number];

export const DISBURSEMENT_STATUSES = [
  "locked",
  "requested",
  "approved",
  "transferred",
  "rejected",
] as const;
export type DisbursementStatus = (typeof DISBURSEMENT_STATUSES)[number];

export const EXPENSE_STATUSES = ["submitted", "confirmed", "disputed"] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const RECEIPT_DECISIONS = ["received", "partial", "not_received"] as const;
export type ReceiptDecision = (typeof RECEIPT_DECISIONS)[number];

export const STOCK_REASONS = [
  "need_update",
  "donation",
  "distribution",
  "adjustment",
  "opname",
] as const;
export type StockReason = (typeof STOCK_REASONS)[number];

// ---------------------------------------------------------------- media

/**
 * `post_photo` dan `receipt` masuk bucket publik; `verification_doc` masuk
 * bucket privat dan hanya bisa dibaca lewat signed URL admin.
 */
export const MEDIA_KINDS = ["post_photo", "receipt", "verification_doc", "avatar"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTOS_PER_POST = 4;

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const ALLOWED_DOCUMENT_TYPES = ["application/pdf"] as const;
