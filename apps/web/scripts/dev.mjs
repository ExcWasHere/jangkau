/**
 * Dev server web dengan API lokal.
 *
 * Kenapa tidak cukup `.env.local`: React Router v7 memuat `.env` sendiri ke
 * `process.env` sebelum Vite, dan nilai itu menang atas `.env.local`. Akibatnya
 * `import.meta.env.VITE_API_BASE_URL` tetap berisi URL deployment walau
 * `.env.local` sudah diisi. Skrip ini menetapkan variabelnya lebih dulu, jadi
 * tidak ada dua sumber yang bersaing.
 *
 *   bun run dev          # API lokal (default)
 *   bun run dev:remote   # pakai URL dari .env (Worker yang sudah dideploy)
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const localApi = process.env.JANGKAU_API_URL ?? "http://localhost:8787/api/v1";
const useRemote = process.argv.includes("--remote");

// `bunx` tidak ada di PATH pada Windows; binari react-router dipanggil
// langsung dari node_modules supaya tidak bergantung pada shell.
const cli = fileURLToPath(new URL("../node_modules/@react-router/dev/bin.js", import.meta.url));

const child = spawn(process.execPath, [cli, "dev", "--port", process.env.PORT ?? "5173"], {
  stdio: "inherit",
  env: {
    ...process.env,
    ...(useRemote ? {} : { VITE_API_BASE_URL: localApi }),
  },
});

child.on("exit", (code) => process.exit(code ?? 0));
