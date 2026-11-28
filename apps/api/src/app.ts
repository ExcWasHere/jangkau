import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";

import type { AppEnv } from "./env.js";
import { AppError } from "./shared/errors.js";
import { requireSupabase } from "./shared/middleware/require-supabase.js";
import { adminRoutes } from "./modules/admin/routes.js";
import { distributorRoutes } from "./modules/distributors/routes.js";
import { eventRoutes } from "./modules/events/routes.js";
import { meRoutes } from "./modules/me/routes.js";
import { picRoutes } from "./modules/pic/routes.js";
import { poskoRoutes } from "./modules/posko/routes.js";
import { postRoutes } from "./modules/posts/routes.js";
import { uploadRoutes } from "./modules/uploads/routes.js";

const app = new Hono<AppEnv>();

app.use("*", logger());
app.use("*", secureHeaders());

/**
 * Frontend (Cloudflare Pages) dan API (Worker) kini beda origin, jadi CORS
 * harus eksplisit. Origin diambil dari `ALLOWED_ORIGINS` (dipisah koma) dan
 * `APP_BASE_URL`. Preview deployment Pages punya subdomain acak, jadi
 * `*.pages.dev` diizinkan — semua data tetap butuh Bearer token.
 */
app.use(
  "/api/*",
  cors({
    origin: (origin, c) => {
      if (!origin) return null;

      const explicit = [c.env.APP_BASE_URL, ...(c.env.ALLOWED_ORIGINS ?? "").split(",")]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value));

      if (explicit.includes(origin)) return origin;
      if (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) {
        return origin;
      }
      if (origin.endsWith(".pages.dev")) return origin;
      return null;
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

api.route("/events", eventRoutes);
// Router kedua pada prefix yang sama: `GET /events/:id` di eventRoutes hanya
// cocok untuk satu segmen, jadi rute dua segmen di picRoutes tidak bertabrakan.
api.route("/events", picRoutes);
api.route("/posko", poskoRoutes);
api.route("/posts", postRoutes);
api.route("/uploads", uploadRoutes);
api.route("/distributors", distributorRoutes);
api.route("/me", meRoutes);
api.route("/admin", adminRoutes);

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
