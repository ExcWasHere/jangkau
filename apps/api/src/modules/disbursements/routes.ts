import { Hono } from "hono";

import { confirmExpenseSchema, createExpenseSchema, requestDisbursementSchema } from "@jangkau/shared";

import type { AppEnv } from "../../env.js";
import { raiseDbError } from "../../shared/db-errors.js";
import { badRequest, conflict, forbidden, notFound } from "../../shared/errors.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { publicUrl } from "../../shared/r2.js";
import { adminClient } from "../../shared/supabase.js";

export const disbursementRoutes = new Hono<AppEnv>();

disbursementRoutes.use("*", requireAuth);

type DisbursementRow = {
  id: string;
  pic_assignment_id: string;
  seq: number;
  amount: number;
  status: "locked" | "requested" | "approved" | "transferred" | "rejected";
  purpose: string | null;
  requested_at: string | null;
  approved_at: string | null;
  transferred_at: string | null;
  is_simulated: boolean;
  created_at: string;
};

type ExpenseRow = {
  id: string;
  disbursement_id: string;
  posko_id: string | null;
  item_name: string;
  category: string;
  quantity: number | null;
  unit: string | null;
  amount: number;
  merchant: string | null;
  purchased_at: string | null;
  receipt_r2_key: string;
  note: string | null;
  status: "submitted" | "confirmed" | "disputed";
  created_at: string;
};

/**
 * Memastikan penugasan ada dan milik pemanggil (atau pemanggil admin).
 * Semua aksi di modul ini berpusat pada satu penugasan, jadi pemeriksaan
 * aksesnya disatukan di sini.
 */
async function loadAssignment(
  env: AppEnv["Bindings"],
  assignmentId: string,
  viewer: { id: string; isAdmin: boolean },
  options: { requireOwner?: boolean } = {},
) {
  const admin = adminClient(env);

  const { data, error } = await admin
    .from("pic_assignments")
    .select("id, event_id, distributor_id, status")
    .eq("id", assignmentId)
    .maybeSingle();

  if (error) raiseDbError(error);
  if (!data) throw notFound("Penugasan penanggung jawab tidak ditemukan");

  const isOwner = data.distributor_id === viewer.id;
  if (options.requireOwner && !isOwner) {
    throw forbidden("Hanya penanggung jawab ini yang boleh melakukan aksi tersebut");
  }
  if (!isOwner && !viewer.isAdmin) {
    throw forbidden("Tidak punya akses ke penugasan ini");
  }

  if (options.requireOwner && data.status !== "approved") {
    throw conflict("pic_not_approved", "Penugasan ini belum disetujui admin");
  }

  return data;
}

function serializeDisbursement(row: DisbursementRow, receipts: number, confirmed: number) {
  return {
    id: row.id,
    picAssignmentId: row.pic_assignment_id,
    seq: row.seq,
    amount: Number(row.amount),
    status: row.status,
    purpose: row.purpose,
    requestedAt: row.requested_at,
    approvedAt: row.approved_at,
    transferredAt: row.transferred_at,
    isSimulated: row.is_simulated,
    createdAt: row.created_at,
    receiptCount: receipts,
    confirmedCount: confirmed,
  };
}

/**
 * Mengajukan pencairan.
 *
 * Batas 40% per tahap, ketersediaan saldo, dan kunci tahap sebelumnya
 * ditegakkan trigger `fn_guard_disbursement` di database. Di sini hanya
 * disiapkan nomor tahap dan status awal, lalu galat trigger diterjemahkan
 * `raiseDbError` menjadi pesan yang bisa dibaca pengguna.
 */
disbursementRoutes.post("/assignments/:id/request", async (c) => {
  const assignmentId = c.req.param("id");
  const user = c.get("user");

  const parsed = requestDisbursementSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw badRequest("invalid_body", "Permintaan pencairan tidak valid", parsed.error.issues);
  }

  await loadAssignment(c.env, assignmentId, user, { requireOwner: true });

  const admin = adminClient(c.env);

  const { data: last, error: lastError } = await admin
    .from("disbursements")
    .select("seq")
    .eq("pic_assignment_id", assignmentId)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastError) raiseDbError(lastError);

  const seq = (last?.seq ?? 0) + 1;

  const { data, error } = await admin
    .from("disbursements")
    .insert({
      pic_assignment_id: assignmentId,
      seq,
      amount: parsed.data.amount,
      purpose: parsed.data.purpose,
      status: "requested",
      requested_at: new Date().toISOString(),
      is_simulated: true,
    })
    .select("*")
    .single();

  if (error) raiseDbError(error);

  return c.json({ disbursement: serializeDisbursement(data as DisbursementRow, 0, 0) }, 201);
});

/** Rincian pencairan beserta bukti belanja dan konfirmasinya. */
disbursementRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const admin = adminClient(c.env);

  const { data: row, error } = await admin
    .from("disbursements")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) raiseDbError(error);
  if (!row) throw notFound("Pencairan tidak ditemukan");

  const disbursement = row as DisbursementRow;
  await loadAssignment(c.env, disbursement.pic_assignment_id, user);

  const { data: expenses, error: expensesError } = await admin
    .from("expenses")
    .select("*")
    .eq("disbursement_id", id)
    .order("created_at", { ascending: false });

  if (expensesError) raiseDbError(expensesError);

  const expenseRows = (expenses ?? []) as ExpenseRow[];

  const { data: confirmations, error: confirmError } = await admin
    .from("expense_confirmations")
    .select("expense_id, profile_id, decision, note, created_at, profiles(display_name)")
    .in(
      "expense_id",
      expenseRows.length > 0 ? expenseRows.map((expense) => expense.id) : ["00000000-0000-0000-0000-000000000000"],
    );

  if (confirmError) raiseDbError(confirmError);

  const byExpense = new Map<string, typeof confirmations>();
  for (const confirmation of confirmations ?? []) {
    const list = byExpense.get(confirmation.expense_id) ?? [];
    list.push(confirmation);
    byExpense.set(confirmation.expense_id, list);
  }

  return c.json({
    disbursement: serializeDisbursement(
      disbursement,
      expenseRows.length,
      expenseRows.filter((expense) => expense.status === "confirmed").length,
    ),
    expenses: expenseRows.map((expense) => ({
      ...expense,
      amount: Number(expense.amount),
      receiptUrl: publicUrl(c.env, expense.receipt_r2_key),
      confirmations: (byExpense.get(expense.id) ?? []).map((confirmation) => ({
        profileId: confirmation.profile_id,
        decision: confirmation.decision,
        note: confirmation.note,
        createdAt: confirmation.created_at,
        displayName:
          (confirmation.profiles as unknown as { display_name: string } | null)?.display_name ?? null,
      })),
    })),
  });
});

/**
 * Unggah bukti belanja untuk satu pencairan.
 *
 * Hanya penanggung jawab pemilik penugasan. Status bukti diturunkan dari
 * konfirmasi pelapor, bukan dipilih sendiri oleh penanggung jawab — kalau
 * bisa memilih, "terkonfirmasi" kehilangan arti.
 */
disbursementRoutes.post("/:id/expenses", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");

  const parsed = createExpenseSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw badRequest("invalid_body", "Bukti belanja tidak valid", parsed.error.issues);
  }

  const admin = adminClient(c.env);

  const { data: row, error } = await admin
    .from("disbursements")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) raiseDbError(error);
  if (!row) throw notFound("Pencairan tidak ditemukan");

  const disbursement = row as DisbursementRow;
  await loadAssignment(c.env, disbursement.pic_assignment_id, user, { requireOwner: true });

  if (disbursement.status !== "transferred") {
    throw conflict(
      "not_transferred",
      "Bukti belanja diunggah setelah dana tahap ini dicairkan",
    );
  }

  // Total bukti tidak boleh melebihi nominal yang dicairkan: kalau lebih,
  // ada uang yang tidak berasal dari tahap ini.
  const { data: existing, error: existingError } = await admin
    .from("expenses")
    .select("amount")
    .eq("disbursement_id", id);

  if (existingError) raiseDbError(existingError);

  const spent = (existing ?? []).reduce((sum, expense) => sum + Number(expense.amount), 0);
  if (spent + parsed.data.amount > Number(disbursement.amount)) {
    throw badRequest("exceeds_disbursement", "Total bukti belanja melebihi nominal pencairan", {
      disbursed: Number(disbursement.amount),
      spent,
      remaining: Number(disbursement.amount) - spent,
    });
  }

  const { data, error: insertError } = await admin
    .from("expenses")
    .insert({
      disbursement_id: id,
      posko_id: parsed.data.poskoId ?? null,
      item_name: parsed.data.itemName,
      category: parsed.data.category,
      quantity: parsed.data.quantity ?? null,
      unit: parsed.data.unit ?? null,
      amount: parsed.data.amount,
      merchant: parsed.data.merchant ?? null,
      purchased_at: parsed.data.purchasedAt ?? null,
      receipt_r2_key: parsed.data.receiptKey,
      note: parsed.data.note ?? null,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (insertError) raiseDbError(insertError);

  return c.json(
    {
      expense: {
        ...data,
        amount: Number(data.amount),
        receiptUrl: publicUrl(c.env, data.receipt_r2_key),
      },
    },
    201,
  );
});

/**
 * Konfirmasi pelapor atas satu bukti belanja.
 *
 * Trigger `fn_guard_expense_confirmation` memastikan hanya pengunggah laporan
 * pada event itu yang bisa mengonfirmasi, dan bukan penanggung jawabnya
 * sendiri. Satu pelapor satu konfirmasi per bukti.
 */
disbursementRoutes.post("/expenses/:expenseId/confirmations", async (c) => {
  const expenseId = c.req.param("expenseId");
  const user = c.get("user");

  const parsed = confirmExpenseSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw badRequest("invalid_body", "Konfirmasi tidak valid", parsed.error.issues);
  }

  const admin = adminClient(c.env);

  const { data: existing, error: existingError } = await admin
    .from("expense_confirmations")
    .select("expense_id, profile_id")
    .eq("expense_id", expenseId)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (existingError) raiseDbError(existingError);
  if (existing) {
    throw conflict("already_confirmed", "Kamu sudah mengonfirmasi bukti belanja ini");
  }

  const { data, error } = await admin
    .from("expense_confirmations")
    .insert({
      expense_id: expenseId,
      profile_id: user.id,
      decision: parsed.data.decision,
      note: parsed.data.note ?? null,
    })
    .select("*")
    .single();

  if (error) raiseDbError(error);

  // Status bukti mengikuti konfirmasi: diterima penuh, sebagian, atau tidak.
  const status =
    parsed.data.decision === "received"
      ? "confirmed"
      : parsed.data.decision === "partial"
        ? "disputed"
        : "disputed";

  const { error: statusError } = await admin
    .from("expenses")
    .update({ status })
    .eq("id", expenseId);

  if (statusError) raiseDbError(statusError);

  return c.json({ confirmation: data, expenseStatus: status }, 201);
});

/**
 * Bukti belanja yang menunggu konfirmasi pelapor.
 *
 * Inilah daftar tugas pelapor: dia melihat barang yang diklaim dibeli
 * penanggung jawab, lalu menyatakan diterima, sebagian, atau tidak.
 */
disbursementRoutes.get("/pending-confirmations/mine", async (c) => {
  const user = c.get("user");
  const admin = adminClient(c.env);

  const { data: myPosts, error: postsError } = await admin
    .from("posts")
    .select("event_id")
    .eq("author_id", user.id)
    .eq("status", "published");

  if (postsError) raiseDbError(postsError);

  const eventIds = [...new Set((myPosts ?? []).map((post) => post.event_id))];
  if (eventIds.length === 0) return c.json({ items: [] });

  const { data: expenses, error } = await admin
    .from("expenses")
    .select(
      "id, item_name, amount, receipt_r2_key, created_at, disbursement_id, posko_id, disbursements(pic_assignment_id, seq, pic_assignments(event_id, distributor_profiles(display_name))), expense_confirmations(profile_id, decision)",
    )
    .order("created_at", { ascending: false });

  if (error) raiseDbError(error);

  const items = (expenses ?? [])
    .filter((expense) => {
      const assignment = (expense.disbursements as unknown as {
        pic_assignments?: { event_id?: string };
      } | null)?.pic_assignments;
      return assignment?.event_id ? eventIds.includes(assignment.event_id) : false;
    })
    .filter((expense) => {
      const confirmations = (expense.expense_confirmations as unknown as Array<{ profile_id: string }> | null) ?? [];
      return !confirmations.some((confirmation) => confirmation.profile_id === user.id);
    })
    .map((expense) => {
      const assignment = (expense.disbursements as unknown as {
        seq?: number;
        pic_assignments?: { distributor_profiles?: { display_name?: string } };
      } | null)?.pic_assignments;

      return {
        id: expense.id,
        itemName: expense.item_name,
        amount: Number(expense.amount),
        receiptUrl: publicUrl(c.env, expense.receipt_r2_key),
        createdAt: expense.created_at,
        disbursementId: expense.disbursement_id,
        disbursementSeq: (expense.disbursements as unknown as { seq?: number } | null)?.seq ?? null,
        picName: assignment?.distributor_profiles?.display_name ?? null,
      };
    });

  return c.json({ items });
});

/** Rekap penggunaan dana per tahap, untuk halaman penanggung jawab. */
disbursementRoutes.get("/assignments/:id/summary", async (c) => {
  const assignmentId = c.req.param("id");
  const user = c.get("user");
  const admin = adminClient(c.env);

  await loadAssignment(c.env, assignmentId, user);

  const [balanceResult, disbursementsResult, ledgerResult] = await Promise.all([
    admin.from("v_pic_balances").select("*").eq("pic_assignment_id", assignmentId).maybeSingle(),
    admin
      .from("disbursements")
      .select("*")
      .eq("pic_assignment_id", assignmentId)
      .order("seq", { ascending: true }),
    admin
      .from("ledger_entries")
      .select("kind, amount, created_at, note")
      .eq("pic_assignment_id", assignmentId)
      .order("created_at", { ascending: true }),
  ]);

  if (balanceResult.error) raiseDbError(balanceResult.error);
  if (disbursementsResult.error) raiseDbError(disbursementsResult.error);
  if (ledgerResult.error) raiseDbError(ledgerResult.error);

  const rows = (disbursementsResult.data ?? []) as DisbursementRow[];
  const ids = rows.map((row) => row.id);

  const { data: expenses, error: expensesError } = await admin
    .from("expenses")
    .select("disbursement_id, amount, status")
    .in("disbursement_id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);

  if (expensesError) raiseDbError(expensesError);

  const byDisbursement = new Map<string, { total: number; confirmed: number; count: number }>();
  for (const expense of expenses ?? []) {
    const entry = byDisbursement.get(expense.disbursement_id) ?? { total: 0, confirmed: 0, count: 0 };
    entry.total += Number(expense.amount);
    entry.count += 1;
    if (expense.status === "confirmed") entry.confirmed += 1;
    byDisbursement.set(expense.disbursement_id, entry);
  }

  return c.json({
    balance: balanceResult.data
      ? {
          totalIn: Number(balanceResult.data.total_in),
          totalOut: Number(balanceResult.data.total_out),
          balance: Number(balanceResult.data.balance),
          donationCount: Number(balanceResult.data.donation_count),
        }
      : { totalIn: 0, totalOut: 0, balance: 0, donationCount: 0 },
    disbursements: rows.map((row) => {
      const spend = byDisbursement.get(row.id) ?? { total: 0, confirmed: 0, count: 0 };
      return {
        ...serializeDisbursement(row, spend.count, spend.confirmed),
        spent: spend.total,
      };
    }),
    ledger: (ledgerResult.data ?? []).map((entry) => ({
      kind: entry.kind,
      amount: Number(entry.amount),
      createdAt: entry.created_at,
      note: entry.note,
    })),
  });
});
