import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../../env.js";
import { raiseDbError } from "../../shared/db-errors.js";
import { badRequest, conflict, forbidden, notFound } from "../../shared/errors.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { adminClient } from "../../shared/supabase.js";

export const organizationRoutes = new Hono<AppEnv>();

const registerSchema = z.object({
  name: z.string().trim().min(3).max(140),
  legalType: z.string().trim().max(40).optional(),
  legalDocKey: z.string().min(3).max(512),
  picName: z.string().trim().min(3).max(120),
  picPhone: z.string().trim().min(6).max(30),
  picEmail: z.email().max(160).optional(),
});

/**
 * Pendaftaran organisasi. Akun langsung jadi `owner`, tetapi semua
 * kewenangan tetap menunggu `verification_status = 'verified'`.
 */
organizationRoutes.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  const parsed = registerSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw badRequest("invalid_body", "Data organisasi tidak valid", parsed.error.issues);
  }

  const input = parsed.data;
  const admin = adminClient(c.env);

  const { data: existingMember } = await admin
    .from("organization_members")
    .select("organization_id")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (existingMember) {
    throw conflict("already_member", "Akun ini sudah terhubung ke sebuah organisasi");
  }

  const { data: org, error } = await admin
    .from("organizations")
    .insert({
      name: input.name,
      legal_type: input.legalType ?? null,
      legal_doc_key: input.legalDocKey,
      pic_name: input.picName,
      pic_phone: input.picPhone,
      pic_email: input.picEmail ?? null,
    })
    .select("id, name, verification_status, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw conflict("name_taken", "Nama organisasi sudah dipakai");
    }
    raiseDbError(error);
  }

  const { error: memberError } = await admin
    .from("organization_members")
    .insert({ organization_id: org.id, profile_id: user.id, member_role: "owner" });
  if (memberError) raiseDbError(memberError);

  // Peran profil ikut naik agar navigasi konsisten; kewenangan tetap
  // ditentukan oleh status verifikasi organisasi, bukan peran ini.
  await admin.from("profiles").update({ role: "organization" }).eq("id", user.id);

  return c.json({ organization: org }, 201);
});

/** Organisasi milik pemanggil, termasuk status verifikasi dan alasannya. */
organizationRoutes.get("/me", requireAuth, async (c) => {
  const user = c.get("user");
  const admin = adminClient(c.env);

  const { data: membership, error } = await admin
    .from("organization_members")
    .select("organization_id, member_role")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (error) raiseDbError(error);
  if (!membership) return c.json({ organization: null });

  const { data: org } = await admin
    .from("organizations")
    .select(
      "id, name, legal_type, pic_name, pic_phone, pic_email, verification_status, verified_at, rejection_reason, created_at",
    )
    .eq("id", membership.organization_id)
    .maybeSingle();

  return c.json({ organization: org, memberRole: membership.member_role });
});

export const adminOrganizationRoutes = new Hono<AppEnv>();

adminOrganizationRoutes.use("*", requireAuth);

/** Antrean verifikasi. Hanya admin. */
adminOrganizationRoutes.get("/", async (c) => {
  if (c.get("user").role !== "admin") throw forbidden("Hanya admin");

  const admin = adminClient(c.env);
  const status = c.req.query("status") ?? "pending";

  let query = admin
    .from("organizations")
    .select(
      "id, name, legal_type, legal_doc_key, pic_name, pic_phone, pic_email, verification_status, verified_at, rejection_reason, created_at",
    )
    .order("created_at", { ascending: true });

  if (status !== "all") {
    if (!["pending", "verified", "rejected", "suspended"].includes(status)) {
      throw badRequest("invalid_status", "Status tidak dikenali");
    }
    query = query.eq("verification_status", status);
  }

  const { data, error } = await query;
  if (error) raiseDbError(error);

  return c.json({ items: data ?? [] });
});

const decisionSchema = z.object({
  decision: z.enum(["verified", "rejected"]),
  reason: z.string().trim().max(300).optional(),
});

/**
 * Verifikasi organisasi. Keputusan dicatat di audit_logs karena inilah
 * satu-satunya gerbang yang mengizinkan organisasi mengelola dana.
 */
adminOrganizationRoutes.post("/:id/verify", async (c) => {
  const user = c.get("user");
  if (user.role !== "admin") throw forbidden("Hanya admin");

  const parsed = decisionSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw badRequest("invalid_body", "Keputusan tidak valid", parsed.error.issues);
  }

  const { decision, reason } = parsed.data;
  if (decision === "rejected" && !reason) {
    throw badRequest("reason_required", "Alasan penolakan wajib diisi");
  }

  const admin = adminClient(c.env);
  const id = c.req.param("id");

  const { data: org, error } = await admin
    .from("organizations")
    .update({
      verification_status: decision,
      verified_by: decision === "verified" ? user.id : null,
      verified_at: decision === "verified" ? new Date().toISOString() : null,
      rejection_reason: decision === "rejected" ? reason : null,
    })
    .eq("id", id)
    .select("id, name, verification_status, verified_at, rejection_reason")
    .maybeSingle();

  if (error) raiseDbError(error);
  if (!org) throw notFound("Organisasi tidak ditemukan");

  const { error: auditError } = await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: `org.${decision}`,
    entity: "organization",
    entity_id: id,
    meta: { reason: reason ?? null },
  });
  if (auditError) raiseDbError(auditError);

  return c.json({ organization: org });
});

/** Jejak audit terakhir, untuk panel admin. */
adminOrganizationRoutes.get("/audit", async (c) => {
  if (c.get("user").role !== "admin") throw forbidden("Hanya admin");

  const admin = adminClient(c.env);
  const { data, error } = await admin
    .from("audit_logs")
    .select("id, actor_id, action, entity, entity_id, meta, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) raiseDbError(error);
  return c.json({ items: data ?? [] });
});
