import { Link } from "react-router";

import type { FeedItem } from "./api";
import { relativeTime } from "./api";

const SECTION_LABEL: Record<string, string> = {
  leaderboard: "LEADERBOARD",
  pantau: "PANTAU",
  terbaru: "TERBARU",
};

const SECTION_STYLE: Record<string, string> = {
  leaderboard: "bg-brand-soft text-brand",
  pantau: "bg-ok/10 text-ok",
  terbaru: "bg-surface text-muted",
};

export function EventCard({ event }: { event: FeedItem }) {
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
            alt={`Foto lokasi ${event.title}`}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[13px] text-muted">
            Belum ada foto
          </div>
        )}

        {/*
          Status penanggung jawab lebih penting daripada nama section: kalau
          keduanya diletakkan sebaris, label section yang tergeser dan hilang.
          Section sudah dibaca dari judul rak, jadi badge hanya muncul untuk
          kartu di rak campuran.
        */}
        <span className="absolute left-3 top-3 rounded-full bg-canvas/90 px-2.5 py-1 text-[11px] font-semibold">
          {event.hasPersonInCharge
            ? `Sudah ada penanggung jawab · ${event.picCount}`
            : "Belum ada penanggung jawab"}
        </span>

        {event.section === "leaderboard" ? (
          <span
            className={`absolute bottom-3 left-3 rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide ${
              SECTION_STYLE.leaderboard
            }`}
          >
            {SECTION_LABEL.leaderboard}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="line-clamp-2 text-[16px] font-semibold leading-snug">{event.title}</h3>
        <p className="text-[13px] text-muted">
          {[event.region.regency, event.region.province].filter(Boolean).join(", ") || "Lokasi tidak disebut"}
          {" · "}
          {relativeTime(event.lastActivityAt)}
        </p>
        <p className="mt-auto pt-2 text-[13px] text-muted">
          <span className="font-semibold text-ink">{event.likeCount}</span> dukungan
          {" · "}
          <span className="font-semibold text-ink">{event.uploaders.length}</span> pelapor
          {" · "}
          <span className="font-semibold text-ink">{event.poskoCount}</span> posko
        </p>
      </div>
    </Link>
  );
}
