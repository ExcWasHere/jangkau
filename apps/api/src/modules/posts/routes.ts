import { Hono } from "hono";

import type { AppEnv } from "../../env.js";
import { raiseDbError } from "../../shared/db-errors.js";
import { notFound } from "../../shared/errors.js";
import { adminClient } from "../../shared/supabase.js";

export const postRoutes = new Hono<AppEnv>();

/**
 * Daftar pos untuk peta dan pemilih pos. `report_count` dihitung dari
 * laporan yang masih terbuka, supaya angka di kartu punya arti.
 */
postRoutes.get("/", async (c) => {
  const admin = adminClient(c.env);

  const [{ data, error }, { data: openReports }] = await Promise.all([
    admin.from("public_posts").select("*").order("name", { ascending: true }),
    admin.from("reports").select("post_id").in("status", ["pending", "validated", "eligible"]),
  ]);

  if (error) raiseDbError(error);

  const counts = new Map<string, number>();
  for (const row of openReports ?? []) {
    counts.set(row.post_id, (counts.get(row.post_id) ?? 0) + 1);
  }

  return c.json({
    items: (data ?? []).map((post) => ({
      ...post,
      openReportCount: counts.get(post.id) ?? 0,
    })),
  });
});

postRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const admin = adminClient(c.env);

  const [{ data: post }, { data: stock }, { data: campaigns }, { data: reports }] =
    await Promise.all([
      admin.from("public_posts").select("*").eq("id", id).maybeSingle(),
      admin.from("public_stock").select("*").eq("post_id", id).order("name"),
      admin
        .from("public_campaigns")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20),
      admin
        .from("public_reports")
        .select("id, body_text, category, severity, status, upvote_count, captured_at")
        .eq("post_id", id)
        .order("captured_at", { ascending: false })
        .limit(20),
    ]);

  if (!post) throw notFound("Pos pengungsian tidak ditemukan");

  return c.json({
    post,
    stock: stock ?? [],
    campaigns: (campaigns ?? []).filter((campaign) => campaign.report_id !== null),
    reports: reports ?? [],
  });
});
