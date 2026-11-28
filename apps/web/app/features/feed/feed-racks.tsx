import { Link } from "react-router";

import { useT } from "~/i18n";
import type { FeedItem } from "./api";
import { EventCard } from "./event-card";

type RackKey = "leaderboard" | "pantau" | "terbaru";

const RACKS: Array<{ key: RackKey; title: "feed.leaderboardTitle" | "feed.pantauTitle" | "feed.terbaruTitle"; hint: "feed.leaderboardHint" | "feed.pantauHint" | "feed.terbaruHint"; empty: "feed.leaderboardEmpty" | "feed.pantauEmpty" | "feed.terbaruEmpty" }> = [
  {
    key: "leaderboard",
    title: "feed.leaderboardTitle",
    hint: "feed.leaderboardHint",
    empty: "feed.leaderboardEmpty",
  },
  {
    key: "pantau",
    title: "feed.pantauTitle",
    hint: "feed.pantauHint",
    empty: "feed.pantauEmpty",
  },
  {
    key: "terbaru",
    title: "feed.terbaruTitle",
    hint: "feed.terbaruHint",
    empty: "feed.terbaruEmpty",
  },
];

export function FeedRacks({ items }: { items: FeedItem[] }) {
  const { t } = useT();

  const grouped = new Map<string, FeedItem[]>();
  for (const item of items) {
    const list = grouped.get(item.section) ?? [];
    list.push(item);
    grouped.set(item.section, list);
  }

  return (
    <div className="flex flex-col gap-10">
      {RACKS.map((rack) => {
        const rows = grouped.get(rack.key) ?? [];
        return (
          <section key={rack.key} aria-labelledby={`rack-${rack.key}`}>
            <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 id={`rack-${rack.key}`} className="text-[20px] font-bold">
                {t(rack.title)}
              </h2>
              <Link
                to={`/${rack.key}`}
                className="text-[13px] font-semibold text-brand-text hover:underline"
              >
                {t("feed.seeAll")}
              </Link>
              <p className="basis-full text-[13px] text-muted">{t(rack.hint)}</p>
            </div>

            {rows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-[13px] text-muted">
                {t(rack.empty)}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {rows.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

export function FeedList({ items, empty }: { items: FeedItem[]; empty: string }) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-[13px] text-muted">
        {empty}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
    </div>
  );
}
