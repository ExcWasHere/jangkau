import { Hono } from "hono";

import {
  REQUIRED_VERIFICATION_DOCS,
  distributorProfileSchema,
  verificationDocumentSchema,
} from "@jangkau/shared";

import type { AppEnv } from "../../env.js";
import { raiseDbError } from "../../shared/db-errors.js";
import { badRequest, conflict, forbidden, notFound } from "../../shared/errors.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { publicUrl } from "../../shared/r2.js";
import { adminClient } from "../../shared/supabase.js";

export const distributorRoutes = new Hono<AppEnv>();

distributorRoutes.use("*", requireAuth);

type DocRow = {
  id: string;
  kind: string;
  r2_key: string;
  mime_type: string;
  size_bytes: number;
  note: string | null;
  review_status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  created_at: string;
};

function missingKinds(label: string, documents: DocRow[]): string[] {
  const required = REQUIRED_VERIFICATION_DOCS[label as keyof typeof REQUIRED_VERIFICATION_DOCS] ?? [];
  const approved = new Set(
    documents.filter((doc) => doc.review_status === "approved").map((doc) => doc.kind),
  );
  return required.filter((kind) => !approved.has(kind));
}

/** Status ringkas yang dipakai dashboard: apa yang kurang, apa yang menunggu. */
function verificationSummary(label: string, status: string, documents: DocRow[]) {
  const required = REQUIRED_VERIFICATION_DOCS[label as keyof typeof REQUIRED_VERIFICATION_DOCS] ?? [];
  const byKind = new Map(documents.map((doc) => [doc.kind, doc]));

  return {
    status,
    required: required.map((kind) => ({
      kind,
      state: byKind.get(kind)?.review_status ?? "missing",
      documentId: byKind.get(kind)?.id ?? null,
    })),
    missing: missingKinds(label, documents),
    canSubmit:
      status !== "verified" && status !== "pending" && missingKinds(label, documents).length === 0,
  };
}

/**
 * Membuat profil penyalur. Akun warga yang ingin menyalurkan bantuan juga
 * boleh memakai endpoint ini; tipe akunnya ikut dinaikkan menjadi
 * `distributor` supaya tidak ada jalan buntu. Kemampuan melapor dan berdonasi
 * tidak berubah.
 */
distributorRoutes.post("/me", async (c) => {
  const user = c.get("user");
  const parsed = distributorProfileSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw badRequest("invalid_body", "Profil penyalur tidak valid", parsed.error.issues);
  }

  const admin = adminClient(c.env);

  const { data: existing, error: existingError } = await admin
    .from("distributor_profiles")
    .select("profile_id")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (existingError) raiseDbError(existingError);
  if (existing) throw conflict("already_distributor", "Profil penyalur sudah ada");

  const input = parsed.data;

  const { data, error } = await admin
    .from("distributor_profiles")
    .insert({
      profile_id: user.id,
      label: input.label,
      display_name: input.displayName,
      bio: input.bio ?? null,
      home_city: input.homeCity ?? null,
      contact_email: input.contactEmail ?? null,
      contact_phone: input.contactPhone ?? null,
      social_url: input.socialUrl ?? null,
      follower_count: input.followerCount ?? null,
    })
    .select("*")
    .single();

  if (error) raiseDbError(error);

  const { error: profileError } = await admin
    .from("profiles")
    .update({ account_type: "distributor" })
    .eq("id", user.id);

  if (profileError) raiseDbError(profileError);

  return c.json({ distributor: data }, 201);
});

/** Profil + dokumen + status verifikasi milik pemanggil. */
distributorRoutes.get("/me", async (c) => {
  const user = c.get("user");
  const admin = adminClient(c.env);

  const { data: profile, error: profileError } = await admin
    .from("distributor_profiles")
    .select("*")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (profileError) raiseDbError(profileError);
  if (!profile) return c.json({ distributor: null, verification: null, documents: [] });

  const { data: documents, error: docsError } = await admin
    .from("verification_documents")
    .select("id, kind, r2_key, mime_type, size_bytes, note, review_status, rejection_reason, created_at")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false });

  if (docsError) raiseDbError(docsError);

  const rows = (documents ?? []) as DocRow[];

  return c.json({
    distributor: profile,
    verification: verificationSummary(profile.label, profile.verification_status, rows),
    documents: rows,
  });
});

/**
 * Mengubah profil. Label hanya boleh berubah sebelum diverifikasi, karena
 * daftar dokumen wajib berbeda per label — mengubahnya setelah disetujui akan
 * membuat centang tidak lagi berarti.
 */
distributorRoutes.patch("/me", async (c) => {
  const user = c.get("user");
  const parsed = distributorProfileSchema.partial().safeParse(await c.req.json());
  if (!parsed.success) {
    throw badRequest("invalid_body", "Perubahan profil tidak valid", parsed.error.issues);
  }

  const admin = adminClient(c.env);

  const { data: current, error: currentError } = await admin
    .from("distributor_profiles")
    .select("label, verification_status")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (currentError) raiseDbError(currentError);
  if (!current) throw notFound("Profil penyalur belum dibuat");

  const input = parsed.data;
  if (input.label && input.label !== current.label && current.verification_status !== "unverified" && current.verification_status !== "rejected") {
    throw forbidden("Label tidak bisa diubah setelah verifikasi diajukan");
  }

  const patch: Record<string, unknown> = {};
  if (input.label !== undefined) patch.label = input.label;
  if (input.displayName !== undefined) patch.display_name = input.displayName;
  if (input.bio !== undefined) patch.bio = input.bio;
  if (input.homeCity !== undefined) patch.home_city = input.homeCity;
  if (input.contactEmail !== undefined) patch.contact_email = input.contactEmail;
  if (input.contactPhone !== undefined) patch.contact_phone = input.contactPhone;
  if (input.socialUrl !== undefined) patch.social_url = input.socialUrl;
  if (input.followerCount !== undefined) patch.follower_count = input.followerCount;

  if (Object.keys(patch).length === 0) return c.json({ ok: true, changed: [] });

  const { data, error } = await admin
    .from("distributor_profiles")
    .update(patch)
    .eq("profile_id", user.id)
    .select("*")
    .single();

  if (error) raiseDbError(error);

  return c.json({ distributor: data, changed: Object.keys(patch) });
});

/** Menambahkan satu dokumen verifikasi. Berkas sudah diunggah lewat presign. */
distributorRoutes.post("/me/documents", async (c) => {
  const user = c.get("user");
  const parsed = verificationDocumentSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw badRequest("invalid_body", "Dokumen tidak valid", parsed.error.issues);
  }

  const admin = adminClient(c.env);

  const { data: profile, error: profileError } = await admin
    .from("distributor_profiles")
    .select("label, verification_status")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (profileError) raiseDbError(profileError);
  if (!profile) throw notFound("Profil penyalur belum dibuat");
  if (profile.verification_status === "verified") {
    throw conflict("already_verified", "Akun ini sudah terverifikasi");
  }

  const { data: pendingSameKind, error: pendingError } = await admin
    .from("verification_documents")
    .select("id")
    .eq("profile_id", user.id)
    .eq("kind", parsed.data.kind)
    .eq("review_status", "pending")
    .maybeSingle();

  if (pendingError) raiseDbError(pendingError);
  if (pendingSameKind) {
    throw conflict(
      "duplicate_pending",
      "Dokumen jenis ini sedang menunggu tinjauan. Tunggu keputusan admin.",
    );
  }

  const { data, error } = await admin
    .from("verification_documents")
    .insert({
      profile_id: user.id,
      kind: parsed.data.kind,
      r2_key: parsed.data.key,
      mime_type: parsed.data.mimeType,
      size_bytes: parsed.data.sizeBytes,
      note: parsed.data.note ?? null,
    })
    .select("*")
    .single();

  if (error) raiseDbError(error);

  return c.json({ document: data }, 201);
});

/** Menghapus dokumen yang belum disetujui. */
distributorRoutes.delete("/me/documents/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const admin = adminClient(c.env);

  const { data: doc, error: docError } = await admin
    .from("verification_documents")
    .select("id, profile_id, review_status")
    .eq("id", id)
    .maybeSingle();

  if (docError) raiseDbError(docError);
  if (!doc) throw notFound("Dokumen tidak ditemukan");
  if (doc.profile_id !== user.id) throw forbidden();
  if (doc.review_status === "approved") {
    throw conflict("already_approved", "Dokumen yang sudah disetujui tidak bisa dihapus");
  }

  const { error } = await admin.from("verification_documents").delete().eq("id", id);
  if (error) raiseDbError(error);

  return c.json({ ok: true });
});

/**
 * Mengajukan verifikasi. Semua dokumen wajib sudah diunggah; statusnya boleh
 * `pending` karena admin yang akan menilai.
 */
distributorRoutes.post("/me/submit", async (c) => {
  const user = c.get("user");
  const admin = adminClient(c.env);

  const { data: profile, error: profileError } = await admin
    .from("distributor_profiles")
    .select("label, verification_status")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (profileError) raiseDbError(profileError);
  if (!profile) throw notFound("Profil penyalur belum dibuat");
  if (profile.verification_status === "verified") {
    throw conflict("already_verified", "Akun ini sudah terverifikasi");
  }
  if (profile.verification_status === "pending") {
    throw conflict("already_pending", "Pengajuan verifikasi sedang ditinjau admin");
  }

  const { data: documents, error: docsError } = await admin
    .from("verification_documents")
    .select("id, kind, r2_key, mime_type, size_bytes, note, review_status, rejection_reason, created_at")
    .eq("profile_id", user.id);

  if (docsError) raiseDbError(docsError);

  const rows = (documents ?? []) as DocRow[];
  const required = REQUIRED_VERIFICATION_DOCS[profile.label as keyof typeof REQUIRED_VERIFICATION_DOCS] ?? [];
  const uploaded = new Set(rows.filter((doc) => doc.review_status !== "rejected").map((doc) => doc.kind));
  const missing = required.filter((kind) => !uploaded.has(kind));

  if (missing.length > 0) {
    throw badRequest("documents_incomplete", "Masih ada dokumen yang belum diunggah", { missing });
  }

  const { error } = await admin
    .from("distributor_profiles")
    .update({ verification_status: "pending", rejection_reason: null })
    .eq("profile_id", user.id);

  if (error) raiseDbError(error);

  return c.json({ ok: true, status: "pending" });
});

/** Profil publik penyalur: angka yang boleh dilihat siapa pun. */
distributorRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const admin = adminClient(c.env);

  const { data, error } = await admin
    .from("v_pic_public")
    .select("*")
    .eq("distributor_id", id);

  if (error) raiseDbError(error);

  const [profileResult, avatarResult] = await Promise.all([
    admin
      .from("distributor_profiles")
      .select("profile_id, label, display_name, bio, home_city, social_url, follower_count, verification_status")
      .eq("profile_id", id)
      .maybeSingle(),
    admin.from("profiles").select("avatar_key").eq("id", id).maybeSingle(),
  ]);

  if (profileResult.error) raiseDbError(profileResult.error);
  if (!profileResult.data) throw notFound("Penyalur tidak ditemukan");

  const profile = profileResult.data;

  const assignments = data ?? [];
  const totalIn = assignments.reduce((sum, row) => sum + Number(row.total_in), 0);
  const totalOut = assignments.reduce((sum, row) => sum + Number(row.total_out), 0);
  const donationCount = assignments.reduce((sum, row) => sum + Number(row.donation_count), 0);

  return c.json({
    distributor: {
      id: profile.profile_id,
      label: profile.label,
      displayName: profile.display_name,
      bio: profile.bio,
      homeCity: profile.home_city,
      socialUrl: profile.social_url,
      followerCount: profile.follower_count,
      verified: profile.verification_status === "verified",
      avatarUrl: publicUrl(c.env, avatarResult.data?.avatar_key),
    },
    totals: { totalIn, totalOut, donationCount, handledEventCount: assignments.length },
    assignments: assignments.map((row) => ({
      assignmentId: row.pic_assignment_id,
      eventId: row.event_id,
      totalIn: row.total_in,
      totalOut: row.total_out,
      balance: row.balance,
      donationCount: row.donation_count,
      poskoCount: row.posko_count,
    })),
  });
});
