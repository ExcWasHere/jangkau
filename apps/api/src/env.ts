/**
 * Binding & secret Worker. Nama variabel di sini harus sama dengan
 * `wrangler.jsonc` (vars) dan `.dev.vars` (secrets).
 */
export type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;

  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET: string;

  MIDTRANS_SERVER_KEY: string;
  MIDTRANS_CLIENT_KEY: string;
  MIDTRANS_IS_PRODUCTION: string;

  GEMINI_API_KEY: string;

  AI_BASE_URL: string;
  AI_API_KEY: string;
  AI_MODEL: string;

  APP_BASE_URL: string;
  /** Daftar origin tambahan, dipisah koma (mis. preview Pages). */
  ALLOWED_ORIGINS?: string;
};

export type AppRole = "resident" | "organization" | "admin";

export type SessionUser = {
  id: string;
  email: string | null;
  role: AppRole;
  fullName: string;
  organizationId: string | null;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: {
    user: SessionUser;
  };
};
