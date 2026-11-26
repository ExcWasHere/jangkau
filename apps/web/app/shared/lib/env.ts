/** Konfigurasi publik. Semua nilai berawalan VITE_ aman dilihat browser. */
export const publicEnv = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? "",
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787/api/v1",
} as const;

/** UI memakai ini untuk menampilkan panduan setup alih-alih error mentah. */
export const isSupabaseConfigured =
  publicEnv.supabaseUrl.startsWith("https://") && publicEnv.supabaseAnonKey.length > 20;
