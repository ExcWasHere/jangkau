import type { MiddlewareHandler } from "hono";

import type { AppEnv } from "../../env.js";

/**
 * Endpoint yang butuh database membalas 503 dengan pesan jelas selama
 * kredensial belum diisi, alih-alih 500 "terjadi kesalahan".
 */
export const requireSupabase: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.env.SUPABASE_URL?.startsWith("https://") || !c.env.SUPABASE_SERVICE_ROLE_KEY) {
    return c.json(
      {
        error: {
          code: "supabase_not_configured",
          message:
            "SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY belum diisi di apps/api/.dev.vars",
        },
      },
      503,
    );
  }
  await next();
};
