import type { MiddlewareHandler } from "hono";

import type { AppEnv, SessionUser } from "../../env.js";
import { raiseDbError } from "../db-errors.js";
import { forbidden, unauthorized } from "../errors.js";
import { adminClient } from "../supabase.js";

/**
 * Memuat identitas dari access token Supabase.
 *
 * `admin.auth.getUser(token)` memvalidasi tanda tangan dan masa berlaku token;
 * setelah itu profil, status admin, dan profil penyalur dibaca dalam satu
 * gelombang permintaan paralel. Hasilnya disimpan di `c.get("user")`.
 */
async function loadSession(
  env: AppEnv["Bindings"],
  token: string,
): Promise<SessionUser | null> {
  const admin = adminClient(env);

  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return null;

  const [profileResult, distributorResult] = await Promise.all([
    admin
      .from("profiles")
      .select("id, display_name, account_type, is_admin, locale")
      .eq("id", authData.user.id)
      .maybeSingle(),
    admin
      .from("distributor_profiles")
      .select("label, verification_status, display_name")
      .eq("profile_id", authData.user.id)
      .maybeSingle(),
  ]);

  if (profileResult.error) raiseDbError(profileResult.error);
  if (!profileResult.data) return null;

  const profile = profileResult.data;
  const distributor = distributorResult.data;

  return {
    id: profile.id,
    email: authData.user.email ?? null,
    displayName: profile.display_name,
    accountType: profile.account_type,
    isAdmin: profile.is_admin,
    locale: profile.locale,
    distributor: distributor
      ? {
          label: distributor.label,
          verificationStatus: distributor.verification_status,
          displayName: distributor.display_name,
        }
      : null,
  };
}

function bearerToken(header: string | undefined): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = bearerToken(c.req.header("authorization"));
  if (!token) throw unauthorized("Header Authorization Bearer wajib ada");

  const user = await loadSession(c.env, token);
  if (!user) throw unauthorized();

  c.set("user", user);
  await next();
};

/**
 * Seperti `requireAuth`, tapi tidak menolak pengunjung tanpa token.
 * Dipakai endpoint publik yang perilakunya sedikit berbeda untuk pengguna
 * login (mis. status dukungan pada feed).
 */
export const optionalAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = bearerToken(c.req.header("authorization"));
  if (token) {
    const user = await loadSession(c.env, token);
    if (user) c.set("user", user);
  }
  await next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("user")?.isAdmin) throw forbidden("Hanya admin");
  await next();
};

/**
 * Syarat tunggal untuk mengajukan diri sebagai penanggung jawab.
 * Akun penyalur tanpa centang terverifikasi tetap boleh melapor dan berdonasi.
 */
export const requireVerifiedDistributor: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get("user");
  if (!user?.distributor) {
    throw forbidden("Akun ini belum terdaftar sebagai penyalur bantuan");
  }
  if (user.distributor.verificationStatus !== "verified") {
    throw forbidden("Verifikasi penyalur belum disetujui admin");
  }
  await next();
};

export const requireDistributor: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("user")?.distributor) {
    throw forbidden("Akun ini belum terdaftar sebagai penyalur bantuan");
  }
  await next();
};
