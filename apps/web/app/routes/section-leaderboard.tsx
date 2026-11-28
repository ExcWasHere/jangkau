import type { Route } from "./+types/section-leaderboard";

import { fetchFeed } from "~/features/feed/api";
import { SECTION_COPY, SectionPage } from "~/features/feed/section-page";

export function meta({}: Route.MetaArgs) {
  return [{ title: `${SECTION_COPY.leaderboard.title} — Jangkau` }];
}

export async function loader() {
  const feed = await fetchFeed({ section: "leaderboard", limit: 30 });
  return { items: feed.items };
}

export default function Leaderboard({ loaderData }: Route.ComponentProps) {
  return <SectionPage section="leaderboard" items={loaderData.items} />;
}
