import type { Route } from "./+types/section-leaderboard";

import { fetchFeed } from "~/features/feed/api";
import { SectionPage } from "~/features/feed/section-page";
import { translatorFromMatches } from "~/i18n";

export function meta({ matches }: Route.MetaArgs) {
  const t = translatorFromMatches(matches);
  return [{ title: `${t("feed.leaderboardTitle")} — ${t("meta.eventTitleSuffix")}` }];
}

export async function loader() {
  const feed = await fetchFeed({ section: "leaderboard", limit: 30 });
  return { items: feed.items };
}

export default function Leaderboard({ loaderData }: Route.ComponentProps) {
  return <SectionPage section="leaderboard" items={loaderData.items} />;
}
