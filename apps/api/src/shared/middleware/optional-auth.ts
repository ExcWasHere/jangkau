import type { MiddlewareHandler } from "hono";

import type { AppEnv, SessionUser } from "../../env.js";
import { unauthorized } from "../errors.js";
import { adminClient } from "../supabase.js";

/**
 * Muat profil dari Bearer token bila ada. Dipakai endpoint publik yang
 * perilakunya sedikit berbeda untuk pengguna login (mis. status dukungan),
 * tanpa memaksa semua pengunjung punya akun.
 */
export const optionalAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    await next();
    return;
  }

  const token = header.slice("Bearer ".length).trim();
  const admin = adminClient(c.env);

  const { data: authData, error } = await admin.auth.getUser(token);
  if (error || !authData.user) {
    throw unauthorized();
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profile) {
    const { data: membership } = await admin
      .from("organization_members")
      .select("organization_id")
      .eq("profile_id", profile.id)
      .limit(1)
      .maybeSingle();

    let organizationId: string | null = null;
    if (membership) {
      const { data: org } = await admin
        .from("organizations")
        .select("id, verification_status")
        .eq("id", membership.organization_id)
        .maybeSingle();
      if (org?.verification_status === "verified") organizationId = org.id;
    }

    const user: SessionUser = {
      id: profile.id,
      email: authData.user.email ?? null,
      role: profile.role,
      fullName: profile.full_name,
      organizationId,
    };
    c.set("user", user);
  }

  await next();
};
