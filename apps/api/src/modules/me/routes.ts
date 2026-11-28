import { Hono } from "hono";

import type { AppEnv } from "../../env.js";
import { raiseDbError } from "../../shared/db-errors.js";
import { requireAuth } from "../../shared/middleware/auth.js";
import { adminClient } from "../../shared/supabase.js";

export const meRoutes = new Hono<AppEnv>();

meRoutes.use("*", requireAuth);

/** Identitas + lencana + profil penyalur, cukup untuk satu kali muat di klien. */
meRoutes.get("/", async (c) => {
  const user = c.get("user");
  const admin = adminClient(c.env);

  const [badgesResult, distributorResult] = await Promise.all([
    admin.from("profile_badges").select("badge, first_earned_at").eq("profile_id", user.id),
    admin
      .from("distributor_profiles")
      .select(
        "label, display_name, bio, home_city, contact_email, contact_phone, social_url, follower_count, verification_status, verified_at, rejection_reason",
      )
      .eq("profile_id", user.id)
      .maybeSingle(),
  ]);

  if (badgesResult.error) raiseDbError(badgesResult.error);
  if (distributorResult.error) raiseDbError(distributorResult.error);

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      accountType: user.accountType,
      isAdmin: user.isAdmin,
      locale: user.locale,
      badges: (badgesResult.data ?? []).map((row) => row.badge),
      distributor: distributorResult.data ?? null,
    },
  });
});

/** Ganti bahasa atau tema. Dipakai tombol pengaturan di header. */
meRoutes.patch("/preferences", async (c) => {
  const user = c.get("user");
  const body = (await c.req.json()) as { locale?: string; theme?: string };

  const patch: Record<string, string> = {};
  if (body.locale === "id" || body.locale === "en") patch.locale = body.locale;
  if (body.theme === "dark" || body.theme === "light" || body.theme === "system") {
    patch.theme = body.theme;
  }

  if (Object.keys(patch).length === 0) {
    return c.json({ ok: true, changed: [] });
  }

  const admin = adminClient(c.env);
  const { error } = await admin.from("profiles").update(patch).eq("id", user.id);
  if (error) raiseDbError(error);

  return c.json({ ok: true, changed: Object.keys(patch) });
});
