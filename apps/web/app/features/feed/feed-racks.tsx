import { Link } from "react-router";

import type { FeedItem } from "./api";
import { EventCard } from "./event-card";

type Rack = {
  key: "leaderboard" | "pantau" | "terbaru";
  title: string;
  hint: string;
};

const RACKS: Rack[] = [
  {
    key: "leaderboard",
    title: "Leaderboard",
    hint: "Berita yang sudah menembus ambang dukungan dan siap diambil penyalur.",
  },
  {
    key: "pantau",
    title: "Pantau",
    hint: "Sudah ada penanggung jawab. Kebutuhan posko dan bukti belanja terbuka untuk publik.",
  },
  {
    key: "terbaru",
    title: "Terbaru",
    hint: "Laporan terbaru dari warga di lokasi.",
  },
];

function emptyMessage(section: Rack["key"]): string {
  switch (section) {
    case "leaderboard":
      return "Belum ada berita yang menembus ambang dukungan.";
    case "pantau":
      return "Belum ada berita yang punya penanggung jawab.";
    default:
      return "Belum ada laporan. Jadilah yang pertama melapor.";
  }
}

export function FeedRacks({ items }: { items: FeedItem[] }) {
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
                {rack.title}
              </h2>
              <Link to={`/${rack.key}`} className="text-[13px] font-semibold text-brand hover:underline">
                Lihat semua
              </Link>
              <p className="basis-full text-[13px] text-muted">{rack.hint}</p>
            </div>

            {rows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-[13px] text-muted">
                {emptyMessage(rack.key)}
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
