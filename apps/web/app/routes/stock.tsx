import { RequireVerifiedOrganization } from "~/features/auth/guards";
import { StockDashboardPage } from "~/features/stock/stock-dashboard-page";

export function meta() {
  return [{ title: "Stok pos — Jangkau" }];
}

export default function Route() {
  return (
    <RequireVerifiedOrganization>
      <StockDashboardPage />
    </RequireVerifiedOrganization>
  );
}
