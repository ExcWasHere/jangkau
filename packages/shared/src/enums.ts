/**
 * Enum & label yang dipakai bersama oleh API dan web.
 * Harus identik dengan `create type ... as enum` di
 * packages/db/migrations/0001_init.sql — ubah keduanya bersamaan.
 */

export const APP_ROLES = ["resident", "organization", "admin"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const NEED_CATEGORIES = [
  "food",
  "water",
  "health",
  "shelter",
  "clothing",
  "sanitation",
  "energy",
  "other",
] as const;
export type NeedCategory = (typeof NEED_CATEGORIES)[number];

export const SEVERITY_LEVELS = ["low", "medium", "high", "critical"] as const;
export type SeverityLevel = (typeof SEVERITY_LEVELS)[number];

export const REPORT_STATUSES = [
  "pending",
  "validated",
  "eligible",
  "taken_up",
  "rejected",
  "merged",
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const CAMPAIGN_STATUSES = [
  "draft",
  "awaiting_confirmation",
  "active",
  "funded",
  "in_progress",
  "completed",
  "cancelled",
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const TRANCHES_STATUSES = [
  "planned",
  "receipts_submitted",
  "goods_confirmed",
  "released",
  "disputed",
] as const;
export type TrancheStatus = (typeof TRANCHES_STATUSES)[number];

export const STOCK_REASONS = [
  "report",
  "donation",
  "distribution",
  "adjustment",
  "opname",
] as const;
export type StockReason = (typeof STOCK_REASONS)[number];

export const MEDIA_KINDS = [
  "report_photo",
  "receipt",
  "org_document",
  "campaign_photo",
  "avatar",
] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** Label UI (Bahasa Indonesia). Kunci = nilai enum di DB. */
export const NEED_CATEGORY_LABELS: Record<NeedCategory, string> = {
  food: "Makanan",
  water: "Air bersih",
  health: "Obat & kesehatan",
  shelter: "Tempat tinggal",
  clothing: "Pakaian",
  sanitation: "Sanitasi",
  energy: "Listrik & penerangan",
  other: "Lainnya",
};

export const SEVERITY_LABELS: Record<SeverityLevel, string> = {
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
  critical: "Kritis",
};

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  pending: "Menunggu validasi",
  validated: "Tervalidasi",
  eligible: "Siap diambil organisasi",
  taken_up: "Sedang ditangani",
  rejected: "Ditolak",
  merged: "Digabung",
};

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Draf",
  awaiting_confirmation: "Menunggu konfirmasi pelapor",
  active: "Menerima donasi",
  funded: "Target tercapai",
  in_progress: "Penyaluran",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

/** Batas upload media, dipakai di presign API dan validasi client. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const ALLOWED_DOCUMENT_TYPES = ["application/pdf"] as const;
