import type { MiddlewareHandler } from "hono";

import type { AppEnv, SessionUser } from "../../env.js";
import { raiseDbError } from "../db-errors.js";
import { forbidden, unauthorized } from "../errors.js";
import { adminClient } from "../supabase.js";

/**
 * Verifikasi access token Supabase, lalu muat profil + organisasi
 * terverifikasi milik user. Hasilnya di `c.get("user")`.
 */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    throw unauthorized("Header Authorization Bearer wajib ada");
  }

  const token = header.slice("Bearer ".length).trim();
  const admin = adminClient(c.env);

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) {
    throw unauthorized();
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError) raiseDbError(profileError);
  if (!profile) throw unauthorized("Profil belum dibuat");

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

    if (org?.verification_status === "verified") {
      organizationId = org.id;
    }
  }

  const user: SessionUser = {
    id: profile.id,
    email: authData.user.email ?? null,
    role: profile.role,
    fullName: profile.full_name,
    organizationId,
  };

  c.set("user", user);
  await next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get("user")?.role !== "admin") throw forbidden("Hanya admin");
  await next();
};

/** Organisasi yang belum diverifikasi tidak boleh take-up / fundraising. */
export const requireVerifiedOrg: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("user")?.organizationId) {
    throw forbidden("Akun harus terhubung ke organisasi yang sudah terverifikasi");
  }
  await next();
};
