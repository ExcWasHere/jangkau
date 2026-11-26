import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";

import type { AppEnv } from "./env.js";
import { AppError } from "./lib/errors.js";
import { requireSupabase } from "./middleware/require-supabase.js";
import { meRoutes } from "./routes/me.js";
import { postRoutes } from "./routes/posts.js";
import { reportRoutes } from "./routes/reports.js";
import { uploadRoutes } from "./routes/uploads.js";

const app = new Hono<AppEnv>();

app.use("*", logger());
app.use("*", secureHeaders());

app.use(
  "/api/*",
  cors({
    origin: (origin, c) => {
      const allowed = [c.env.APP_BASE_URL, "http://localhost:5173"];
      return allowed.includes(origin) ? origin : null;
    },
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    maxAge: 86400,
  }),
);

const api = new Hono<AppEnv>();

api.get("/health", (c) =>
  c.json({ ok: true, service: "jangkau-api", time: new Date().toISOString() }),
);

// Health sengaja didaftarkan sebelum guard agar tetap bisa dipanggil
// tanpa kredensial database.
api.use("*", requireSupabase);

api.route("/me", meRoutes);
api.route("/posts", postRoutes);
api.route("/reports", reportRoutes);
api.route("/uploads", uploadRoutes);

app.route("/api/v1", api);

app.notFound((c) => c.json({ error: { code: "not_found", message: "Endpoint tidak ada" } }, 404));

/**
 * Error dari Supabase berbentuk objek biasa (bukan `Error`), jadi
 * penanganan tidak boleh bergantung pada `instanceof Error` saja.
 */
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      err.status,
    );
  }

  if (err instanceof HTTPException) {
    return c.json({ error: { code: "http_error", message: err.message } }, err.status);
  }

  const raw = err as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  console.error("unhandled", raw?.code ?? "", raw?.message ?? String(err));

  // Kode PostgREST untuk tabel/fungsi yang belum ada di cache skema
  // berarti migrasi belum dijalankan, bukan bug aplikasi.
  if (raw?.code === "PGRST205" || raw?.code === "42P01") {
    return c.json(
      {
        error: {
          code: "database_not_migrated",
          message:
            "Tabel belum ada. Jalankan `bun run db:push` (packages/db/migrations) lebih dulu.",
        },
      },
      503,
    );
  }

  return c.json(
    { error: { code: "internal_error", message: "Terjadi kesalahan di server" } },
    500,
  );
});

export default app;
