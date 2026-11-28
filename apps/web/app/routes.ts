import type { RouteConfig } from "@react-router/dev/routes";

export default [
  { index: true, file: "routes/home.tsx" },
  { path: "leaderboard", file: "routes/section-leaderboard.tsx" },
  { path: "pantau", file: "routes/section-pantau.tsx" },
  { path: "bencana/:id", file: "routes/bencana-detail.tsx" },
  { path: "bencana/:id/donasi", file: "routes/donasi-baru.tsx" },
  { path: "donasi/:id", file: "routes/donasi-detail.tsx" },
  { path: "unggah", file: "routes/unggah.tsx" },
  { path: "saya", file: "routes/saya.tsx" },
  { path: "dashboard", file: "routes/dashboard.tsx" },
  { path: "pencairan", file: "routes/pencairan.tsx" },
  { path: "konfirmasi", file: "routes/konfirmasi.tsx" },
  { path: "notifikasi", file: "routes/notifikasi.tsx" },
  { path: "admin", file: "routes/admin.tsx" },
  { path: "masuk", file: "routes/login.tsx" },
  { path: "daftar", file: "routes/register.tsx" },
] satisfies RouteConfig;
