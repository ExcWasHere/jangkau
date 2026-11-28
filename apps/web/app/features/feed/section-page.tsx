import type { FeedSection } from "@jangkau/shared";

import { FeedList } from "./feed-racks";
import { AppShell } from "~/shared/layout/app-shell";

export const SECTION_COPY: Record<FeedSection, { title: string; hint: string; empty: string }> = {
  leaderboard: {
    title: "Leaderboard",
    hint: "Berita yang sudah menembus ambang dukungan dan siap diambil penyalur.",
    empty: "Belum ada berita yang menembus ambang dukungan.",
  },
  pantau: {
    title: "Pantau",
    hint: "Sudah ada penanggung jawab. Kebutuhan posko dan bukti belanja terbuka untuk publik.",
    empty: "Belum ada berita yang punya penanggung jawab.",
  },
  terbaru: {
    title: "Terbaru",
    hint: "Laporan terbaru dari warga di lokasi.",
    empty: "Belum ada laporan.",
  },
};

export function SectionPage({
  section,
  items,
}: {
  section: FeedSection;
  items: Parameters<typeof FeedList>[0]["items"];
}) {
  const copy = SECTION_COPY[section];

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-[28px] font-extrabold">{copy.title}</h1>
          <p className="text-[14px] text-muted">{copy.hint}</p>
        </header>

        <FeedList items={items} empty={copy.empty} />
      </div>
    </AppShell>
  );
}
