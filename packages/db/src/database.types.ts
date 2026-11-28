/**
 * Tipe database Jangkau.
 *
 * DIBUAT OTOMATIS oleh packages/db/scripts/types.ts — jangan disunting manual.
 * Regenerasi setelah migrasi: bun run db:types
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];


export type AccountType = "resident" | "distributor";
export type AssignmentStatus = "applied" | "approved" | "rejected" | "revoked";
export type BadgeKind = "reporter" | "funder";
export type DisasterType = "flood" | "flash_flood" | "landslide" | "volcanic_eruption" | "earthquake" | "tsunami" | "fire" | "storm" | "drought" | "other";
export type DisbursementStatus = "locked" | "requested" | "approved" | "transferred" | "rejected";
export type DistributorLabel = "organization" | "volunteer" | "creator";
export type DocReviewStatus = "pending" | "approved" | "rejected";
export type DonationStatus = "pending" | "paid" | "expired" | "failed" | "refunded";
export type EventStatus = "open" | "monitoring" | "resolved" | "archived";
export type ExpenseStatus = "submitted" | "confirmed" | "disputed";
export type LedgerEntryKind = "donation_in" | "disbursement_out" | "refund" | "fee";
export type LocationSource = "device" | "manual";
export type ModerationReason = "hoax" | "duplicate" | "irrelevant" | "graphic" | "other";
export type ModerationStatus = "open" | "reviewed" | "actioned" | "dismissed";
export type NeedCategory = "food" | "water" | "health" | "shelter" | "clothing" | "sanitation" | "energy" | "education" | "other";
export type NeedStatus = "open" | "partial" | "fulfilled" | "cancelled";
export type PoskoOrigin = "reporter" | "distributor";
export type PoskoStatus = "draft" | "active" | "closed";
export type PostStatus = "published" | "hidden" | "removed";
export type ReceiptDecision = "received" | "partial" | "not_received";
export type StockReason = "need_update" | "donation" | "distribution" | "adjustment" | "opname";
export type VerificationDocKind = "legal_deed" | "sk_kemenkumham" | "pic_identity" | "pic_selfie" | "org_letter" | "social_profile" | "follower_stats" | "field_proof" | "other";
export type VerificationStatus = "unverified" | "pending" | "verified" | "rejected" | "suspended";

export interface AppSettingsRow {
  key: string;
  value: Json;
  updated_by: string | null;
  updated_at: string;
}

export interface AuditLogsRow {
  id: number;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  payload: Json | null;
  created_at: string;
}

export interface ContentReportsRow {
  id: string;
  reporter_id: string | null;
  event_id: string | null;
  post_id: string | null;
  reason: ModerationReason;
  note: string | null;
  status: ModerationStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface DisasterEventsRow {
  id: string;
  title: string;
  disaster_type: DisasterType;
  summary: string | null;
  location: unknown;
  radius_m: number;
  village: string | null;
  district: string | null;
  regency: string | null;
  province: string | null;
  severity: number;
  status: EventStatus;
  post_count: number;
  like_count: number;
  approved_pic_count: number;
  cover_media_key: string | null;
  embedding: unknown;
  first_reported_at: string;
  last_activity_at: string;
  merged_into_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DisbursementsRow {
  id: string;
  pic_assignment_id: string;
  seq: number;
  amount: number;
  status: DisbursementStatus;
  purpose: string | null;
  requested_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  transferred_at: string | null;
  is_simulated: boolean;
  created_at: string;
  updated_at: string;
}

export interface DistributorProfilesRow {
  profile_id: string;
  label: DistributorLabel;
  display_name: string;
  bio: string | null;
  home_city: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  social_url: string | null;
  follower_count: number | null;
  verification_status: VerificationStatus;
  verified_at: string | null;
  verified_by: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface DonationsRow {
  id: string;
  pic_assignment_id: string;
  event_id: string;
  posko_id: string | null;
  donor_id: string | null;
  donor_name: string | null;
  is_anonymous: boolean;
  amount: number;
  currency: string;
  status: DonationStatus;
  midtrans_order_id: string;
  midtrans_transaction_id: string | null;
  payment_type: string | null;
  qr_string: string | null;
  qr_url: string | null;
  expires_at: string | null;
  paid_at: string | null;
  claim_token: string;
  guest_email: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  raw_notification: Json | null;
  created_at: string;
  updated_at: string;
}

export interface EventLikesRow {
  event_id: string;
  profile_id: string;
  created_at: string;
}

export interface EventMergesRow {
  id: string;
  source_event_id: string;
  target_event_id: string;
  similarity: number | null;
  model: string | null;
  decided_by: string;
  decided_by_profile: string | null;
  created_at: string;
}

export interface ExpenseConfirmationsRow {
  expense_id: string;
  profile_id: string;
  decision: ReceiptDecision;
  note: string | null;
  created_at: string;
}

export interface ExpensesRow {
  id: string;
  disbursement_id: string;
  posko_id: string | null;
  item_name: string;
  category: NeedCategory;
  quantity: number | null;
  unit: string | null;
  amount: number;
  merchant: string | null;
  purchased_at: string | null;
  receipt_r2_key: string;
  note: string | null;
  status: ExpenseStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LedgerEntriesRow {
  id: string;
  pic_assignment_id: string;
  donation_id: string | null;
  disbursement_id: string | null;
  kind: LedgerEntryKind;
  amount: number;
  note: string | null;
  created_at: string;
}

export interface NotificationsRow {
  id: string;
  profile_id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface PicAssignmentsRow {
  id: string;
  event_id: string;
  distributor_id: string;
  status: AssignmentStatus;
  pitch: string | null;
  applied_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  approved_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PoskoNeedsRow {
  id: string;
  posko_id: string;
  item_name: string;
  category: NeedCategory;
  unit: string;
  quantity_needed: number;
  quantity_fulfilled: number;
  priority: number;
  status: NeedStatus;
  note: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PoskoStockRow {
  id: string;
  posko_id: string;
  item_name: string;
  category: NeedCategory;
  unit: string;
  quantity: number;
  updated_by: string | null;
  updated_at: string;
}

export interface PostMediaRow {
  id: string;
  post_id: string;
  r2_key: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  sort_order: number;
  created_at: string;
}

export interface PostsRow {
  id: string;
  client_uuid: string;
  event_id: string;
  author_id: string;
  body: string;
  location: unknown;
  accuracy_m: number | null;
  place_label: string | null;
  captured_at: string;
  status: PostStatus;
  ai_category: NeedCategory | null;
  ai_confidence: number | null;
  ai_similarity: number | null;
  ai_model: string | null;
  needs_review: boolean;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
  location_source: LocationSource;
  review_reasons: string[];
}

export interface ProfileBadgesRow {
  profile_id: string;
  badge: BadgeKind;
  first_earned_at: string;
}

export interface ProfilesRow {
  id: string;
  display_name: string;
  username: string | null;
  avatar_key: string | null;
  phone: string | null;
  account_type: AccountType;
  is_admin: boolean;
  locale: string;
  theme: string;
  created_at: string;
  updated_at: string;
}

export interface ReliefPostsRow {
  id: string;
  event_id: string;
  name: string;
  address: string | null;
  location: unknown;
  radius_m: number;
  headcount: number;
  capacity: number | null;
  origin: PoskoOrigin;
  status: PoskoStatus;
  surveyed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface StockLogsRow {
  id: string;
  stock_id: string;
  delta: number;
  reason: StockReason;
  note: string | null;
  actor_id: string | null;
  created_at: string;
}

export interface VerificationDocumentsRow {
  id: string;
  profile_id: string;
  kind: VerificationDocKind;
  r2_key: string;
  mime_type: string;
  size_bytes: number;
  note: string | null;
  review_status: DocReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export interface GeographyColumnsRow {
  f_table_catalog: unknown;
  f_table_schema: unknown;
  f_table_name: unknown;
  f_geography_column: unknown;
  coord_dimension: number | null;
  srid: number | null;
  type: string | null;
}

export interface GeometryColumnsRow {
  f_table_catalog: string | null;
  f_table_schema: unknown;
  f_table_name: unknown;
  f_geometry_column: unknown;
  coord_dimension: number | null;
  srid: number | null;
  type: string | null;
}

export interface VEventFeedRow {
  id: string | null;
  title: string | null;
  disaster_type: DisasterType | null;
  summary: string | null;
  status: EventStatus | null;
  lat: number | null;
  lng: number | null;
  village: string | null;
  district: string | null;
  regency: string | null;
  province: string | null;
  radius_m: number | null;
  severity: number | null;
  like_count: number | null;
  post_count: number | null;
  approved_pic_count: number | null;
  cover_media_key: string | null;
  first_reported_at: string | null;
  last_activity_at: string | null;
  section: string | null;
  uploaders: Json | null;
  posko_count: number | null;
}

export interface VEventUploadersRow {
  event_id: string | null;
  author_id: string | null;
  display_name: string | null;
  username: string | null;
  avatar_key: string | null;
  post_count: number | null;
  first_post_at: string | null;
}

export interface VPicBalancesRow {
  pic_assignment_id: string | null;
  event_id: string | null;
  distributor_id: string | null;
  balance: number | null;
  total_in: number | null;
  total_out: number | null;
  donation_count: number | null;
}

export interface VPicPublicRow {
  pic_assignment_id: string | null;
  event_id: string | null;
  distributor_id: string | null;
  label: DistributorLabel | null;
  display_name: string | null;
  bio: string | null;
  verification_status: VerificationStatus | null;
  social_url: string | null;
  follower_count: number | null;
  total_in: number | null;
  total_out: number | null;
  balance: number | null;
  donation_count: number | null;
  handled_event_count: number | null;
  posko_count: number | null;
}

export interface VPoskoPublicRow {
  id: string | null;
  event_id: string | null;
  name: string | null;
  address: string | null;
  headcount: number | null;
  capacity: number | null;
  lat: number | null;
  lng: number | null;
  surveyed_at: string | null;
  total_needed: number | null;
  total_fulfilled: number | null;
  open_need_count: number | null;
}

export interface VProfilesPublicRow {
  id: string | null;
  display_name: string | null;
  username: string | null;
  avatar_key: string | null;
  account_type: AccountType | null;
  badges: Json | null;
  distributor_label: DistributorLabel | null;
  verification_status: VerificationStatus | null;
  social_url: string | null;
}

export interface Database {
  public: {
    Tables: {
    app_settings: {
      Row: AppSettingsRow;
      Insert: Pick<AppSettingsRow, "key" | "value"> & Partial<AppSettingsRow>;
      Update: Partial<AppSettingsRow>;
    };
    audit_logs: {
      Row: AuditLogsRow;
      Insert: Pick<AuditLogsRow, "action" | "entity"> & Partial<AuditLogsRow>;
      Update: Partial<AuditLogsRow>;
    };
    content_reports: {
      Row: ContentReportsRow;
      Insert: Pick<ContentReportsRow, "reason"> & Partial<ContentReportsRow>;
      Update: Partial<ContentReportsRow>;
    };
    disaster_events: {
      Row: DisasterEventsRow;
      Insert: Pick<DisasterEventsRow, "title" | "location"> & Partial<DisasterEventsRow>;
      Update: Partial<DisasterEventsRow>;
    };
    disbursements: {
      Row: DisbursementsRow;
      Insert: Pick<DisbursementsRow, "pic_assignment_id" | "seq" | "amount"> & Partial<DisbursementsRow>;
      Update: Partial<DisbursementsRow>;
    };
    distributor_profiles: {
      Row: DistributorProfilesRow;
      Insert: Pick<DistributorProfilesRow, "profile_id" | "label" | "display_name"> & Partial<DistributorProfilesRow>;
      Update: Partial<DistributorProfilesRow>;
    };
    donations: {
      Row: DonationsRow;
      Insert: Pick<DonationsRow, "pic_assignment_id" | "event_id" | "amount" | "midtrans_order_id" | "claim_token"> & Partial<DonationsRow>;
      Update: Partial<DonationsRow>;
    };
    event_likes: {
      Row: EventLikesRow;
      Insert: Pick<EventLikesRow, "event_id" | "profile_id"> & Partial<EventLikesRow>;
      Update: Partial<EventLikesRow>;
    };
    event_merges: {
      Row: EventMergesRow;
      Insert: Pick<EventMergesRow, "source_event_id" | "target_event_id"> & Partial<EventMergesRow>;
      Update: Partial<EventMergesRow>;
    };
    expense_confirmations: {
      Row: ExpenseConfirmationsRow;
      Insert: Pick<ExpenseConfirmationsRow, "expense_id" | "profile_id" | "decision"> & Partial<ExpenseConfirmationsRow>;
      Update: Partial<ExpenseConfirmationsRow>;
    };
    expenses: {
      Row: ExpensesRow;
      Insert: Pick<ExpensesRow, "disbursement_id" | "item_name" | "amount" | "receipt_r2_key"> & Partial<ExpensesRow>;
      Update: Partial<ExpensesRow>;
    };
    ledger_entries: {
      Row: LedgerEntriesRow;
      Insert: Pick<LedgerEntriesRow, "pic_assignment_id" | "kind" | "amount"> & Partial<LedgerEntriesRow>;
      Update: Partial<LedgerEntriesRow>;
    };
    notifications: {
      Row: NotificationsRow;
      Insert: Pick<NotificationsRow, "profile_id" | "kind" | "title"> & Partial<NotificationsRow>;
      Update: Partial<NotificationsRow>;
    };
    pic_assignments: {
      Row: PicAssignmentsRow;
      Insert: Pick<PicAssignmentsRow, "event_id" | "distributor_id"> & Partial<PicAssignmentsRow>;
      Update: Partial<PicAssignmentsRow>;
    };
    posko_needs: {
      Row: PoskoNeedsRow;
      Insert: Pick<PoskoNeedsRow, "posko_id" | "item_name" | "quantity_needed"> & Partial<PoskoNeedsRow>;
      Update: Partial<PoskoNeedsRow>;
    };
    posko_stock: {
      Row: PoskoStockRow;
      Insert: Pick<PoskoStockRow, "posko_id" | "item_name"> & Partial<PoskoStockRow>;
      Update: Partial<PoskoStockRow>;
    };
    post_media: {
      Row: PostMediaRow;
      Insert: Pick<PostMediaRow, "post_id" | "r2_key" | "mime_type" | "size_bytes"> & Partial<PostMediaRow>;
      Update: Partial<PostMediaRow>;
    };
    posts: {
      Row: PostsRow;
      Insert: Pick<PostsRow, "client_uuid" | "event_id" | "author_id" | "body" | "location" | "captured_at"> & Partial<PostsRow>;
      Update: Partial<PostsRow>;
    };
    profile_badges: {
      Row: ProfileBadgesRow;
      Insert: Pick<ProfileBadgesRow, "profile_id" | "badge"> & Partial<ProfileBadgesRow>;
      Update: Partial<ProfileBadgesRow>;
    };
    profiles: {
      Row: ProfilesRow;
      Insert: Pick<ProfilesRow, "id" | "display_name"> & Partial<ProfilesRow>;
      Update: Partial<ProfilesRow>;
    };
    relief_posts: {
      Row: ReliefPostsRow;
      Insert: Pick<ReliefPostsRow, "event_id" | "name" | "location"> & Partial<ReliefPostsRow>;
      Update: Partial<ReliefPostsRow>;
    };
    stock_logs: {
      Row: StockLogsRow;
      Insert: Pick<StockLogsRow, "stock_id" | "delta" | "reason"> & Partial<StockLogsRow>;
      Update: Partial<StockLogsRow>;
    };
    verification_documents: {
      Row: VerificationDocumentsRow;
      Insert: Pick<VerificationDocumentsRow, "profile_id" | "kind" | "r2_key" | "mime_type" | "size_bytes"> & Partial<VerificationDocumentsRow>;
      Update: Partial<VerificationDocumentsRow>;
    };
    };
    Views: {
    geography_columns: {
      Row: GeographyColumnsRow;
      Insert: Record<never, never> & Partial<GeographyColumnsRow>;
      Update: Partial<GeographyColumnsRow>;
    };
    geometry_columns: {
      Row: GeometryColumnsRow;
      Insert: Record<never, never> & Partial<GeometryColumnsRow>;
      Update: Partial<GeometryColumnsRow>;
    };
    v_event_feed: {
      Row: VEventFeedRow;
      Insert: Record<never, never> & Partial<VEventFeedRow>;
      Update: Partial<VEventFeedRow>;
    };
    v_event_uploaders: {
      Row: VEventUploadersRow;
      Insert: Record<never, never> & Partial<VEventUploadersRow>;
      Update: Partial<VEventUploadersRow>;
    };
    v_pic_balances: {
      Row: VPicBalancesRow;
      Insert: Record<never, never> & Partial<VPicBalancesRow>;
      Update: Partial<VPicBalancesRow>;
    };
    v_pic_public: {
      Row: VPicPublicRow;
      Insert: Record<never, never> & Partial<VPicPublicRow>;
      Update: Partial<VPicPublicRow>;
    };
    v_posko_public: {
      Row: VPoskoPublicRow;
      Insert: Record<never, never> & Partial<VPoskoPublicRow>;
      Update: Partial<VPoskoPublicRow>;
    };
    v_profiles_public: {
      Row: VProfilesPublicRow;
      Insert: Record<never, never> & Partial<VProfilesPublicRow>;
      Update: Partial<VProfilesPublicRow>;
    };
    };
    Enums: {
      account_type: AccountType;
      assignment_status: AssignmentStatus;
      badge_kind: BadgeKind;
      disaster_type: DisasterType;
      disbursement_status: DisbursementStatus;
      distributor_label: DistributorLabel;
      doc_review_status: DocReviewStatus;
      donation_status: DonationStatus;
      event_status: EventStatus;
      expense_status: ExpenseStatus;
      ledger_entry_kind: LedgerEntryKind;
      location_source: LocationSource;
      moderation_reason: ModerationReason;
      moderation_status: ModerationStatus;
      need_category: NeedCategory;
      need_status: NeedStatus;
      posko_origin: PoskoOrigin;
      posko_status: PoskoStatus;
      post_status: PostStatus;
      receipt_decision: ReceiptDecision;
      stock_reason: StockReason;
      verification_doc_kind: VerificationDocKind;
      verification_status: VerificationStatus;
    };
  };
}
