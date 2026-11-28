import { Hono } from "hono";

import { createPoskoSchema, poskoNeedSchema, stockMovementSchema } from "@jangkau/shared";

import type { AppEnv } from "../../env.js";
import { raiseDbError } from "../../shared/db-errors.js";
import { badRequest, forbidden, notFound } from "../../shared/errors.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { adminClient, toPoint } from "../../shared/supabase.js";

export const poskoRoutes = new Hono<AppEnv>();

poskoRoutes.use("*", requireAuth);

/**
 * Siapa yang boleh mengelola posko pada satu event: warga yang pernah
 * mengunggah laporan di event itu, atau penyalur yang sudah disetujui sebagai
 * penanggung jawab. Aturan ini sama dengan PRD POSKO-01.
 */
async function canManageEvent(
  env: AppEnv["Bindings"],
  eventId: string,
  profileId: string,
  isAdmin: boolean,
): Promise<boolean> {
  if (isAdmin) return true;
  const admin = adminClient(env);

  const [postResult, picResult] = await Promise.all([
    admin
      .from("posts")
      .select("id")
      .eq("event_id", eventId)
      .eq("author_id", profileId)
      .limit(1)
      .maybeSingle(),
    admin
      .from("pic_assignments")
      .select("id")
      .eq("event_id", eventId)
      .eq("distributor_id", profileId)
      .eq("status", "approved")
      .maybeSingle(),
  ]);

  if (postResult.error) raiseDbError(postResult.error);
  if (picResult.error) raiseDbError(picResult.error);

  return Boolean(postResult.data || picResult.data);
}

/**
 * Membuat posko pada satu event.
 *
 * `surveyed: true` berarti survei sudah selesai, sehingga kebutuhan langsung
 * terbuka untuk publik dan stok bisa dicatat. Tanpa itu posko tetap `draft` dan
 * hanya terlihat oleh pengelolanya — kebutuhan yang belum disurvei tidak boleh
 * dipakai donatur sebagai dasar berdonasi.
 */
poskoRoutes.post("/events/:id/posko", async (c) => {
  const eventId = c.req.param("id");
  const user = c.get("user");

  const parsed = createPoskoSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw badRequest("invalid_body", "Data posko tidak valid", parsed.error.issues);
  }

  if (!(await canManageEvent(c.env, eventId, user.id, user.isAdmin))) {
    throw forbidden("Hanya pelapor berita ini atau penanggung jawab yang disetujui");
  }

  const input = parsed.data;
  const admin = adminClient(c.env);
  const surveyedAt = input.surveyed ? new Date().toISOString() : null;

  const { data: posko, error } = await admin
    .from("relief_posts")
    .insert({
      event_id: eventId,
      name: input.name,
      address: input.address ?? null,
      location: toPoint(input.location.lat, input.location.lng),
      radius_m: input.radiusM,
      headcount: input.headcount,
      capacity: input.capacity ?? null,
      origin: user.distributor ? "distributor" : "reporter",
      status: input.surveyed ? "active" : "draft",
      surveyed_at: surveyedAt,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error) raiseDbError(error);

  if (input.needs.length > 0) {
    const { error: needsError } = await admin.from("posko_needs").insert(
      input.needs.map((need) => ({
        posko_id: posko.id,
        item_name: need.itemName,
        category: need.category,
        unit: need.unit,
        quantity_needed: need.quantityNeeded,
        priority: need.priority,
        note: need.note ?? null,
        updated_by: user.id,
      })),
    );
    if (needsError) raiseDbError(needsError);
  }

  return c.json({ posko }, 201);
});

/** Detail posko untuk pengelola: termasuk kebutuhan dan stok. */
poskoRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const admin = adminClient(c.env);

  const { data: posko, error: poskoError } = await admin
    .from("relief_posts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (poskoError) raiseDbError(poskoError);
  if (!posko) throw notFound("Posko tidak ditemukan");

  const allowed = await canManageEvent(c.env, posko.event_id, user.id, user.isAdmin);
  if (!allowed && (posko.status !== "active" || posko.surveyed_at === null)) {
    throw notFound("Posko tidak ditemukan");
  }

  const [needsResult, stockResult] = await Promise.all([
    admin.from("posko_needs").select("*").eq("posko_id", id).order("priority"),
    admin.from("posko_stock").select("*").eq("posko_id", id).order("item_name"),
  ]);

  if (needsResult.error) raiseDbError(needsResult.error);
  if (stockResult.error) raiseDbError(stockResult.error);

  return c.json({
    posko,
    needs: needsResult.data ?? [],
    stock: stockResult.data ?? [],
    canManage: allowed,
  });
});

/** Mengubah posko, termasuk menandai survei selesai. */
poskoRoutes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const admin = adminClient(c.env);

  const body = (await c.req.json()) as {
    name?: string;
    address?: string;
    headcount?: number;
    capacity?: number;
    surveyed?: boolean;
    status?: "draft" | "active" | "closed";
  };

  const { data: posko, error: poskoError } = await admin
    .from("relief_posts")
    .select("id, event_id, status, surveyed_at")
    .eq("id", id)
    .maybeSingle();

  if (poskoError) raiseDbError(poskoError);
  if (!posko) throw notFound("Posko tidak ditemukan");

  if (!(await canManageEvent(c.env, posko.event_id, user.id, user.isAdmin))) {
    throw forbidden("Hanya pengelola posko ini yang boleh mengubahnya");
  }

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.address !== undefined) patch.address = body.address;
  if (body.headcount !== undefined) patch.headcount = body.headcount;
  if (body.capacity !== undefined) patch.capacity = body.capacity;
  if (body.status !== undefined) patch.status = body.status;

  if (body.surveyed === true && posko.surveyed_at === null) {
    patch.surveyed_at = new Date().toISOString();
    patch.status = "active";
  }

  if (Object.keys(patch).length === 0) return c.json({ ok: true, changed: [] });

  const { data, error } = await admin
    .from("relief_posts")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) raiseDbError(error);

  return c.json({ posko: data, changed: Object.keys(patch) });
});

/** Menambah kebutuhan posko. */
poskoRoutes.post("/:id/needs", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");

  const parsed = poskoNeedSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw badRequest("invalid_body", "Kebutuhan tidak valid", parsed.error.issues);
  }

  const admin = adminClient(c.env);

  const { data: posko, error: poskoError } = await admin
    .from("relief_posts")
    .select("id, event_id")
    .eq("id", id)
    .maybeSingle();

  if (poskoError) raiseDbError(poskoError);
  if (!posko) throw notFound("Posko tidak ditemukan");

  if (!(await canManageEvent(c.env, posko.event_id, user.id, user.isAdmin))) {
    throw forbidden("Hanya pengelola posko ini yang boleh menambah kebutuhan");
  }

  const need = parsed.data;

  const { data, error } = await admin
    .from("posko_needs")
    .insert({
      posko_id: id,
      item_name: need.itemName,
      category: need.category,
      unit: need.unit,
      quantity_needed: need.quantityNeeded,
      priority: need.priority,
      note: need.note ?? null,
      updated_by: user.id,
    })
    .select("*")
    .single();

  if (error) raiseDbError(error);

  return c.json({ need: data }, 201);
});

/**
 * Memperbarui kebutuhan: jumlah terpenuhi, status, prioritas.
 * Status `fulfilled` dipasang otomatis ketika jumlah terpenuhi mencapai target.
 */
poskoRoutes.patch("/needs/:needId", async (c) => {
  const needId = c.req.param("needId");
  const user = c.get("user");
  const admin = adminClient(c.env);

  const body = (await c.req.json()) as {
    quantityFulfilled?: number;
    priority?: number;
    status?: "open" | "partial" | "fulfilled" | "cancelled";
    note?: string;
  };

  const { data: need, error: needError } = await admin
    .from("posko_needs")
    .select("id, posko_id, quantity_needed, quantity_fulfilled")
    .eq("id", needId)
    .maybeSingle();

  if (needError) raiseDbError(needError);
  if (!need) throw notFound("Kebutuhan tidak ditemukan");

  const { data: posko, error: poskoError } = await admin
    .from("relief_posts")
    .select("event_id")
    .eq("id", need.posko_id)
    .maybeSingle();

  if (poskoError) raiseDbError(poskoError);
  if (!posko) throw notFound("Posko tidak ditemukan");

  if (!(await canManageEvent(c.env, posko.event_id, user.id, user.isAdmin))) {
    throw forbidden("Hanya pengelola posko ini yang boleh mengubah kebutuhan");
  }

  const patch: Record<string, unknown> = { updated_by: user.id };
  if (body.priority !== undefined) patch.priority = body.priority;
  if (body.note !== undefined) patch.note = body.note;

  if (body.quantityFulfilled !== undefined) {
    const fulfilled = Math.min(body.quantityFulfilled, Number(need.quantity_needed));
    patch.quantity_fulfilled = fulfilled;
    patch.status =
      body.status ?? (fulfilled >= Number(need.quantity_needed) ? "fulfilled" : fulfilled > 0 ? "partial" : "open");
  } else if (body.status !== undefined) {
    patch.status = body.status;
  }

  const { data, error } = await admin
    .from("posko_needs")
    .update(patch)
    .eq("id", needId)
    .select("*")
    .single();

  if (error) raiseDbError(error);

  return c.json({ need: data });
});

/**
 * Mencatat pergerakan stok lewat `fn_stock_move`, sehingga `stock_logs` selalu
 * terisi dan tidak ada perubahan stok tanpa jejak.
 */
poskoRoutes.post("/:id/stock", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");

  const parsed = stockMovementSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw badRequest("invalid_body", "Pergerakan stok tidak valid", parsed.error.issues);
  }

  const admin = adminClient(c.env);

  const { data: posko, error: poskoError } = await admin
    .from("relief_posts")
    .select("id, event_id")
    .eq("id", id)
    .maybeSingle();

  if (poskoError) raiseDbError(poskoError);
  if (!posko) throw notFound("Posko tidak ditemukan");

  if (!(await canManageEvent(c.env, posko.event_id, user.id, user.isAdmin))) {
    throw forbidden("Hanya pengelola posko ini yang boleh mencatat stok");
  }

  const input = parsed.data;

  const { data: existing, error: existingError } = await admin
    .from("posko_stock")
    .select("id")
    .eq("posko_id", id)
    .eq("item_name", input.itemName)
    .maybeSingle();

  if (existingError) raiseDbError(existingError);

  let stockId = existing?.id;

  if (!stockId) {
    if (input.delta < 0) {
      throw badRequest("unknown_item", "Barang ini belum ada di posko, tidak bisa dikurangi");
    }

    const { data: created, error: createError } = await admin
      .from("posko_stock")
      .insert({
        posko_id: id,
        item_name: input.itemName,
        category: input.category,
        unit: input.unit,
        quantity: 0,
      })
      .select("id")
      .single();

    if (createError) raiseDbError(createError);
    stockId = created.id;
  }

  const { data: quantity, error } = await admin.rpc("fn_stock_move", {
    p_stock_id: stockId,
    p_delta: input.delta,
    p_reason: "adjustment",
    p_note: input.note ?? null,
    p_actor: user.id,
  });

  if (error) raiseDbError(error);

  return c.json({ stockId, quantity });
});
