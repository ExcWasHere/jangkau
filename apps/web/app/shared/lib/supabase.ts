import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { publicEnv } from "./env";

let browserClient: SupabaseClient | null = null;

/**
 * Client Supabase untuk browser saja. Dipakai hanya untuk auth
 * (sign-in/up/out); semua data lewat Hono API.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (typeof window === "undefined") {
    throw new Error("Client Supabase hanya tersedia di browser");
  }
  browserClient ??= createClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return browserClient;
}
