import { Hono } from "hono";

import {
  contentReportSchema,
  eventFeedQuerySchema,
  type FeedSection,
} from "@jangkau/shared";

import type { AppEnv, SessionUser } from "../../env.js";
import { decodeCursor, encodeCursor } from "../../shared/cursor.js";
import { raiseDbError } from "../../shared/db-errors.js";
import { badRequest, notFound } from "../../shared/errors.js";
import { optionalAuth, requireAuth } from "../../shared/middleware/auth.js";
import { publicUrl } from "../../shared/r2.js";
import { adminClient } from "../../shared/supabase.js";

export const eventRoutes = new Hono<AppEnv>();

type FeedRow = {
  id: string;
  title: string;
  disaster_type: string;
  summary: string | null;
  status: string;
  lat: number;
  lng: number;
  village: string | null;
  district: string | null;
  regency: string | null;
  province: string | null;
  radius_m: number;
  severity: number;
  like_count: number;
  post_count: number;
  approved_pic_count: number;
  cover_media_key: string | null;
  first_reported_at: string;
  last_activity_at: string;
  section: FeedSection;
  uploaders: Array<{ id: string; name: string; username: string | null; post_count: number }>;
  posko_count: number;
};

function toFeedItem(row: FeedRow, env: AppEnv["Bindings"]) {
  return {
    id: row.id,
    title: row.title,
    disasterType: row.disaster_type,
    summary: row.summary,
    status: row.status,
    section: row.section,
    location: { lat: row.lat, lng: row.lng },
    region: {
      village: row.village,
      district: row.district,
      regency: row.regency,
      province: row.province,
    },
    radiusM: row.radius_m,
    severity: row.severity,
    likeCount: row.like_count,
    postCount: row.post_count,
    picCount: row.approved_pic_count,
    poskoCount: row.posko_count,
    coverUrl: publicUrl(env, row.cover_media_key),
    firstReportedAt: row.first_reported_at,
    lastActivityAt: row.last_activity_at,
    uploaders: row.uploaders ?? [],
    hasPersonInCharge: row.approved_pic_count > 0,
  };
}

/**
 * Feed terpaginasi. Guest boleh membaca; kalau ada token, setiap item
 * mendapat `likedByMe` sehingga tombol dukungan tidak berkedip saat dimuat.
 */
eventRoutes.get("/", optionalAuth, async (c) => {
  const parsed = eventFeedQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    throw badRequest("invalid_query", "Parameter feed tidak valid", parsed.error.issues);
  }

  const { limit, section, q, disasterType, province } = parsed.data;
  const cursor = decodeCursor(parsed.data.cursor);
  const viewer = c.get("user") as SessionUser | undefined;
  const admin = adminClient(c.env);

  let query = admin
    .from("v_event_feed")
    .select(
      "id, title, disaster_type, summary, status, lat, lng, village, district, regency, province, radius_m, severity, like_count, post_count, approved_pic_count, cover_media_key, first_reported_at, last_activity_at, section, uploaders, posko_count",
    )
    .order("last_activity_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (section !== "all") query = query.eq("section", section);
  if (disasterType) query = query.eq("disaster_type", disasterType);
  if (province) query = query.eq("province", province);
  if (q) query = query.ilike("title", `%${q}%`);
  if (cursor) {
    query = query.or(
      `last_activity_at.lt.${cursor.at},and(last_activity_at.eq.${cursor.at},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) raiseDbError(error);

  const rows = (data ?? []) as FeedRow[];
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const likedIds = new Set<string>();
  if (viewer && page.length > 0) {
    const { data: likes, error: likeError } = await admin
      .from("event_likes")
      .select("event_id")
      .eq("profile_id", viewer.id)
      .in("event_id", page.map((row) => row.id));

    if (likeError) raiseDbError(likeError);
    for (const like of likes ?? []) likedIds.add(like.event_id);
  }

  const last = page.at(-1);

  return c.json({
    items: page.map((row) => ({ ...toFeedItem(row, c.env), likedByMe: likedIds.has(row.id) })),
    nextCursor: hasMore && last ? encodeCursor({ at: last.last_activity_at, id: last.id }) : null,
  });
});

/** Detail event: pengunggah, posko, penanggung jawab, dan status dukungan. */
eventRoutes.get("/:id", optionalAuth, async (c) => {
  const id = c.req.param("id");
  const viewer = c.get("user") as SessionUser | undefined;
  const admin = adminClient(c.env);

  const { data: event, error: eventError } = await admin
    .from("v_event_feed")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (eventError) raiseDbError(eventError);
  if (!event) throw notFound("Berita bencana tidak ditemukan");

  const [picsResult, poskoResult, likesResult, myPicResult] = await Promise.all([
    admin
      .from("v_pic_public")
      .select(
        "pic_assignment_id, distributor_id, label, display_name, bio, verification_status, social_url, follower_count, total_in, total_out, balance, donation_count, handled_event_count, posko_count",
      )
      .eq("event_id", id)
      .order("total_in", { ascending: false }),
    admin
      .from("relief_posts")
      .select("id, name, address, headcount, capacity, status, surveyed_at, lat:location")
      .eq("event_id", id)
      .order("name"),
    viewer
      ? admin
          .from("event_likes")
          .select("event_id")
          .eq("event_id", id)
          .eq("profile_id", viewer.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    viewer
      ? admin
          .from("pic_assignments")
          .select("id, status, pitch")
          .eq("event_id", id)
          .eq("distributor_id", viewer.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (picsResult.error) raiseDbError(picsResult.error);
  if (poskoResult.error) raiseDbError(poskoResult.error);

  // Posko hanya terbuka untuk publik setelah disurvei penanggung jawab.
  const canSeeDraft =
    viewer?.isAdmin === true ||
    (viewer?.distributor !== null &&
      picsResult.data?.some((pic) => pic.distributor_id === viewer?.id) === true);

  const posko = (poskoResult.data ?? []).filter(
    (row) => canSeeDraft || (row.status === "active" && row.surveyed_at !== null),
  );

  return c.json({
    event: toFeedItem(event as FeedRow, c.env),
    likedByMe: Boolean(likesResult.data),
    personInCharge: (picsResult.data ?? []).map((pic) => ({
      assignmentId: pic.pic_assignment_id,
      distributorId: pic.distributor_id,
      label: pic.label,
      displayName: pic.display_name,
      bio: pic.bio,
      verified: pic.verification_status === "verified",
      socialUrl: pic.social_url,
      followerCount: pic.follower_count,
      totalIn: pic.total_in,
      totalOut: pic.total_out,
      balance: pic.balance,
      donationCount: pic.donation_count,
      handledEventCount: pic.handled_event_count,
      poskoCount: pic.posko_count,
    })),
    posko,
    myApplication: myPicResult.data ?? null,
    viewer: viewer
      ? {
          profileId: viewer.id,
          accountType: viewer.accountType,
          isAdmin: viewer.isAdmin,
          distributor: viewer.distributor,
        }
      : null,
  });
});

/**
 * Donasi terbaru pada satu event, untuk membuktikan bahwa uang benar-benar
 * masuk. Nama donatur anonim tidak pernah dikirim; nominal tetap tampil karena
 * transparansi adalah inti produk.
 */
eventRoutes.get("/:id/donations", async (c) => {
  const id = c.req.param("id");
  const admin = adminClient(c.env);

  const { data, error } = await admin
    .from("donations")
    .select("id, amount, donor_name, is_anonymous, paid_at, posko_id")
    .eq("event_id", id)
    .eq("status", "paid")
    .order("paid_at", { ascending: false })
    .limit(20);

  if (error) raiseDbError(error);

  return c.json({
    items: (data ?? []).map((row) => ({
      id: row.id,
      amount: Number(row.amount),
      donorName: row.is_anonymous ? null : row.donor_name,
      paidAt: row.paid_at,
      poskoId: row.posko_id,
    })),
  });
});

/** Satu akun satu dukungan. Klik kedua menghapus dukungan. */
eventRoutes.post("/:id/like", requireAuth, async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const admin = adminClient(c.env);

  const { data: event, error: eventError } = await admin
    .from("disaster_events")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (eventError) raiseDbError(eventError);
  if (!event) throw notFound("Berita bencana tidak ditemukan");

  const { error } = await admin
    .from("event_likes")
    .upsert({ event_id: id, profile_id: user.id }, { onConflict: "event_id,profile_id", ignoreDuplicates: true });

  if (error) raiseDbError(error);

  return c.json(await likeState(c.env, id, user.id));
});

eventRoutes.delete("/:id/like", requireAuth, async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  const admin = adminClient(c.env);

  const { error } = await admin
    .from("event_likes")
    .delete()
    .eq("event_id", id)
    .eq("profile_id", user.id);

  if (error) raiseDbError(error);

  return c.json(await likeState(c.env, id, user.id));
});

async function likeState(env: AppEnv["Bindings"], eventId: string, profileId: string) {
  const admin = adminClient(env);

  const [{ data: event, error: eventError }, { data: mine, error: likeError }] = await Promise.all([
    admin.from("v_event_feed").select("like_count, section").eq("id", eventId).maybeSingle(),
    admin
      .from("event_likes")
      .select("event_id")
      .eq("event_id", eventId)
      .eq("profile_id", profileId)
      .maybeSingle(),
  ]);

  if (eventError) raiseDbError(eventError);
  if (likeError) raiseDbError(likeError);
  if (!event) throw notFound("Berita bencana tidak ditemukan");

  return { likeCount: event.like_count, section: event.section, likedByMe: Boolean(mine) };
}

/** Lapor konten palsu, duplikat, atau tidak relevan. Masuk antrean admin. */
eventRoutes.post("/:id/reports", requireAuth, async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");

  const parsed = contentReportSchema.safeParse(await c.req.json());
  if (!parsed.success) {
    throw badRequest("invalid_body", "Laporan konten tidak valid", parsed.error.issues);
  }

  const admin = adminClient(c.env);

  const { data: event, error: eventError } = await admin
    .from("disaster_events")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (eventError) raiseDbError(eventError);
  if (!event) throw notFound("Berita bencana tidak ditemukan");

  const { data, error } = await admin
    .from("content_reports")
    .insert({
      reporter_id: user.id,
      event_id: id,
      reason: parsed.data.reason,
      note: parsed.data.note ?? null,
    })
    .select("id, status, created_at")
    .single();

  if (error) raiseDbError(error);

  return c.json({ report: data }, 201);
});
