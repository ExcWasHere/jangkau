import type { Route } from "./+types/home";

import { fetchFeed } from "~/features/feed/api";
import { FeedRacks } from "~/features/feed/feed-racks";
import { translatorFromMatches, useT } from "~/i18n";
import { AppShell } from "~/shared/layout/app-shell";

export function meta({ matches }: Route.MetaArgs) {
  const t = translatorFromMatches(matches);
  return [
    { title: t("meta.homeTitle") },
    { name: "description", content: t("meta.homeDescription") },
  ];
}

export async function loader() {
  return { feed: await fetchFeed({ limit: 24 }) };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { t } = useT();
  const { feed } = loaderData;

  return (
    <AppShell>
      <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-2">
          <h1 className="text-[32px] font-extrabold leading-tight">{t("feed.homeTitle")}</h1>
          <p className="max-w-[640px] text-[15px] leading-relaxed text-muted">
            {t("feed.homeIntro")}
          </p>
        </section>

        <FeedRacks items={feed.items} />
      </div>
    </AppShell>
  );
}
