import { createClient } from "@supabase/supabase-js";

import type { Bindings } from "../env.js";

/**
 * Client dengan service_role: melewati RLS. Hanya dipakai setelah
 * request diverifikasi oleh middleware auth. Kunci ini tidak pernah
 * dikirim ke browser.
 */
export function adminClient(env: Bindings) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-application-name": "jangkau-api" } },
  });
}

export function anonClient(env: Bindings) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** PostGIS geography literal untuk kolom `geography(Point,4326)`. */
export function toPoint(lat: number, lng: number): string {
  return `SRID=4326;POINT(${lng} ${lat})`;
}
