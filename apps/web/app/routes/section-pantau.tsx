import type { Route } from "./+types/section-pantau";

import { fetchFeed } from "~/features/feed/api";
import { SectionPage } from "~/features/feed/section-page";
import { translatorFromMatches } from "~/i18n";

export function meta({ matches }: Route.MetaArgs) {
  const t = translatorFromMatches(matches);
  return [{ title: `${t("feed.pantauTitle")} — ${t("meta.eventTitleSuffix")}` }];
}

export async function loader() {
  const feed = await fetchFeed({ section: "pantau", limit: 30 });
  return { items: feed.items };
}

export default function Pantau({ loaderData }: Route.ComponentProps) {
  return <SectionPage section="pantau" items={loaderData.items} />;
}
