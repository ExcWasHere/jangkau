import { Hono } from "hono";

import type { AppEnv } from "../../env.js";
import { raiseDbError } from "../../shared/db-errors.js";
import { badRequest, notFound } from "../../shared/errors.js";
import { requireAdmin, requireAuth } from "../../shared/middleware/auth.js";
import { publicUrl } from "../../shared/r2.js";
import { adminClient } from "../../shared/supabase.js";

/**
 * Antrean tinjauan penggabungan.
 *
 * AI menggabungkan unggahan yang diyakininya membicarakan bencana yang sama.
 * Di ambang keyakinan menengah, penggabungan tetap dilakukan tetapi ditandai
 * `needs_review` — karena salah menggabung lebih merugikan daripada tidak
 * menggabung: satu berita bisa menelan laporan dari lokasi berbeda.
 *
 * Admin memutuskan: setujui penggabungan, atau pisahkan unggahan itu menjadi
 * berita sendiri.
 */
export const mergeReviewRoutes = new Hono<AppEnv>();

mergeReviewRoutes.use("*", requireAuth, requireAdmin);

type ReviewRow = {
  id: string;
  event_id: string;
  body: string;
  place_label: string | null;
  ai_category: string | null;
  ai_confidence: number | null;
  ai_similarity: number | null;
  ai_model: string | null;
  location_source: "device" | "manual";
  review_reasons: string[];
  accuracy_m: number | null;
  created_at: string;
  author_id: string;
  disaster_events: {
    id: string;
    title: string;
    disaster_type: string;
    regency: string | null;
    province: string | null;
    post_count: number;
    like_count: number;
  } | null;
  profiles: { display_name: string } | null;
};

mergeReviewRoutes.get("/", async (c) => {
  const admin = adminClient(c.env);
  const limit = Math.min(Number(c.req.query("limit") ?? 30), 100);

  const { data, error } = await admin
    .from("posts")
    .select(
      "id, event_id, body, place_label, ai_category, ai_confidence, ai_similarity, ai_model, location_source, review_reasons, accuracy_m, created_at, author_id, disaster_events(id, title, disaster_type, regency, province, post_count, like_count), profiles(display_name)",
    )
    .eq("needs_review", true)
    .eq("status", "published")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) raiseDbError(error);

  const rows = (data ?? []) as unknown as ReviewRow[];

  // Foto unggahan membantu admin menilai apakah lokasinya memang sama.
  const { data: media, error: mediaError } = await admin
    .from("post_media")
    .select("post_id, r2_key, sort_order")
    .in(
      "post_id",
      rows.length > 0 ? rows.map((row) => row.id) : ["00000000-0000-0000-0000-000000000000"],
    )
    .order("sort_order");

  if (mediaError) raiseDbError(mediaError);

  const coverByPost = new Map<string, string>();
  for (const item of media ?? []) {
    if (!coverByPost.has(item.post_id)) coverByPost.set(item.post_id, item.r2_key);
  }

  return c.json({
    items: rows.map((row) => ({
      postId: row.id,
      body: row.body,
      placeLabel: row.place_label,
      authorName: row.profiles?.display_name ?? "—",
      createdAt: row.created_at,
      locationSource: row.location_source,
      reviewReasons: row.review_reasons ?? [],
      accuracyM: row.accuracy_m === null ? null : Number(row.accuracy_m),
      ai: {
        category: row.ai_category,
        confidence: row.ai_confidence,
        similarity: row.ai_similarity,
        model: row.ai_model,
      },
      event: row.disaster_events
        ? {
            id: row.disaster_events.id,
            title: row.disaster_events.title,
            disasterType: row.disaster_events.disaster_type,
            region: [row.disaster_events.regency, row.disaster_events.province]
              .filter(Boolean)
              .join(", "),
            postCount: row.disaster_events.post_count,
            likeCount: row.disaster_events.like_count,
          }
        : null,
      photoUrl: publicUrl(c.env, coverByPost.get(row.id)),
    })),
  });
});

/**
 * Keputusan admin: `accept` (biarkan tergabung) atau `split` (jadikan berita
 * sendiri). Keduanya memakai fungsi SQL agar satu transaksi.
 */
mergeReviewRoutes.post("/:postId/decision", async (c) => {
  const postId = c.req.param("postId");

  const body = (await c.req.json()) as { decision?: "accept" | "split"; title?: string };
  if (body.decision !== "accept" && body.decision !== "split") {
    throw badRequest("invalid_body", "Keputusan harus accept atau split");
  }

  const admin = adminClient(c.env);

  const { data: post, error } = await admin
    .from("posts")
    .select("id, needs_review")
    .eq("id", postId)
    .maybeSingle();

  if (error) raiseDbError(error);
  if (!post) throw notFound("Unggahan tidak ditemukan");
  if (!post.needs_review) {
    throw badRequest("already_reviewed", "Unggahan ini sudah ditinjau");
  }

  if (body.decision === "accept") {
    const { error: rpcError } = await admin.rpc("fn_accept_merge", { p_post_id: postId });
    if (rpcError) raiseDbError(rpcError);

    const { error: clearError } = await admin.rpc("fn_clear_review_reasons", {
      p_post_id: postId,
    });
    if (clearError) raiseDbError(clearError);

    return c.json({ ok: true, decision: "accept" });
  }

  const { data: newEventId, error: rpcError } = await admin.rpc("fn_split_post", {
    p_post_id: postId,
    p_title: body.title?.trim() || null,
  });

  if (rpcError) raiseDbError(rpcError);

  return c.json({ ok: true, decision: "split", eventId: newEventId });
});
