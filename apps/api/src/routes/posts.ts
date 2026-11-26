import { Hono } from "hono";

import type { AppEnv } from "../env.js";
import { notFound } from "../lib/errors.js";
import { adminClient } from "../lib/supabase.js";

export const postRoutes = new Hono<AppEnv>();

postRoutes.get("/", async (c) => {
  const admin = adminClient(c.env);
  const { data, error } = await admin
    .from("public_posts")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;
  return c.json({ items: data ?? [] });
});

postRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const admin = adminClient(c.env);

  const [{ data: post }, { data: stock }, { data: campaigns }] = await Promise.all([
    admin.from("public_posts").select("*").eq("id", id).maybeSingle(),
    admin.from("public_stock").select("*").eq("post_id", id),
    admin.from("public_campaigns").select("*").order("created_at", { ascending: false }).limit(10),
  ]);

  if (!post) throw notFound("Pos pengungsian tidak ditemukan");

  return c.json({
    post,
    stock: stock ?? [],
    campaigns: campaigns ?? [],
  });
});
