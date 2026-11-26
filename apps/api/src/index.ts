import app from "./app.js";

/**
 * Entry Cloudflare Worker mandiri (`wrangler deploy` di apps/api).
 * Aplikasi Hono-nya sendiri ada di `app.ts` supaya bisa juga dipasang
 * di dalam Pages Functions (satu origin dengan web).
 */
export default app;
