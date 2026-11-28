import { useEffect, useMemo, useState } from "react";
import { Link, data, useLoaderData } from "react-router";
import type { Route } from "./+types/bencana-detail";

import type { EventDetail } from "~/features/feed/api";
import { formatRupiah, relativeTime } from "~/features/feed/api";
import { useAuthState } from "~/features/auth/session";
import { AppShell } from "~/shared/layout/app-shell";
import { apiFetch } from "~/shared/api/client";

export function meta({ data }: Route.MetaArgs) {
  const title = data?.detail.event.title ?? "Berita bencana";
  return [{ title: `${title} — Jangkau` }];
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

const LABEL_TEXT: Record<string, string> = {
  organization: "Organisasi tanggap bencana",
  volunteer: "Relawan",
  creator: "Kreator",
};

export default function EventDetailPage() {
  const { detail } = useLoaderData<typeof loader>();
  const { token } = useAuthState();

  const { event } = detail;
  const [like, setLike] = useState({ count: event.likeCount, mine: detail.likedByMe });

  // Loader berjalan tanpa token, jadi status dukungan pemilik sesi diambil
  // sekali di klien setelah hidrasi. Tanpa ini tombol akan selalu tampak
  // "belum didukung" walau pengguna sudah mendukung.
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
  const region = useMemo(
    () =>
      [event.region.village, event.region.district, event.region.regency, event.region.province]
        .filter(Boolean)
        .join(", ") || "Lokasi tidak disebut",
    [event.region],
  );

  async function toggleLike() {
    if (!token) {
      window.location.href = "/masuk";
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
          <p className="text-[12px] font-bold tracking-wide text-brand">
            {event.hasPersonInCharge ? "PANTAU" : event.section.toUpperCase()}
          </p>
          <h1 className="text-[28px] font-bold leading-tight">{event.title}</h1>
          <p className="text-[13px] text-muted">
            {region} · dilaporkan {relativeTime(event.firstReportedAt)}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void toggleLike()}
              className={`rounded-lg border px-4 py-2 text-[14px] font-semibold ${
                like.mine ? "border-brand bg-brand-soft text-brand" : "border-line"
              }`}
            >
              {like.mine ? "Didukung" : "Dukung"} · {like.count}
            </button>
            <span className="text-[13px] text-muted">
              {event.uploaders.length} pelapor · {event.poskoCount} posko
            </span>
          </div>
        </header>

        {event.coverUrl ? (
          <img
            src={event.coverUrl}
            alt={`Foto lokasi ${event.title}`}
            className="aspect-video w-full rounded-xl object-cover"
          />
        ) : null}

        {event.summary ? <p className="max-w-[720px] text-[15px] leading-relaxed">{event.summary}</p> : null}

        <section aria-labelledby="pengunggah">
          <h2 id="pengunggah" className="text-[18px] font-semibold">
            Yang melaporkan
          </h2>
          <ul className="mt-2 flex flex-wrap gap-2 text-[13px] text-muted">
            {event.uploaders.map((uploader) => (
              <li key={uploader.id} className="rounded-full border border-line px-3 py-1">
                {uploader.name} · {uploader.post_count} unggahan
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="penanggung-jawab">
          <h2 id="penanggung-jawab" className="text-[18px] font-semibold">
            Penanggung jawab penyaluran
          </h2>

          {detail.personInCharge.length === 0 ? (
            <p className="mt-2 rounded-xl border border-dashed border-line px-4 py-6 text-[13px] text-muted">
              Belum ada penanggung jawab. Berita ini masih mengumpulkan dukungan.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {detail.personInCharge.map((pic) => (
                <li key={pic.assignmentId} className="rounded-xl border border-line bg-surface p-4">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[15px] font-semibold">{pic.displayName}</span>
                    <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-semibold text-muted">
                      {LABEL_TEXT[pic.label] ?? pic.label}
                    </span>
                    {pic.verified ? (
                      <span className="text-[11px] font-semibold text-ok">Terverifikasi</span>
                    ) : null}
                  </div>
                  {pic.bio ? <p className="mt-1 text-[13px] text-muted">{pic.bio}</p> : null}
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4">
                    <div>
                      <dt className="text-muted">Terkumpul</dt>
                      <dd className="font-semibold">{formatRupiah(Number(pic.totalIn))}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Disalurkan</dt>
                      <dd className="font-semibold">{formatRupiah(Number(pic.totalOut))}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Donatur</dt>
                      <dd className="font-semibold">{pic.donationCount}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Posko</dt>
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
            Posko
          </h2>

          {detail.posko.length === 0 ? (
            <p className="mt-2 rounded-xl border border-dashed border-line px-4 py-6 text-[13px] text-muted">
              Kebutuhan posko terbuka setelah penanggung jawab menyelesaikan survei.
            </p>
          ) : (
            <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {detail.posko.map((posko) => (
                <li key={posko.id} className="rounded-xl border border-line bg-surface p-4">
                  <p className="text-[15px] font-semibold">{posko.name}</p>
                  <p className="text-[13px] text-muted">{posko.address ?? "Alamat belum diisi"}</p>
                  <p className="mt-2 text-[13px]">
                    <span className="font-semibold">{posko.headcount}</span> pengungsi
                    {posko.capacity ? ` · kapasitas ${posko.capacity}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-[13px] text-muted">
          <Link to="/" className="underline hover:text-ink">
            Kembali ke beranda
          </Link>
        </p>
      </article>
    </AppShell>
  );
}
