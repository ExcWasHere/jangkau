import type { RouteConfig } from "@react-router/dev/routes";

export default [
  // Publik
  { index: true, file: "routes/home.tsx" },
  { path: "masuk", file: "routes/login.tsx" },
  { path: "daftar", file: "routes/register.tsx" },
  { path: "peta", file: "routes/peta.tsx" },
  { path: "pos/:postId", file: "routes/post-detail.tsx" },
  { path: "laporan/:reportId", file: "routes/report-detail.tsx" },

  // Pelapor
  { path: "lapor", file: "routes/report-new.tsx" },
  { path: "laporan", file: "routes/reports.tsx" },
  { path: "konfirmasi-rab", file: "routes/confirm-rab.tsx" },
  { path: "stok", file: "routes/stock.tsx" },

  // Organisasi
  { path: "organisasi", file: "routes/organization-status.tsx" },
  { path: "organisasi/daftar", file: "routes/organization-register.tsx" },
  { path: "laporan-masuk", file: "routes/organization-inbox.tsx" },
  { path: "kampanye/:campaignId", file: "routes/campaign-detail.tsx" },

  // Admin
  { path: "admin/organisasi", file: "routes/admin-organizations.tsx" },
] satisfies RouteConfig;
