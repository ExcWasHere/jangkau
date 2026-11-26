import { Hono } from "hono";

import type { AppEnv } from "../../env.js";
import { requireAuth } from "../../shared/middleware/auth.js";

export const meRoutes = new Hono<AppEnv>();

meRoutes.get("/", requireAuth, (c) => {
  return c.json({ user: c.get("user") });
});
