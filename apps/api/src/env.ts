/**
 * Binding & secret Worker. Nama variabel di sini harus sama dengan
 * `wrangler.jsonc` (vars) dan `.dev.vars` (secrets).
 */
export type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;

  /** Bucket privat: dokumen verifikasi penyalur. */
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET: string;
  /** Bucket publik: foto post, struk belanja, avatar. */
  R2_PUBLIC_BUCKET: string;
  R2_PUBLIC_BASE_URL: string;

  MIDTRANS_SERVER_KEY: string;
  MIDTRANS_CLIENT_KEY: string;
  MIDTRANS_IS_PRODUCTION: string;

  AI_BASE_URL: string;
  AI_API_KEY: string;
  AI_MODEL: string;

  APP_BASE_URL: string;
  /** Daftar origin tambahan, dipisah koma (mis. preview Pages). */
  ALLOWED_ORIGINS?: string;
};

export type DistributorSession = {
  label: "organization" | "volunteer" | "creator";
  verificationStatus: "unverified" | "pending" | "verified" | "rejected" | "suspended";
  displayName: string;
};

/**
 * Identitas pemanggil setelah token diverifikasi. `isAdmin` dan
 * `distributor` dimuat sekali per request supaya handler tidak perlu
 * menanyakan hak akses ke database lagi.
 */
export type SessionUser = {
  id: string;
  email: string | null;
  displayName: string;
  accountType: "resident" | "distributor";
  isAdmin: boolean;
  locale: "id" | "en";
  distributor: DistributorSession | null;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: {
    user: SessionUser;
  };
};
