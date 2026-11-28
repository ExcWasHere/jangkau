import { Link } from "react-router";

import { useT } from "~/i18n";
import type { FeedItem } from "./api";
import { relativeTime } from "./api";

const SECTION_KEY = {
  leaderboard: "feed.sectionLeaderboard",
  pantau: "feed.sectionPantau",
  terbaru: "feed.sectionTerbaru",
} as const;

export function EventCard({ event }: { event: FeedItem }) {
  const { t, locale } = useT();

  const region =
    [event.region.regency, event.region.province].filter(Boolean).join(", ") ||
    t("common.locationUnknown");

  return (
    <Link
      to={`/bencana/${event.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-line bg-surface transition-colors hover:border-brand-line"
    >
      {/* `shrink-0` wajib: tanpa itu kartu yang teksnya lebih panjang
          meregangkan wadah foto dan rasio 16:9 rusak. */}
      <div className="relative aspect-video w-full shrink-0 overflow-hidden bg-canvas">
        {event.coverUrl ? (
          <img
            src={event.coverUrl}
            alt={t("feed.photoAlt", { title: event.title })}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[13px] text-muted">
            {t("common.noPhoto")}
          </div>
        )}

        {/*
          Status penanggung jawab lebih penting daripada nama section: kalau
          keduanya sebaris, label section yang tergeser dan hilang. Section
          sudah terbaca dari judul rak, jadi badge hanya untuk Leaderboard.
        */}
        <span className="absolute left-3 top-3 rounded-full bg-canvas/90 px-2.5 py-1 text-[11px] font-semibold">
          {event.hasPersonInCharge
            ? t("feed.hasPic", { count: event.picCount })
            : t("feed.noPic")}
        </span>

        {event.section === "leaderboard" ? (
          <span className="absolute bottom-3 left-3 rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-bold tracking-wide text-brand-text">
            {t(SECTION_KEY.leaderboard)}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="line-clamp-2 text-[16px] font-semibold leading-snug">{event.title}</h3>
        <p className="text-[13px] text-muted">
          {region} · {relativeTime(event.lastActivityAt, locale)}
        </p>
        {/*
          Angka dipisah dari labelnya supaya bisa ditebalkan sendiri, tanpa
          menyisipkan markup ke dalam kamus. Karena pemisahan itu, pembaca layar
          akan membacanya tanpa spasi ("55dukungan"); `aria-label` mengembalikan
          satu kalimat utuh untuk pembaca layar tanpa mengubah tampilan.
        */}
        <p
          className="mt-auto pt-2 text-[13px] text-muted"
          aria-label={`${event.likeCount} ${t("feed.supportLabel")}, ${event.uploaders.length} ${t("feed.reporterLabel")}, ${event.poskoCount} ${t("feed.poskoLabel")}`}
        >
          <span className="font-semibold text-ink">{event.likeCount}</span>{" "}
          {t("feed.supportLabel")}
          {" · "}
          <span className="font-semibold text-ink">{event.uploaders.length}</span>{" "}
          {t("feed.reporterLabel")}
          {" · "}
          <span className="font-semibold text-ink">{event.poskoCount}</span>{" "}
          {t("feed.poskoLabel")}
        </p>
      </div>
    </Link>
  );
}
