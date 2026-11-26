import type { RouteConfig } from "@react-router/dev/routes";

export default [
  { index: true, file: "routes/home.tsx" },
  { path: "masuk", file: "routes/login.tsx" },
  { path: "daftar", file: "routes/register.tsx" },
] satisfies RouteConfig;
