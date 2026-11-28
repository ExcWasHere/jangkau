import type { Route } from "./+types/section-pantau";

import { fetchFeed } from "~/features/feed/api";
import { SECTION_COPY, SectionPage } from "~/features/feed/section-page";

export function meta({}: Route.MetaArgs) {
  return [{ title: `${SECTION_COPY.pantau.title} — Jangkau` }];
}

export async function loader() {
  const feed = await fetchFeed({ section: "pantau", limit: 30 });
  return { items: feed.items };
}

export default function Pantau({ loaderData }: Route.ComponentProps) {
  return <SectionPage section="pantau" items={loaderData.items} />;
}
