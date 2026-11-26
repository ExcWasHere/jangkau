import type { Route } from "./+types/campaign-detail";

import { CampaignDetailPage } from "~/features/campaigns/campaign-detail-page";

export function meta() {
  return [{ title: "Kampanye — Jangkau" }];
}

export default function Route({ params }: Route.ComponentProps) {
  return <CampaignDetailPage campaignId={params.campaignId} />;
}
