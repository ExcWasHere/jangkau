import type { RouteConfig } from "@react-router/dev/routes";

export default [
  // Publik
  { index: true, file: "routes/home.tsx" },
  { path: "masuk", file: "routes/login.tsx" },
  { path: "daftar", file: "routes/register.tsx" },
  { path: "pos/:postId", file: "routes/post-detail.tsx" },
  { path: "laporan/:reportId", file: "routes/report-detail.tsx" },

  // Butuh login
  { path: "lapor", file: "routes/report-new.tsx" },
  { path: "laporan", file: "routes/reports.tsx" },
] satisfies RouteConfig;
