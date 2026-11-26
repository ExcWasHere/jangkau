import { Hono } from "hono";
import { z } from "zod";

import { budgetItemSchema, createCampaignSchema } from "@jangkau/shared";

import type { AppEnv } from "../../env.js";
import { raiseDbError } from "../../shared/db-errors.js";
import { badRequest, conflict, forbidden, notFound, unprocessable } from "../../shared/errors.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { presignGet } from "../../shared/r2.js";
import { adminClient } from "../../shared/supabase.js";

export const campaignRoutes = new Hono<AppEnv>();

campaignRoutes.use("*", requireAuth);

/**
 * Daftar kampanye sesuai peran:
 * - organisasi: kampanye miliknya
 * - pelapor: kampanye yang menunggu konfirmasinya, atau yang berasal dari
 *   laporannya
 * - admin: semua
 */
campaignRoutes.get("/", async (c) => {
  const user = c.get("user");
  const admin = adminClient(c.env);
  const scope = c.req.query("scope") ?? "mine";

  let query = admin
    .from("campaigns")
    .select(
      "id, report_id, organization_id, title, summary, target_amount, raised_amount, status, reporter_confirmed_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (scope === "awaiting" && user.role !== "admin") {
    // Pelapor: kampanye untuk laporan miliknya yang menunggu konfirmasi.
    const { data: mine } = await admin
      .from("reports")
      .select("id")
      .eq("reporter_id", user.id);

    const ids = (mine ?? []).map((row) => row.id);
    if (ids.length === 0) return c.json({ items: [] });
    query = query.in("report_id", ids).eq("status", "awaiting_confirmation");
  } else if (user.role !== "admin" && user.organizationId) {
    query = query.eq("organization_id", user.organizationId);
  } else if (user.role !== "admin") {
    const { data: mine } = await admin.from("reports").select("id").eq("reporter_id", user.id);
    const ids = (mine ?? []).map((row) => row.id);
    if (ids.length === 0) return c.json({ items: [] });
    query = query.in("report_id", ids);
  }

  const { data, error } = await query;
  if (error) raiseDbError(error);

  return c.json({ items: data ?? [] });
});

/** Rincian kampanye: RAB, donasi, dan tahap pencairan. */
campaignRoutes.get("/:id", async (c) => {
  const admin = adminClient(c.env);
  const id = c.req.param("id");

  const { data: campaign, error } = await admin
    .from("campaigns")
    .select(
      "id, report_id, organization_id, title, summary, target_amount, raised_amount, status, reporter_confirmed_at, activated_at, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) raiseDbError(error);
  if (!campaign) throw notFound("Kampanye tidak ditemukan");

  const [{ data: items }, { data: tranches }, { data: donations }, { data: org }] =
    await Promise.all([
      admin.from("budget_items").select("*").eq("campaign_id", id).order("created_at"),
      admin.from("tranches").select("*").eq("campaign_id", id).order("seq"),
      admin
        .from("donations")
        .select("id, amount, status, donor_name, created_at, paid_at")
        .eq("campaign_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      admin.from("public_organizations").select("id, name").eq("id", campaign.organization_id).maybeSingle(),
    ]);

  const trancheIds = (tranches ?? []).map((row) => row.id);
  const { data: receipts } = trancheIds.length
    ? await admin.from("tranche_receipts").select("*").in("tranche_id", trancheIds)
    : { data: [] };

  const signedReceipts = await Promise.all(
    (receipts ?? []).map(async (receipt) => ({
      ...receipt,
      url: await presignGet(c.env, receipt.r2_key),
    })),
  );

  return c.json({
    campaign,
    organization: org,
    items: items ?? [],
    donations: donations ?? [],
    tranches: (tranches ?? []).map((tranche) => ({
      ...tranche,
      receipts: signedReceipts.filter((receipt) => receipt.tranche_id === tranche.id),
    })),
  });
});

/**
 * Ambil alih laporan dan susun RAB.
 *
 * Syarat yang ditegakkan di sini (bukan hanya di UI): organisasi
 * terverifikasi, laporan sudah memenuhi ambang dukungan, dan laporan
 * belum punya kampanye.
 */
campaignRoutes.post("/", async (c) => {
  const user = c.get("user");
  if (!user.organizationId) {
    throw forbidden("Akun harus terhubung ke organisasi yang sudah terverifikasi");
  }

  const parsed = createCampaignSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw badRequest("invalid_body", "RAB tidak valid", parsed.error.issues);
  }

  const input = parsed.data;
  const admin = adminClient(c.env);

  const { data: report } = await admin
    .from("reports")
    .select("id, post_id, status, reporter_id")
    .eq("id", input.reportId)
    .maybeSingle();

  if (!report) throw notFound("Laporan tidak ditemukan");
  if (report.status !== "eligible") {
    throw unprocessable(
      "report_not_eligible",
      "Laporan belum memenuhi ambang dukungan sehingga belum bisa diambil",
      { status: report.status },
    );
  }

  const { data: existing } = await admin
    .from("campaigns")
    .select("id")
    .eq("report_id", input.reportId)
    .maybeSingle();

  if (existing) throw conflict("campaign_exists", "Laporan ini sudah punya kampanye");

  const target = input.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
  if (target <= 0) throw badRequest("empty_budget", "Total RAB harus lebih dari nol");

  const { data: campaign, error } = await admin
    .from("campaigns")
    .insert({
      report_id: input.reportId,
      organization_id: user.organizationId,
      title: input.title,
      summary: input.summary ?? null,
      target_amount: target,
      status: "draft",
    })
    .select("id, title, target_amount, status")
    .single();

  if (error) raiseDbError(error);

  const { error: itemsError } = await admin.from("budget_items").insert(
    input.items.map((item) => ({
      campaign_id: campaign.id,
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      unit_cost: item.unitCost,
      note: item.note ?? null,
    })),
  );
  if (itemsError) raiseDbError(itemsError);

  await admin.from("reports").update({ status: "taken_up" }).eq("id", input.reportId);

  return c.json({ campaign }, 201);
});

/** Ajukan RAB ke pelapor. Hanya organisasi pemilik kampanye. */
campaignRoutes.post("/:id/request-confirmation", async (c) => {
  const user = c.get("user");
  const admin = adminClient(c.env);
  const id = c.req.param("id");

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, organization_id, status")
    .eq("id", id)
    .maybeSingle();

  if (!campaign) throw notFound("Kampanye tidak ditemukan");
  if (campaign.organization_id !== user.organizationId && user.role !== "admin") {
    throw forbidden();
  }
  if (campaign.status !== "draft") {
    throw unprocessable("invalid_state", "Hanya kampanye draf yang bisa diajukan");
  }

  const { data, error } = await admin
    .from("campaigns")
    .update({ status: "awaiting_confirmation" })
    .eq("id", id)
    .select("id, status")
    .maybeSingle();

  if (error) raiseDbError(error);
  return c.json(data);
});

/**
 * Konfirmasi pelapor. Inilah gerbang yang membuka donasi: kampanye tidak
 * bisa berstatus `active` tanpa `reporter_confirmed_at` (dijaga juga oleh
 * constraint di tabel campaigns).
 */
campaignRoutes.post("/:id/confirm", async (c) => {
  const user = c.get("user");
  const admin = adminClient(c.env);
  const id = c.req.param("id");

  const body = (await c.req.json().catch(() => ({}))) as { accept?: boolean };
  const accept = body.accept !== false;

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, report_id, status")
    .eq("id", id)
    .maybeSingle();

  if (!campaign) throw notFound("Kampanye tidak ditemukan");
  if (campaign.status !== "awaiting_confirmation") {
    throw unprocessable("invalid_state", "Kampanye belum menunggu konfirmasi pelapor");
  }

  const { data: report } = await admin
    .from("reports")
    .select("reporter_id")
    .eq("id", campaign.report_id)
    .maybeSingle();

  if (!report) throw notFound("Laporan tidak ditemukan");
  if (report.reporter_id !== user.id && user.role !== "admin") {
    throw forbidden("Hanya pelapor laporan ini yang boleh mengonfirmasi RAB");
  }

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("campaigns")
    .update(
      accept
        ? {
            status: "active",
            reporter_confirmed_by: user.id,
            reporter_confirmed_at: now,
            activated_at: now,
          }
        : { status: "cancelled" },
    )
    .eq("id", id)
    .select("id, status, reporter_confirmed_at")
    .maybeSingle();

  if (error) raiseDbError(error);
  return c.json(data);
});

const donateSchema = z.object({
  amount: z.number().positive().max(1_000_000_000),
  donorName: z.string().trim().max(80).optional(),
});

/**
 * Donasi mode simulasi.
 *
 * Tidak ada panggilan ke payment gateway: donasi langsung dicatat sebagai
 * `paid` dengan penanda `simulated`, sehingga seluruh alur pencairan bisa
 * diuji tanpa akun merchant. Label ini juga tampil di UI.
 */
campaignRoutes.post("/:id/donations", async (c) => {
  const user = c.get("user");
  const parsed = donateSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw badRequest("invalid_body", "Nominal donasi tidak valid", parsed.error.issues);
  }

  const admin = adminClient(c.env);
  const id = c.req.param("id");

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, status, target_amount, raised_amount")
    .eq("id", id)
    .maybeSingle();

  if (!campaign) throw notFound("Kampanye tidak ditemukan");
  if (!["active", "funded"].includes(campaign.status)) {
    throw unprocessable("not_accepting", "Kampanye belum menerima donasi");
  }

  // Donasi disimpan `pending` lalu di-update ke `paid`, bukan langsung
  // `paid`. Trigger `fn_donation_paid` hanya berjalan pada UPDATE, dan
  // trigger itulah satu-satunya yang menghitung `campaigns.raised_amount`
  // serta mengubah status menjadi `funded`. Menyisipkan baris `paid`
  // langsung akan melewati trigger dan membuat total donasi tidak pernah
  // bertambah.
  const { data: pending, error } = await admin
    .from("donations")
    .insert({
      campaign_id: id,
      donor_id: user.id,
      donor_name: parsed.data.donorName ?? user.fullName,
      amount: parsed.data.amount,
      status: "pending",
      // Nomor order unik untuk simulasi; gateway sungguhan memakai order id sendiri.
      midtrans_order_id: `SIM-${crypto.randomUUID()}`,
      payment_type: "simulation",
    })
    .select("id")
    .single();

  if (error) raiseDbError(error);

  const { data, error: payError } = await admin
    .from("donations")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", pending.id)
    .select("id, amount, status, created_at")
    .single();

  if (payError) raiseDbError(payError);

  const { data: updated } = await admin
    .from("campaigns")
    .select("raised_amount, status")
    .eq("id", id)
    .maybeSingle();

  return c.json(
    { donation: data, campaign: updated, simulated: true },
    201,
  );
});

/** Rencana pencairan bertahap. Total tidak boleh melebihi target. */
campaignRoutes.post("/:id/tranches", async (c) => {
  const user = c.get("user");
  const admin = adminClient(c.env);
  const id = c.req.param("id");

  const schema = z.object({
    amount: z.number().positive(),
    purpose: z.string().trim().max(200).optional(),
  });
  const parsed = schema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw badRequest("invalid_body", "Rencana pencairan tidak valid", parsed.error.issues);
  }

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, organization_id, status, target_amount")
    .eq("id", id)
    .maybeSingle();

  if (!campaign) throw notFound("Kampanye tidak ditemukan");
  if (campaign.organization_id !== user.organizationId && user.role !== "admin") {
    throw forbidden();
  }

  const { data: existing } = await admin
    .from("tranches")
    .select("seq, amount")
    .eq("campaign_id", id)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextSeq = (existing?.seq ?? 0) + 1;

  const { data: all } = await admin.from("tranches").select("amount").eq("campaign_id", id);
  const planned = (all ?? []).reduce((sum, row) => sum + Number(row.amount), 0);

  if (planned + parsed.data.amount > Number(campaign.target_amount)) {
    throw unprocessable(
      "exceeds_target",
      "Total rencana pencairan melebihi target kampanye",
      { planned, target: Number(campaign.target_amount) },
    );
  }

  const { data, error } = await admin
    .from("tranches")
    .insert({
      campaign_id: id,
      seq: nextSeq,
      amount: parsed.data.amount,
      purpose: parsed.data.purpose ?? null,
    })
    .select("id, seq, amount, status")
    .single();

  if (error) raiseDbError(error);
  return c.json({ tranche: data }, 201);
});

export const trancheRoutes = new Hono<AppEnv>();

trancheRoutes.use("*", requireAuth);

/** Unggah bukti belanja untuk satu tahap. */
trancheRoutes.post("/:id/receipts", async (c) => {
  const user = c.get("user");
  const admin = adminClient(c.env);
  const id = c.req.param("id");

  const schema = z.object({
    r2Key: z.string().min(3).max(512),
    vendor: z.string().trim().max(120).optional(),
    amount: z.number().nonnegative().optional(),
    purchasedAt: z.string().optional(),
  });
  const parsed = schema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw badRequest("invalid_body", "Bukti belanja tidak valid", parsed.error.issues);
  }

  const { data: tranche } = await admin
    .from("tranches")
    .select("id, campaign_id, status")
    .eq("id", id)
    .maybeSingle();

  if (!tranche) throw notFound("Tahap tidak ditemukan");

  const { data: campaign } = await admin
    .from("campaigns")
    .select("organization_id")
    .eq("id", tranche.campaign_id)
    .maybeSingle();

  if (campaign?.organization_id !== user.organizationId && user.role !== "admin") {
    throw forbidden();
  }
  if (tranche.status === "released") {
    throw unprocessable("already_released", "Tahap ini sudah dicairkan");
  }

  const { data, error } = await admin
    .from("tranche_receipts")
    .insert({
      tranche_id: id,
      r2_key: parsed.data.r2Key,
      vendor: parsed.data.vendor ?? null,
      amount: parsed.data.amount ?? null,
      purchased_at: parsed.data.purchasedAt ?? null,
      uploaded_by: user.id,
    })
    .select("id, r2_key")
    .single();

  if (error) raiseDbError(error);

  await admin
    .from("tranches")
    .update({ status: "receipts_submitted" })
    .eq("id", id)
    .in("status", ["planned", "receipts_submitted"]);

  return c.json({ receipt: data }, 201);
});

/** Konfirmasi barang diterima di pos. */
trancheRoutes.post("/:id/confirm-goods", async (c) => {
  const user = c.get("user");
  const admin = adminClient(c.env);
  const id = c.req.param("id");

  const { data: tranche } = await admin
    .from("tranches")
    .select("id, campaign_id, status")
    .eq("id", id)
    .maybeSingle();

  if (!tranche) throw notFound("Tahap tidak ditemukan");

  const { data: campaign } = await admin
    .from("campaigns")
    .select("organization_id")
    .eq("id", tranche.campaign_id)
    .maybeSingle();

  if (campaign?.organization_id !== user.organizationId && user.role !== "admin") {
    throw forbidden();
  }
  if (!["receipts_submitted", "goods_confirmed"].includes(tranche.status)) {
    throw unprocessable("invalid_state", "Bukti belanja harus diunggah lebih dulu");
  }

  const { data, error } = await admin
    .from("tranches")
    .update({
      status: "goods_confirmed",
      goods_confirmed_at: new Date().toISOString(),
      goods_confirmed_by: user.id,
    })
    .eq("id", id)
    .select("id, status, goods_confirmed_at")
    .maybeSingle();

  if (error) raiseDbError(error);
  return c.json(data);
});

/**
 * Rilis dana. Semua syarat ditegakkan trigger `fn_tranche_guard`, jadi
 * endpoint ini tidak boleh "membantu" dengan melonggarkan aturan: kalau
 * trigger menolak, permintaan gagal.
 */
trancheRoutes.post("/:id/release", async (c) => {
  const user = c.get("user");
  if (user.role !== "admin") throw forbidden("Hanya admin yang boleh merilis dana");

  const admin = adminClient(c.env);
  const id = c.req.param("id");

  const { data, error } = await admin
    .from("tranches")
    .update({ status: "released", released_at: new Date().toISOString(), released_by: user.id })
    .eq("id", id)
    .select("id, status, released_at, amount")
    .maybeSingle();

  if (error) {
    // Pesan dari trigger diteruskan apa adanya agar operator tahu syarat
    // mana yang belum terpenuhi.
    const message = String(error.message ?? "");
    if (message.includes("goods_not_confirmed")) {
      throw unprocessable("goods_not_confirmed", "Barang belum dikonfirmasi diterima");
    }
    if (message.includes("no_receipts")) {
      throw unprocessable("no_receipts", "Belum ada bukti belanja yang diunggah");
    }
    if (message.includes("previous_tranche_not_released")) {
      throw unprocessable("previous_tranche_not_released", "Tahap sebelumnya belum dicairkan");
    }
    if (message.includes("tranche_exceeds_raised")) {
      throw unprocessable("exceeds_raised", "Dana terkumpul belum mencukupi tahap ini");
    }
    raiseDbError(error);
  }

  if (!data) throw notFound("Tahap tidak ditemukan");

  await admin.from("audit_logs").insert({
    actor_id: user.id,
    action: "tranche.release",
    entity: "tranche",
    entity_id: id,
    meta: { amount: data.amount },
  });

  return c.json(data);
});

export const budgetSchema = budgetItemSchema;
