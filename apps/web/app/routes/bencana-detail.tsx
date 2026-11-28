import { useEffect, useState } from "react";
import { Link, data, useLoaderData } from "react-router";
import type { Route } from "./+types/bencana-detail";

import type { EventDetail } from "~/features/feed/api";
import { formatRupiah, relativeTime } from "~/features/feed/api";
import { useAuthState } from "~/features/auth/session";
import { translatorFromMatches, useT } from "~/i18n";
import { AppShell } from "~/shared/layout/app-shell";
import { apiFetch } from "~/shared/api/client";
import { useToast } from "~/shared/ui/toast";

export function meta({ data, matches }: Route.MetaArgs) {
  const t = translatorFromMatches(matches);
  const title = data?.detail.event.title ?? t("feed.terbaruTitle");
  return [{ title: `${title} — ${t("meta.eventTitleSuffix")}` }];
}

export async function loader({ params }: Route.LoaderArgs) {
  const id = params.id;
  if (!id) throw data("Berita bencana tidak ditemukan", { status: 404 });

  const response = await fetch(
    `${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787/api/v1"}/events/${id}`,
  );

  if (response.status === 404) throw data("Berita bencana tidak ditemukan", { status: 404 });
  if (!response.ok) throw data("Gagal memuat berita bencana", { status: 502 });

  return { detail: (await response.json()) as EventDetail };
}

const LABEL_KEY = {
  organization: "event.labelOrganization",
  volunteer: "event.labelVolunteer",
  creator: "event.labelCreator",
} as const;

export default function EventDetailPage() {
  const { detail } = useLoaderData<typeof loader>();
  const { t, locale } = useT();
  const { token } = useAuthState();
  const toast = useToast();

  const { event } = detail;
  const [like, setLike] = useState({ count: event.likeCount, mine: detail.likedByMe });

  const region =
    [event.region.village, event.region.district, event.region.regency, event.region.province]
      .filter(Boolean)
      .join(", ") || t("common.locationUnknown");

  // Loader berjalan tanpa token, jadi status dukungan pemilik sesi diambil
  // sekali di klien setelah hidrasi. Tanpa ini tombol selalu tampak "belum
  // didukung" walau pengguna sudah mendukung.
  useEffect(() => {
    if (!token) return;
    let active = true;

    apiFetch<EventDetail>(`/events/${event.id}`, { token })
      .then((fresh) => {
        if (!active) return;
        setLike({ count: fresh.event.likeCount, mine: fresh.likedByMe });
      })
      .catch(() => {
        // Status dukungan gagal dimuat bukan alasan menggagalkan halaman.
      });

    return () => {
      active = false;
    };
  }, [event.id, token]);

  async function toggleLike() {
    if (!token) {
      toast.push(t("event.signInToSupport"), "info");
      return;
    }

    const result = await apiFetch<{ likeCount: number; likedByMe: boolean }>(
      `/events/${event.id}/like`,
      { method: like.mine ? "DELETE" : "POST", token },
    );

    setLike({ count: result.likeCount, mine: result.likedByMe });
  }

  return (
    <AppShell>
      <article className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <p className="text-[12px] font-bold tracking-wide text-brand-text">
            {event.hasPersonInCharge
              ? t("event.kindPantau")
              : event.section === "leaderboard"
                ? t("feed.sectionLeaderboard")
                : t("feed.sectionTerbaru")}
          </p>
          <h1 className="text-[28px] font-bold leading-tight">{event.title}</h1>
          <p className="text-[13px] text-muted">
            {region} · {t("event.reportedAt", { time: relativeTime(event.firstReportedAt, locale) })}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void toggleLike()}
              aria-pressed={like.mine}
              className={`rounded-lg border px-4 py-2 text-[14px] font-semibold ${
                like.mine ? "border-brand bg-brand-soft text-brand-text" : "border-line"
              }`}
            >
              {like.mine ? t("event.supported") : t("event.support")} · {like.count}
            </button>
            <span className="text-[13px] text-muted">
              {t("event.reportersAndPosko", {
                reporters: event.uploaders.length,
                posko: event.poskoCount,
              })}
            </span>
          </div>
        </header>

        {event.coverUrl ? (
          <img
            src={event.coverUrl}
            alt={t("feed.photoAlt", { title: event.title })}
            className="aspect-video w-full rounded-xl object-cover"
          />
        ) : null}

        {event.summary ? (
          <p className="max-w-[720px] text-[15px] leading-relaxed">{event.summary}</p>
        ) : null}

        <section aria-labelledby="pengunggah">
          <h2 id="pengunggah" className="text-[18px] font-semibold">
            {t("event.reportersTitle")}
          </h2>
          <ul className="mt-2 flex flex-wrap gap-2 text-[13px] text-muted">
            {event.uploaders.map((uploader) => (
              <li key={uploader.id} className="rounded-full border border-line px-3 py-1">
                {t("event.uploaderLine", {
                  name: uploader.name,
                  count: uploader.post_count,
                })}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="penanggung-jawab">
          <h2 id="penanggung-jawab" className="text-[18px] font-semibold">
            {t("event.picTitle")}
          </h2>

          {detail.personInCharge.length === 0 ? (
            <p className="mt-2 rounded-xl border border-dashed border-line px-4 py-6 text-[13px] text-muted">
              {t("event.picEmpty")}
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {detail.personInCharge.map((pic) => (
                <li key={pic.assignmentId} className="rounded-xl border border-line bg-surface p-4">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[15px] font-semibold">{pic.displayName}</span>
                    <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-semibold text-muted">
                      {t(LABEL_KEY[pic.label] ?? "event.labelVolunteer")}
                    </span>
                    {pic.verified ? (
                      <span className="text-[11px] font-semibold text-ok">
                        {t("event.verified")}
                      </span>
                    ) : null}
                  </div>
                  {pic.bio ? <p className="mt-1 text-[13px] text-muted">{pic.bio}</p> : null}
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4">
                    <div>
                      <dt className="text-muted">{t("event.raised")}</dt>
                      <dd className="font-semibold">
                        {formatRupiah(Number(pic.totalIn), locale)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">{t("event.disbursed")}</dt>
                      <dd className="font-semibold">
                        {formatRupiah(Number(pic.totalOut), locale)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">{t("event.donorCount")}</dt>
                      <dd className="font-semibold">{pic.donationCount}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">{t("event.poskoCount")}</dt>
                      <dd className="font-semibold">{pic.poskoCount}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="posko">
          <h2 id="posko" className="text-[18px] font-semibold">
            {t("event.poskoTitle")}
          </h2>

          {detail.posko.length === 0 ? (
            <p className="mt-2 rounded-xl border border-dashed border-line px-4 py-6 text-[13px] text-muted">
              {t("event.poskoEmpty")}
            </p>
          ) : (
            <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {detail.posko.map((posko) => (
                <li key={posko.id} className="rounded-xl border border-line bg-surface p-4">
                  <p className="text-[15px] font-semibold">{posko.name}</p>
                  <p className="text-[13px] text-muted">
                    {posko.address ?? t("event.addressEmpty")}
                  </p>
                  <p className="mt-2 text-[13px]">
                    <span className="font-semibold">
                      {t("event.headcount", { count: posko.headcount })}
                    </span>
                    {posko.capacity
                      ? ` · ${t("event.capacity", { count: posko.capacity })}`
                      : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-[13px] text-muted">
          <Link to="/" className="underline hover:text-ink">
            {t("common.backToHome")}
          </Link>
        </p>
      </article>
    </AppShell>
  );
}
