import { Hono } from "hono";

import { claimDonationSchema, createDonationSchema } from "@jangkau/shared";

import type { AppEnv } from "../../env.js";
import { raiseDbError } from "../../shared/db-errors.js";
import { badRequest, conflict, forbidden, notFound } from "../../shared/errors.js";
import { optionalAuth, requireAuth } from "../../shared/middleware/auth.js";
import { paymentProvider, renderQrSvg } from "../../shared/payments.js";
import { adminClient } from "../../shared/supabase.js";

export const donationRoutes = new Hono<AppEnv>();

type DonationRow = {
  id: string;
  pic_assignment_id: string;
  event_id: string;
  posko_id: string | null;
  donor_id: string | null;
  donor_name: string | null;
  is_anonymous: boolean;
  amount: number;
  currency: string;
  status: "pending" | "paid" | "expired" | "failed" | "refunded";
  midtrans_order_id: string;
  payment_type: string | null;
  qr_string: string | null;
  expires_at: string | null;
  paid_at: string | null;
  claim_token: string;
  guest_email: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  created_at: string;
};

/** Token acak untuk mengklaim donasi tamu setelah masuk. */
function claimToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Order id Midtrans: unik, mudah dibaca saat demo, tidak menebak isi tabel. */
function orderId(): string {
  const stamp = Date.now().toString(36).toUpperCase();
  const suffix = crypto.randomUUID().slice(0, 8).toUpperCase();
  return `JK-${stamp}-${suffix}`;
}

function serialize(row: DonationRow, qrSvg: string | null) {
  return {
    id: row.id,
    eventId: row.event_id,
    picAssignmentId: row.pic_assignment_id,
    poskoId: row.posko_id,
    orderId: row.midtrans_order_id,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status,
    paymentType: row.payment_type,
    qrString: row.qr_string,
    qrSvg,
    expiresAt: row.expires_at,
    paidAt: row.paid_at,
    donorName: row.is_anonymous ? null : row.donor_name,
    isAnonymous: row.is_anonymous,
    isGuest: row.donor_id === null,
    claimed: row.claimed_at !== null,
    claimToken: row.claim_token,
    createdAt: row.created_at,
  };
}

/**
 * Membuat donasi dan charge QRIS.
 *
 * Donatur tamu diperbolehkan (PRD DON-01): login hanya diwajibkan untuk
 * dukungan dan unggahan. Setiap donasi mengembalikan `claimToken`, yang dipakai
 * untuk menautkan donasi ke akun setelah pengguna masuk.
 */
donationRoutes.post("/", optionalAuth, async (c) => {
  const parsed = createDonationSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw badRequest("invalid_body", "Donasi tidak valid", parsed.error.issues);
  }

  const input = parsed.data;
  const user = c.get("user") as { id: string; displayName: string } | undefined;
  const admin = adminClient(c.env);

  // PIC harus sudah disetujui, dan posko (bila dipilih) harus milik event itu.
  const { data: assignment, error: assignmentError } = await admin
    .from("pic_assignments")
    .select("id, event_id, status, distributor_id")
    .eq("id", input.picAssignmentId)
    .maybeSingle();

  if (assignmentError) raiseDbError(assignmentError);
  if (!assignment) throw notFound("Penanggung jawab tidak ditemukan");
  if (assignment.status !== "approved") {
    throw conflict("pic_not_approved", "Penanggung jawab ini belum disetujui admin");
  }

  const { data: event, error: eventError } = await admin
    .from("disaster_events")
    .select("id, title")
    .eq("id", assignment.event_id)
    .maybeSingle();

  if (eventError) raiseDbError(eventError);
  if (!event) throw notFound("Berita bencana tidak ditemukan");

  const id = crypto.randomUUID();
  const token = claimToken();
  const order = orderId();

  const { data: created, error: insertError } = await admin
    .from("donations")
    .insert({
      id,
      pic_assignment_id: assignment.id,
      event_id: assignment.event_id,
      posko_id: input.poskoId ?? null,
      donor_id: user?.id ?? null,
      // Nama donatur: yang diketik pengguna, kalau tidak ada pakai nama profil.
      donor_name: input.anonymous ? null : (input.donorName ?? user?.displayName ?? null),
      is_anonymous: input.anonymous,
      amount: input.amount,
      status: "pending",
      midtrans_order_id: order,
      claim_token: token,
      guest_email: input.guestEmail ?? null,
    })
    .select("*")
    .single();

  if (insertError) raiseDbError(insertError);

  const provider = paymentProvider(c.env);
  const charge = await provider.createCharge({
    orderId: order,
    amount: input.amount,
    expiresMinutes: 15,
    itemName: `Donasi ${event.title}`,
    customerName: input.donorName,
    customerEmail: input.guestEmail,
  });

  const { data: updated, error: updateError } = await admin
    .from("donations")
    .update({
      qr_string: charge.qrString,
      payment_type: "qris",
      midtrans_transaction_id: charge.transactionId,
      expires_at: charge.expiresAt,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (updateError) raiseDbError(updateError);

  return c.json(
    {
      donation: serialize(updated as DonationRow, await renderQrSvg(charge.qrString)),
      provider: charge.provider,
      qrUrl: charge.qrUrl,
    },
    201,
  );
});

/**
 * Status satu donasi. Donatur login memakai sesi; tamu memakai `claimToken`
 * yang diterima saat membuat donasi, supaya id donasi saja tidak cukup untuk
 * membaca data orang lain.
 */
donationRoutes.get("/:id", optionalAuth, async (c) => {
  const id = c.req.param("id");
  const token = c.req.query("token");
  const user = c.get("user") as { id: string } | undefined;
  const admin = adminClient(c.env);

  const { data, error } = await admin.from("donations").select("*").eq("id", id).maybeSingle();
  if (error) raiseDbError(error);
  if (!data) throw notFound("Donasi tidak ditemukan");

  const row = data as DonationRow;
  const allowed =
    (user && (row.donor_id === user.id || row.claimed_by === user.id)) ||
    (token && token === row.claim_token);

  if (!allowed) throw forbidden("Tidak punya akses ke donasi ini");

  return c.json({
    donation: serialize(row, row.qr_string ? await renderQrSvg(row.qr_string) : null),
    provider: paymentProvider(c.env).kind,
  });
});

/**
 * Menandai donasi lunas pada mode simulasi.
 *
 * Hanya tersedia ketika provider adalah mock. Kalau Midtrans dikonfigurasi,
 * endpoint ini menolak — uang nyata tidak boleh bisa ditandai lunas dari sini.
 */
donationRoutes.post("/:id/simulate-paid", async (c) => {
  if (paymentProvider(c.env).kind !== "mock") {
    throw forbidden("Simulasi pembayaran hanya tersedia saat Midtrans belum dikonfigurasi");
  }

  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as { token?: string };
  const admin = adminClient(c.env);

  const { data, error } = await admin.from("donations").select("*").eq("id", id).maybeSingle();
  if (error) raiseDbError(error);
  if (!data) throw notFound("Donasi tidak ditemukan");

  const row = data as DonationRow;
  // Token wajib: tanpa itu siapa pun yang menebak id donasi bisa menandainya
  // lunas. Pada mode mock dampaknya hanya data demo, tapi lebih baik benar.
  if (!body.token || body.token !== row.claim_token) {
    throw forbidden("Token donasi tidak cocok");
  }
  if (row.status === "paid") {
    return c.json({ donation: serialize(row, null), alreadyPaid: true });
  }

  const { data: updated, error: updateError } = await admin
    .from("donations")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      midtrans_transaction_id: `mock-${row.midtrans_order_id}`,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (updateError) raiseDbError(updateError);

  return c.json({ donation: serialize(updated as DonationRow, null), alreadyPaid: false });
});

/**
 * Notifikasi pembayaran. Tanpa JWT: keaslian dijaga tanda tangan provider.
 * Idempoten terhadap notifikasi berulang.
 */
donationRoutes.post("/webhook/:provider", async (c) => {
  const providerName = c.req.param("provider");
  const provider = paymentProvider(c.env);

  if (providerName !== provider.kind) {
    throw badRequest("provider_mismatch", "Provider notifikasi tidak sesuai konfigurasi");
  }

  const payload = await c.req.json().catch(() => null);
  if (!payload) throw badRequest("invalid_body", "Notifikasi tidak valid");

  const parsed = await provider.parseWebhook(payload, c.req.header("x-signature") ?? null);
  if (!parsed) throw forbidden("Tanda tangan notifikasi tidak valid");

  const admin = adminClient(c.env);

  const { data, error } = await admin
    .from("donations")
    .select("id, status, amount")
    .eq("midtrans_order_id", parsed.orderId)
    .maybeSingle();

  if (error) raiseDbError(error);
  if (!data) throw notFound("Pesanan tidak ditemukan");

  if (data.status === "paid" && parsed.status === "paid") {
    return c.json({ ok: true, duplicated: true });
  }

  const patch: Record<string, unknown> = {
    raw_notification: parsed.raw,
    midtrans_transaction_id: parsed.transactionId,
    payment_type: parsed.paymentType,
  };

  if (parsed.status === "paid") {
    patch.status = "paid";
    patch.paid_at = new Date().toISOString();
  } else if (parsed.status === "expired" || parsed.status === "failed") {
    patch.status = parsed.status;
  }

  const { error: updateError } = await admin.from("donations").update(patch).eq("id", data.id);
  if (updateError) raiseDbError(updateError);

  return c.json({ ok: true, status: parsed.status });
});

/** Menautkan donasi tamu ke akun setelah pengguna masuk. */
donationRoutes.post("/:id/claim", requireAuth, async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");

  const parsed = claimDonationSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw badRequest("invalid_body", "Token klaim tidak valid", parsed.error.issues);
  }

  const admin = adminClient(c.env);

  const { data, error } = await admin.from("donations").select("*").eq("id", id).maybeSingle();
  if (error) raiseDbError(error);
  if (!data) throw notFound("Donasi tidak ditemukan");

  const row = data as DonationRow;

  if (row.claim_token !== parsed.data.claimToken) {
    throw forbidden("Token klaim tidak cocok");
  }

  if (row.claimed_at) {
    return c.json({
      donation: serialize(row, null),
      alreadyClaimed: true,
      claimedByMe: row.claimed_by === user.id,
    });
  }

  const { data: updated, error: updateError } = await admin
    .from("donations")
    .update({
      claimed_by: user.id,
      claimed_at: new Date().toISOString(),
      donor_id: row.donor_id ?? user.id,
      donor_name: row.donor_name ?? user.displayName,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (updateError) raiseDbError(updateError);

  return c.json({ donation: serialize(updated as DonationRow, null), alreadyClaimed: false });
});

/** Riwayat donasi milik pemanggil, termasuk donasi tamu yang sudah diklaim. */
donationRoutes.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const admin = adminClient(c.env);

  const { data, error } = await admin
    .from("donations")
    .select(
      "id, event_id, amount, status, paid_at, created_at, is_anonymous, disaster_events(title), pic_assignments(distributor_id)",
    )
    .or(`donor_id.eq.${user.id},claimed_by.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) raiseDbError(error);

  return c.json({ items: data ?? [] });
});
