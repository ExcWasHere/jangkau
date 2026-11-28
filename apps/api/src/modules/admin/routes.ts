import { Hono } from "hono";

import { REQUIRED_VERIFICATION_DOCS, type DistributorLabel } from "@jangkau/shared";

import type { AppEnv } from "../../env.js";
import { raiseDbError } from "../../shared/db-errors.js";
import { badRequest, conflict, notFound } from "../../shared/errors.js";
import { requireAdmin, requireAuth } from "../../shared/middleware/auth.js";
import { notify } from "../notifications/routes.js";
import { presignGet } from "../../shared/r2.js";
import { adminClient } from "../../shared/supabase.js";

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.use("*", requireAuth, requireAdmin);

type DocRow = {
  id: string;
  kind: string;
  r2_key: string;
  mime_type: string;
  size_bytes: number;
  review_status: "pending" | "approved" | "rejected";
  rejection_reason: string | null;
  created_at: string;
};

/**
 * Antrean verifikasi penyalur. Dokumen disajikan sebagai signed URL berumur
 * pendek karena KTP dan akta tidak boleh berada di bucket publik.
 */
adminRoutes.get("/verifications", async (c) => {
  const admin = adminClient(c.env);
  const status = c.req.query("status") ?? "pending";

  const { data: profiles, error } = await admin
    .from("distributor_profiles")
    .select("profile_id, label, display_name, bio, home_city, contact_email, contact_phone, social_url, follower_count, verification_status, verified_at, rejection_reason, created_at")
    .eq("verification_status", status)
    .order("created_at", { ascending: true });

  if (error) raiseDbError(error);

  const rows = profiles ?? [];
  if (rows.length === 0) return c.json({ items: [] });

  const { data: documents, error: docsError } = await admin
    .from("verification_documents")
    .select("id, profile_id, kind, r2_key, mime_type, size_bytes, review_status, rejection_reason, created_at")
    .in(
      "profile_id",
      rows.map((row) => row.profile_id),
    )
    .order("created_at", { ascending: false });

  if (docsError) raiseDbError(docsError);

  const byProfile = new Map<string, DocRow[]>();
  for (const doc of documents ?? []) {
    const list = byProfile.get(doc.profile_id) ?? [];
    list.push(doc as DocRow);
    byProfile.set(doc.profile_id, list);
  }

  const items = await Promise.all(
    rows.map(async (profile) => {
      const docs = byProfile.get(profile.profile_id) ?? [];
      const required = REQUIRED_VERIFICATION_DOCS[profile.label as DistributorLabel] ?? [];

      return {
        profile,
        required,
        documents: await Promise.all(
          docs.map(async (doc) => ({
            ...doc,
            url: doc.mime_type === "application/pdf" || doc.r2_key.startsWith("verification/")
              ? await presignGet(c.env, doc.r2_key)
              : null,
          })),
        ),
        allApproved: required.every((kind) =>
          docs.some((doc) => doc.kind === kind && doc.review_status === "approved"),
        ),
      };
    }),
  );

  return c.json({ items });
});

/**
 * Menilai satu dokumen. Setelah semua dokumen wajib disetujui, status penyalur
 * otomatis menjadi `verified` — admin tidak perlu menekan tombol kedua, dan
 * centang tidak pernah diberikan tanpa dokumen lengkap.
 */
adminRoutes.post("/verifications/:profileId/documents/:docId", async (c) => {
  const profileId = c.req.param("profileId");
  const docId = c.req.param("docId");
  const reviewer = c.get("user");

  const body = (await c.req.json()) as {
    decision?: "approved" | "rejected";
    reason?: string;
  };

  if (body.decision !== "approved" && body.decision !== "rejected") {
    throw badRequest("invalid_body", "Keputusan harus approved atau rejected");
  }

  const admin = adminClient(c.env);

  const { data: profile, error: profileError } = await admin
    .from("distributor_profiles")
    .select("profile_id, label, verification_status")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (profileError) raiseDbError(profileError);
  if (!profile) throw notFound("Penyalur tidak ditemukan");

  const { data: doc, error: docError } = await admin
    .from("verification_documents")
    .select("id, profile_id")
    .eq("id", docId)
    .maybeSingle();

  if (docError) raiseDbError(docError);
  if (!doc) throw notFound("Dokumen tidak ditemukan");
  if (doc.profile_id !== profileId) {
    throw badRequest("mismatch", "Dokumen bukan milik penyalur ini");
  }

  const { error: reviewError } = await admin
    .from("verification_documents")
    .update({
      review_status: body.decision,
      reviewed_by: reviewer.id,
      reviewed_at: new Date().toISOString(),
      rejection_reason: body.decision === "rejected" ? (body.reason ?? null) : null,
    })
    .eq("id", docId);

  if (reviewError) raiseDbError(reviewError);

  const { data: documents, error: docsError } = await admin
    .from("verification_documents")
    .select("kind, review_status")
    .eq("profile_id", profileId);

  if (docsError) raiseDbError(docsError);

  const required = REQUIRED_VERIFICATION_DOCS[profile.label as DistributorLabel] ?? [];
  const allApproved = required.every((kind) =>
    (documents ?? []).some((row) => row.kind === kind && row.review_status === "approved"),
  );

  let verificationStatus = profile.verification_status;

  if (allApproved) {
    const { error } = await admin
      .from("distributor_profiles")
      .update({
        verification_status: "verified",
        verified_at: new Date().toISOString(),
        verified_by: reviewer.id,
        rejection_reason: null,
      })
      .eq("profile_id", profileId);

    if (error) raiseDbError(error);
    verificationStatus = "verified";

    await admin.from("notifications").insert({
      profile_id: profileId,
      kind: "verification_approved",
      title: "Verifikasi disetujui",
      body: "Akun penyalur kamu sekarang terverifikasi. Kamu bisa mengajukan diri sebagai penanggung jawab penyaluran.",
      link: "/dashboard",
    });
  } else if (body.decision === "rejected") {
    await admin.from("notifications").insert({
      profile_id: profileId,
      kind: "verification_document_rejected",
      title: "Dokumen verifikasi ditolak",
      body: body.reason ?? "Ada dokumen yang perlu diperbaiki. Periksa dasbor penyalur.",
      link: "/dashboard",
    });
  }

  return c.json({ ok: true, allApproved, verificationStatus });
});

/** Keputusan menyeluruh: menolak pengajuan atau mencabut centang. */
adminRoutes.post("/verifications/:profileId/decision", async (c) => {
  const profileId = c.req.param("profileId");
  const reviewer = c.get("user");

  const body = (await c.req.json()) as {
    decision?: "verified" | "rejected" | "suspended";
    reason?: string;
  };

  if (!body.decision || !["verified", "rejected", "suspended"].includes(body.decision)) {
    throw badRequest("invalid_body", "Keputusan tidak dikenal");
  }

  if (body.decision !== "verified" && !body.reason?.trim()) {
    throw badRequest("reason_required", "Alasan wajib diisi saat menolak atau menangguhkan");
  }

  const admin = adminClient(c.env);

  const { data: profile, error: profileError } = await admin
    .from("distributor_profiles")
    .select("profile_id, verification_status")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (profileError) raiseDbError(profileError);
  if (!profile) throw notFound("Penyalur tidak ditemukan");
  if (profile.profile_id === reviewer.id) {
    throw conflict("self_review", "Tidak bisa memutuskan verifikasi akun sendiri");
  }

  const { error } = await admin
    .from("distributor_profiles")
    .update({
      verification_status: body.decision,
      verified_at: body.decision === "verified" ? new Date().toISOString() : null,
      verified_by: body.decision === "verified" ? reviewer.id : null,
      rejection_reason: body.decision === "verified" ? null : (body.reason ?? null),
    })
    .eq("profile_id", profileId);

  if (error) raiseDbError(error);

  await admin.from("audit_logs").insert({
    actor_id: reviewer.id,
    action: `verification.${body.decision}`,
    entity: "distributor_profiles",
    entity_id: profileId,
    payload: { reason: body.reason ?? null },
  });

  return c.json({ ok: true, status: body.decision });
});

/** Antrean pengajuan penanggung jawab. */
adminRoutes.get("/pic-applications", async (c) => {
  const admin = adminClient(c.env);
  const status = c.req.query("status") ?? "applied";

  const { data, error } = await admin
    .from("pic_assignments")
    .select(
      "id, event_id, distributor_id, status, pitch, applied_at, review_note, disaster_events(id, title, regency, province, like_count, approved_pic_count), distributor_profiles(label, display_name, verification_status)",
    )
    .eq("status", status)
    .order("applied_at", { ascending: true });

  if (error) raiseDbError(error);

  return c.json({ items: data ?? [] });
});

/**
 * Menyetujui atau menolak pengajuan penanggung jawab. Trigger
 * `fn_guard_pic_assignment` menolak persetujuan diri sendiri dan penyalur yang
 * belum terverifikasi, jadi kesalahan tetap tertangkap walau jalur ini dilewati.
 */
adminRoutes.post("/pic-applications/:id/decision", async (c) => {
  const id = c.req.param("id");
  const reviewer = c.get("user");

  const body = (await c.req.json()) as {
    decision?: "approved" | "rejected" | "revoked";
    note?: string;
  };

  if (!body.decision || !["approved", "rejected", "revoked"].includes(body.decision)) {
    throw badRequest("invalid_body", "Keputusan tidak dikenal");
  }

  if (body.decision !== "approved" && !body.note?.trim()) {
    throw badRequest("note_required", "Alasan wajib diisi saat menolak atau mencabut");
  }

  const admin = adminClient(c.env);

  const { data: assignment, error: assignmentError } = await admin
    .from("pic_assignments")
    .select("id, event_id, distributor_id, status")
    .eq("id", id)
    .maybeSingle();

  if (assignmentError) raiseDbError(assignmentError);
  if (!assignment) throw notFound("Pengajuan tidak ditemukan");
  if (assignment.distributor_id === reviewer.id) {
    throw conflict("self_review", "Tidak bisa memutuskan pengajuan sendiri");
  }

  const { data, error } = await admin
    .from("pic_assignments")
    .update({
      status: body.decision,
      reviewed_by: reviewer.id,
      reviewed_at: new Date().toISOString(),
      review_note: body.note ?? null,
      approved_at: body.decision === "approved" ? new Date().toISOString() : null,
      revoked_at: body.decision === "revoked" ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) raiseDbError(error);

  await admin.from("notifications").insert({
    profile_id: assignment.distributor_id,
    kind: `pic_${body.decision}`,
    title:
      body.decision === "approved"
        ? "Pengajuan penanggung jawab disetujui"
        : body.decision === "rejected"
          ? "Pengajuan penanggung jawab ditolak"
          : "Penugasan penanggung jawab dicabut",
    body: body.note ?? null,
    link: `/bencana/${assignment.event_id}`,
  });

  return c.json({ assignment: data });
});

/** Antrean laporan konten. */
adminRoutes.get("/content-reports", async (c) => {
  const admin = adminClient(c.env);
  const status = c.req.query("status") ?? "open";

  const { data, error } = await admin
    .from("content_reports")
    .select(
      "id, reason, note, status, created_at, event_id, post_id, reporter_id, disaster_events(id, title), profiles:reporter_id(display_name)",
    )
    .eq("status", status)
    .order("created_at", { ascending: true });

  if (error) raiseDbError(error);

  return c.json({ items: data ?? [] });
});

adminRoutes.post("/content-reports/:id", async (c) => {
  const id = c.req.param("id");
  const reviewer = c.get("user");

  const body = (await c.req.json()) as {
    decision?: "actioned" | "dismissed";
    hideEvent?: boolean;
  };

  if (body.decision !== "actioned" && body.decision !== "dismissed") {
    throw badRequest("invalid_body", "Keputusan harus actioned atau dismissed");
  }

  const admin = adminClient(c.env);

  const { data: report, error: reportError } = await admin
    .from("content_reports")
    .select("id, event_id, post_id, reporter_id")
    .eq("id", id)
    .maybeSingle();

  if (reportError) raiseDbError(reportError);
  if (!report) throw notFound("Laporan tidak ditemukan");

  const { error } = await admin
    .from("content_reports")
    .update({
      status: body.decision,
      reviewed_by: reviewer.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) raiseDbError(error);

  // Menyembunyikan bukan menghapus: data tetap ada untuk audit. Berita
  // berstatus `archived` hilang dari feed dan dari halaman detail, tapi baris
  // dan seluruh riwayatnya tetap utuh.
  if (body.decision === "actioned" && body.hideEvent && report.event_id) {
    const { error: hideError } = await admin
      .from("disaster_events")
      .update({ status: "archived" })
      .eq("id", report.event_id);
    if (hideError) raiseDbError(hideError);
  }

  // Pelapor diberi tahu keputusannya: tanpa ini laporan terasa masuk lubang
  // hitam, dan orang berhenti melaporkan.
  if (report.reporter_id) {
    await notify(c.env, {
      profileId: report.reporter_id,
      kind: `content_report_${body.decision}`,
      title:
        body.decision === "actioned"
          ? "Laporan kontenmu ditindaklanjuti"
          : "Laporan kontenmu ditinjau",
      body:
        body.decision === "actioned"
          ? "Terima kasih. Konten yang kamu laporkan sudah disembunyikan dari daftar publik."
          : "Setelah ditinjau, konten yang kamu laporkan tidak melanggar aturan. Terima kasih sudah membantu.",
      link: report.event_id ? `/bencana/${report.event_id}` : null,
    });
  }

  return c.json({ ok: true, status: body.decision });
});

/**
 * Antrean pencairan. Dana ditahan platform, jadi setiap pencairan butuh
 * persetujuan admin sebelum ditandai berpindah.
 */
adminRoutes.get("/disbursements", async (c) => {
  const admin = adminClient(c.env);
  const status = c.req.query("status") ?? "requested";

  const { data, error } = await admin
    .from("disbursements")
    .select(
      "id, pic_assignment_id, seq, amount, status, purpose, requested_at, is_simulated, pic_assignments(event_id, distributor_id, distributor_profiles(display_name), disaster_events(title))",
    )
    .eq("status", status)
    .order("requested_at", { ascending: true });

  if (error) raiseDbError(error);

  const rows = data ?? [];
  const ids = rows.map((row) => row.id);

  const { data: expenses, error: expensesError } = await admin
    .from("expenses")
    .select("disbursement_id, amount")
    .in("disbursement_id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);

  if (expensesError) raiseDbError(expensesError);

  const spentByDisbursement = new Map<string, number>();
  for (const expense of expenses ?? []) {
    spentByDisbursement.set(
      expense.disbursement_id,
      (spentByDisbursement.get(expense.disbursement_id) ?? 0) + Number(expense.amount),
    );
  }

  return c.json({
    items: rows.map((row) => ({
      ...row,
      amount: Number(row.amount),
      spent: spentByDisbursement.get(row.id) ?? 0,
    })),
  });
});

/**
 * Keputusan admin atas pencairan: setujui, tandai berpindah, atau tolak.
 *
 * `transferred` memicu trigger `fn_disbursement_ledger` yang menulis entri
 * keluar ke ledger. Karena itu status tidak boleh langsung di-set
 * `transferred` dari `requested` tanpa persetujuan — alurnya dua langkah,
 * sama seperti proses nyata.
 */
adminRoutes.post("/disbursements/:id/decision", async (c) => {
  const id = c.req.param("id");
  const reviewer = c.get("user");

  const body = (await c.req.json()) as {
    decision?: "approved" | "transferred" | "rejected";
    note?: string;
  };

  if (!body.decision || !["approved", "transferred", "rejected"].includes(body.decision)) {
    throw badRequest("invalid_body", "Keputusan tidak dikenal");
  }

  if (body.decision === "rejected" && !body.note?.trim()) {
    throw badRequest("note_required", "Alasan wajib diisi saat menolak");
  }

  const admin = adminClient(c.env);

  const { data: row, error } = await admin
    .from("disbursements")
    .select("id, status, pic_assignment_id, seq, amount")
    .eq("id", id)
    .maybeSingle();

  if (error) raiseDbError(error);
  if (!row) throw notFound("Pencairan tidak ditemukan");

  if (body.decision === "transferred" && row.status !== "approved") {
    throw conflict("not_approved", "Pencairan harus disetujui sebelum ditandai berpindah");
  }

  const patch: Record<string, unknown> = {};

  if (body.decision === "approved") {
    patch.status = "approved";
    patch.approved_by = reviewer.id;
    patch.approved_at = new Date().toISOString();
  } else if (body.decision === "transferred") {
    patch.status = "transferred";
    patch.transferred_at = new Date().toISOString();
  } else {
    patch.status = "rejected";
  }

  const { error: updateError } = await admin.from("disbursements").update(patch).eq("id", id);
  if (updateError) raiseDbError(updateError);

  const { data: assignment } = await admin
    .from("pic_assignments")
    .select("distributor_id, event_id")
    .eq("id", row.pic_assignment_id)
    .maybeSingle();

  if (assignment) {
    await admin.from("notifications").insert({
      profile_id: assignment.distributor_id,
      kind: `disbursement_${body.decision}`,
      title:
        body.decision === "approved"
          ? `Pencairan tahap ${row.seq} disetujui`
          : body.decision === "transferred"
            ? `Dana tahap ${row.seq} dicairkan`
            : `Pencairan tahap ${row.seq} ditolak`,
      body: body.note ?? null,
      link: `/bencana/${assignment.event_id}`,
    });
  }

  await admin.from("audit_logs").insert({
    actor_id: reviewer.id,
    action: `disbursement.${body.decision}`,
    entity: "disbursements",
    entity_id: id,
    payload: { note: body.note ?? null, amount: row.amount },
  });

  return c.json({ ok: true, status: patch.status });
});

/**
 * Jejak audit: siapa memutuskan apa dan kapan.
 *
 * Hanya admin. Isinya dipakai saat ditanya "kenapa berita ini hilang" atau
 * "siapa yang menyetujui pencairan ini" — pertanyaan yang pasti muncul saat
 * pitch, dan jawabannya harus ada, bukan diingat.
 */
adminRoutes.get("/audit-logs", async (c) => {
  const admin = adminClient(c.env);
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);

  const { data, error } = await admin
    .from("audit_logs")
    .select("id, actor_id, action, entity, entity_id, payload, created_at, profiles(display_name)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) raiseDbError(error);

  return c.json({
    items: (data ?? []).map((row) => ({
      id: row.id,
      action: row.action,
      entity: row.entity,
      entityId: row.entity_id,
      payload: row.payload,
      createdAt: row.created_at,
      actorName:
        (row.profiles as unknown as { display_name: string } | null)?.display_name ?? "—",
    })),
  });
});

/** Ringkasan untuk kartu di beranda admin. */
adminRoutes.get("/stats", async (c) => {
  const admin = adminClient(c.env);

  const [verifications, pics, reports, events, disbursements] = await Promise.all([
    admin
      .from("distributor_profiles")
      .select("profile_id", { count: "exact", head: true })
      .eq("verification_status", "pending"),
    admin
      .from("pic_assignments")
      .select("id", { count: "exact", head: true })
      .eq("status", "applied"),
    admin
      .from("content_reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    admin
      .from("v_event_feed")
      .select("id", { count: "exact", head: true })
      .eq("section", "pantau"),
    admin
      .from("disbursements")
      .select("id", { count: "exact", head: true })
      .eq("status", "requested"),
  ]);

  return c.json({
    pendingVerifications: verifications.count ?? 0,
    pendingPicApplications: pics.count ?? 0,
    openContentReports: reports.count ?? 0,
    monitoredEvents: events.count ?? 0,
    pendingDisbursements: disbursements.count ?? 0,
  });
});
