import type { Route } from "./+types/campaign-detail";

import { RequireRole } from "~/features/auth/guards";
import { CampaignDetailPage } from "~/features/campaigns/campaign-detail-page";

export function meta() {
  return [{ title: "Kampanye — Jangkau" }];
}

export default function Route({ params }: Route.ComponentProps) {
  return (
    <RequireRole allow={["resident", "organization", "admin"]}>
      <CampaignDetailPage campaignId={params.campaignId} />
    </RequireRole>
  );
}
