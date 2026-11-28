import type { FeedSection } from "@jangkau/shared";

import { useT } from "~/i18n";
import { FeedList } from "./feed-racks";
import { AppShell } from "~/shared/layout/app-shell";
import type { FeedItem } from "./api";

const COPY = {
  leaderboard: {
    title: "feed.leaderboardTitle",
    hint: "feed.leaderboardHint",
    empty: "feed.leaderboardEmpty",
  },
  pantau: {
    title: "feed.pantauTitle",
    hint: "feed.pantauHint",
    empty: "feed.pantauEmpty",
  },
  terbaru: {
    title: "feed.terbaruTitle",
    hint: "feed.terbaruHint",
    empty: "feed.terbaruEmpty",
  },
} as const;

export function SectionPage({ section, items }: { section: FeedSection; items: FeedItem[] }) {
  const { t } = useT();
  const copy = COPY[section];

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-[28px] font-extrabold">{t(copy.title)}</h1>
          <p className="text-[14px] text-muted">{t(copy.hint)}</p>
        </header>

        <FeedList items={items} empty={t(copy.empty)} />
      </div>
    </AppShell>
  );
}
