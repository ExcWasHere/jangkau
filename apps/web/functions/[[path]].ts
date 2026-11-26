import { createPagesFunctionHandler } from "@react-router/cloudflare";
import type { ServerBuild } from "react-router";

import app from "@jangkau/api/app";

import * as buildModule from "../build/server";

// Artefak build tidak punya deklarasi tipe; bentuknya dijamin oleh
// `react-router build` sehingga cast di batas ini aman.
const build = buildModule as unknown as ServerBuild;

const reactRouter = createPagesFunctionHandler({ build });

/**
 * Satu origin untuk web dan API:
 *   /api/*  → Hono (apps/api)
 *   lainnya → React Router SSR
 *
 * Alasannya operasional: subdomain `*.workers.dev` tidak bisa dipakai
 * untuk demo, sedangkan `*.pages.dev` bisa. API tetap bisa dideploy
 * sebagai Worker terpisah (apps/api/src/index.ts) bila nanti ada domain.
 */
export const onRequest: PagesFunction = (context) => {
  const url = new URL(context.request.url);

  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    // Env Pages berisi secret yang sama dengan yang dibaca Worker;
    // tipenya divalidasi di runtime oleh tiap handler. ExecutionContext
    // Pages tidak punya `props`, jadi dibentuk ulang dari bagian yang dipakai.
    const executionCtx = {
      waitUntil: context.waitUntil.bind(context),
      passThroughOnException: context.passThroughOnException.bind(context),
    } as ExecutionContext;

    return app.fetch(context.request, context.env as unknown as never, executionCtx);
  }

  return reactRouter(context);
};
