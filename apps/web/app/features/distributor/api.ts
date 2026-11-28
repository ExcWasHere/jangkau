import type { DistributorLabel, VerificationDocKind } from "@jangkau/shared";

import type { DictKey } from "~/i18n";
import { apiFetch } from "~/shared/api/client";

export type VerificationDoc = {
  id: string;
  kind: VerificationDocKind;
  r2_key: string;
  mime_type: string;
  size_bytes: number;
  note: string | null;
  review_status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  created_at: string;
};

export type DistributorProfile = {
  profile_id: string;
  label: DistributorLabel;
  display_name: string;
  bio: string | null;
  home_city: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  social_url: string | null;
  follower_count: number | null;
  verification_status: "unverified" | "pending" | "verified" | "rejected" | "suspended";
  verified_at: string | null;
  rejection_reason: string | null;
};

export type VerificationSummary = {
  status: string;
  required: Array<{ kind: VerificationDocKind; state: string; documentId: string | null }>;
  missing: VerificationDocKind[];
  canSubmit: boolean;
};

export type DistributorMe = {
  distributor: DistributorProfile | null;
  verification: VerificationSummary | null;
  documents: VerificationDoc[];
};

export type PicAssignment = {
  id: string;
  event_id: string;
  status: "applied" | "approved" | "rejected" | "revoked";
  pitch: string | null;
  applied_at: string;
  approved_at: string | null;
  review_note: string | null;
  disaster_events: {
    id: string;
    title: string;
    province: string | null;
    regency: string | null;
  } | null;
};

export function fetchDistributorMe(token: string): Promise<DistributorMe> {
  return apiFetch<DistributorMe>("/distributors/me", { token });
}

export function createDistributor(
  token: string,
  input: {
    label: DistributorLabel;
    displayName: string;
    bio?: string;
    homeCity?: string;
    contactEmail?: string;
    contactPhone?: string;
    socialUrl?: string;
    followerCount?: number;
  },
) {
  return apiFetch<{ distributor: DistributorProfile }>("/distributors/me", {
    method: "POST",
    token,
    body: JSON.stringify(input),
  });
}

export function updateDistributor(token: string, patch: Record<string, unknown>) {
  return apiFetch<{ distributor: DistributorProfile }>("/distributors/me", {
    method: "PATCH",
    token,
    body: JSON.stringify(patch),
  });
}

/**
 * Unggah satu dokumen verifikasi: presign → PUT ke R2 → daftarkan di API.
 * Dokumen masuk bucket privat, jadi tidak ada URL publik yang dibuat di sini.
 */
export async function uploadVerificationDocument(
  token: string,
  input: { kind: VerificationDocKind; file: File; note?: string },
) {
  const presign = await apiFetch<{ key: string; putUrl: string }>("/uploads/presign", {
    method: "POST",
    token,
    body: JSON.stringify({
      kind: "verification_doc",
      contentType: input.file.type || "application/pdf",
      sizeBytes: input.file.size,
    }),
  });

  const put = await fetch(presign.putUrl, {
    method: "PUT",
    headers: { "content-type": input.file.type || "application/pdf" },
    body: input.file,
  });

  if (!put.ok) throw new Error("Gagal mengunggah dokumen");

  return apiFetch<{ document: VerificationDoc }>("/distributors/me/documents", {
    method: "POST",
    token,
    body: JSON.stringify({
      kind: input.kind,
      key: presign.key,
      mimeType: input.file.type || "application/pdf",
      sizeBytes: input.file.size,
      note: input.note,
    }),
  });
}

export function deleteVerificationDocument(token: string, id: string) {
  return apiFetch<{ ok: true }>(`/distributors/me/documents/${id}`, { method: "DELETE", token });
}

export function submitVerification(token: string) {
  return apiFetch<{ ok: true; status: string }>("/distributors/me/submit", {
    method: "POST",
    token,
  });
}

export function fetchMyAssignments(token: string): Promise<{ items: PicAssignment[] }> {
  return apiFetch<{ items: PicAssignment[] }>("/events/pic-assignments/mine", { token });
}

export function applyAsPic(token: string, eventId: string, pitch: string) {
  return apiFetch<{ application: { id: string; status: string } }>(
    `/events/${eventId}/pic-applications`,
    { method: "POST", token, body: JSON.stringify({ pitch }) },
  );
}

export function withdrawPicApplication(token: string, eventId: string) {
  return apiFetch<{ ok: true }>(`/events/${eventId}/pic-applications/mine`, {
    method: "DELETE",
    token,
  });
}

/** Nama kunci kamus untuk setiap jenis dokumen. */
export const DOC_KIND_LABEL_KEY: Record<VerificationDocKind, DictKey> = {
  legal_deed: "dashboard.docKindLegalDeed",
  sk_kemenkumham: "dashboard.docKindSk",
  pic_identity: "dashboard.docKindPicIdentity",
  pic_selfie: "dashboard.docKindPicSelfie",
  org_letter: "dashboard.docKindOrgLetter",
  social_profile: "dashboard.docKindSocialProfile",
  follower_stats: "dashboard.docKindFollowerStats",
  field_proof: "dashboard.docKindFieldProof",
  other: "dashboard.docKindFieldProof",
};
