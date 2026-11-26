import { RequireVerifiedOrganization } from "~/features/auth/guards";
import { OrganizationInboxPage } from "~/features/campaigns/inbox-page";

export function meta() {
  return [{ title: "Laporan siap diambil — Jangkau" }];
}

export default function Route() {
  return (
    <RequireVerifiedOrganization>
      <OrganizationInboxPage />
    </RequireVerifiedOrganization>
  );
}
