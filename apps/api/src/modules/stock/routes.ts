import { Hono } from "hono";
import { z } from "zod";

import { stockMovementSchema } from "@jangkau/shared";

import type { AppEnv } from "../../env.js";
import { raiseDbError } from "../../shared/db-errors.js";
import { badRequest, forbidden, notFound, unprocessable } from "../../shared/errors.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { adminClient } from "../../shared/supabase.js";

export const stockRoutes = new Hono<AppEnv>();

stockRoutes.use("*", requireAuth);

/** Riwayat pergerakan satu item, terbaru dulu. */
stockRoutes.get("/:itemId/logs", async (c) => {
  const admin = adminClient(c.env);
  const itemId = c.req.param("itemId");

  const { data, error } = await admin
    .from("stock_logs")
    .select("id, delta, quantity_after, reason, note, created_at, ref_report_id, ref_tranche_id")
    .eq("stock_item_id", itemId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) raiseDbError(error);
  return c.json({ items: data ?? [] });
});

const createItemSchema = z.object({
  postId: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
  category: z.string().trim().max(20).default("other"),
  unit: z.string().trim().min(1).max(20).default("pcs"),
  lowStockThreshold: z.number().nonnegative().default(0),
  initialQuantity: z.number().nonnegative().default(0),
});

/** Tambah item stok baru di sebuah pos. */
stockRoutes.post("/items", async (c) => {
  const user = c.get("user");
  if (user.role !== "admin" && !user.organizationId) {
    throw forbidden("Hanya admin atau organisasi terverifikasi");
  }

  const parsed = createItemSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw badRequest("invalid_body", "Data item tidak valid", parsed.error.issues);
  }

  const input = parsed.data;
  const admin = adminClient(c.env);

  const { data: item, error } = await admin
    .from("stock_items")
    .insert({
      post_id: input.postId,
      name: input.name,
      category: input.category,
      unit: input.unit,
      quantity: 0,
      low_stock_threshold: input.lowStockThreshold,
    })
    .select("id, name, unit, quantity")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw unprocessable("duplicate_item", "Item dengan nama itu sudah ada di pos ini");
    }
    raiseDbError(error);
  }

  if (input.initialQuantity > 0) {
    const { error: rpcError } = await admin.rpc("apply_stock_movement", {
      p_stock_item_id: item.id,
      p_delta: input.initialQuantity,
      p_reason: "opname",
      p_ref_report: null,
      p_ref_tranche: null,
      p_note: "Stok awal",
      p_actor: user.id,
    });
    if (rpcError) raiseDbError(rpcError);
  }

  return c.json({ item }, 201);
});

/**
 * Satu-satunya jalan mengubah saldo stok: RPC `apply_stock_movement`.
 * Endpoint tidak pernah menulis `stock_items.quantity` langsung, supaya
 * log dan saldo tidak bisa berselisih.
 */
stockRoutes.post("/movements", async (c) => {
  const user = c.get("user");
  if (user.role !== "admin" && !user.organizationId) {
    throw forbidden("Hanya admin atau organisasi terverifikasi");
  }

  const parsed = stockMovementSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw badRequest("invalid_body", "Pergerakan stok tidak valid", parsed.error.issues);
  }

  const input = parsed.data;
  const admin = adminClient(c.env);

  const { data: item } = await admin
    .from("stock_items")
    .select("id, name, unit, quantity")
    .eq("id", input.stockItemId)
    .maybeSingle();

  if (!item) throw notFound("Item stok tidak ditemukan");

  const { data, error } = await admin.rpc("apply_stock_movement", {
    p_stock_item_id: input.stockItemId,
    p_delta: input.delta,
    p_reason: input.reason,
    p_ref_report: input.refReportId ?? null,
    p_ref_tranche: input.refTrancheId ?? null,
    p_note: input.note ?? null,
    p_actor: user.id,
  });

  if (error) {
    if (String(error.message).includes("insufficient_stock")) {
      throw unprocessable(
        "insufficient_stock",
        `Stok ${item.name} tidak cukup (tersedia ${item.quantity} ${item.unit})`,
      );
    }
    raiseDbError(error);
  }

  return c.json({ movement: data }, 201);
});
