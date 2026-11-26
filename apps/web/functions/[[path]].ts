import { createPagesFunctionHandler } from "@react-router/cloudflare";
import type { ServerBuild } from "react-router";

import * as buildModule from "../build/server";

// Artefak build tidak punya deklarasi tipe; bentuknya dijamin oleh
// `react-router build` sehingga cast di batas ini aman.
const build = buildModule as unknown as ServerBuild;

/**
 * Entry Cloudflare Pages: semua request non-aset dirender oleh React Router.
 *
 * Backend Hono **tidak** dipasang di sini — ia Worker terpisah
 * (`apps/api`). Frontend memanggilnya lewat `VITE_API_BASE_URL`.
 */
export const onRequest = createPagesFunctionHandler({ build });
