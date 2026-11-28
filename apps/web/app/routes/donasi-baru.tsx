import { useEffect, useState } from "react";
import { data, Link, useLoaderData, useNavigate, useSearchParams } from "react-router";
import type { Route } from "./+types/donasi-baru";

import { useAuthState } from "~/features/auth/session";
import { formatRupiah, type EventDetail } from "~/features/feed/api";
import { createDonation } from "~/features/donate/api";
import { translatorFromMatches, useT } from "~/i18n";
import { ApiError } from "~/shared/api/client";
import { AppShell } from "~/shared/layout/app-shell";

export function meta({ matches }: Route.MetaArgs) {
  const t = translatorFromMatches(matches);
  return [{ title: `${t("donate.title")} — ${t("meta.eventTitleSuffix")}` }];
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

const PRESETS = [25_000, 50_000, 100_000, 250_000, 500_000];

export default function NewDonationPage() {
  const { detail } = useLoaderData<typeof loader>();
  const { t, locale } = useT();
  const { token, ready } = useAuthState();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const pics = detail.personInCharge;
  const [picId, setPicId] = useState(searchParams.get("pic") ?? pics[0]?.assignmentId ?? "");
  const [amount, setAmount] = useState(50_000);
  const [donorName, setDonorName] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [guestEmail, setGuestEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!picId && pics[0]) setPicId(pics[0].assignmentId);
  }, [picId, pics]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!picId) return;

    setBusy(true);
    setError(null);
    try {
      const result = await createDonation({
        picAssignmentId: picId,
        amount,
        donorName: donorName.trim() || undefined,
        anonymous,
        guestEmail: guestEmail.trim() || undefined,
        token,
      });
      // `claim` wajib ikut di URL: halaman donasi memakainya untuk membaca
      // status donasi tamu. Tanpa itu, donatur tanpa akun langsung ditolak 403
      // setelah redirect.
      navigate(`/donasi/${result.donation.id}?claim=${encodeURIComponent(result.donation.claimToken)}`, {
        replace: true,
      });
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t("common.loadFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (pics.length === 0) {
    return (
      <AppShell>
        <div className="mx-auto flex w-full max-w-[520px] flex-col gap-3">
          <h1 className="text-[24px] font-bold">{t("donate.title")}</h1>
          <p className="rounded-xl border border-dashed border-line px-4 py-6 text-[13px] text-muted">
            {t("donate.noPicYet")}
          </p>
          <Link to={`/bencana/${detail.event.id}`} className="text-[13px] underline">
            {t("common.backToHome")}
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <form onSubmit={onSubmit} className="mx-auto flex w-full max-w-[520px] flex-col gap-5">
        <header className="flex flex-col gap-1">
          <h1 className="text-[24px] font-bold">{t("donate.title")}</h1>
          <p className="text-[13px] text-muted">{detail.event.title}</p>
          <p className="text-[13px] leading-relaxed text-muted">{t("donate.intro")}</p>
        </header>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-[13px] font-semibold">{t("donate.choosePic")}</legend>
          {pics.map((pic) => (
            <label
              key={pic.assignmentId}
              className={`flex cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2.5 ${
                picId === pic.assignmentId ? "border-brand bg-brand-soft" : "border-line bg-surface"
              }`}
            >
              <input
                type="radio"
                name="pic"
                value={pic.assignmentId}
                checked={picId === pic.assignmentId}
                onChange={() => setPicId(pic.assignmentId)}
                className="sr-only"
              />
              <span className="flex flex-wrap items-baseline gap-2 text-[14px] font-semibold">
                {pic.displayName}
                {pic.verified ? (
                  <span className="text-[11px] font-semibold text-ok">{t("event.verified")}</span>
                ) : null}
              </span>
              <span className="text-[12px] text-muted">
                {t("event.raised")}: {formatRupiah(Number(pic.totalIn), locale)} ·{" "}
                {t("event.donorCount")}: {pic.donationCount}
              </span>
            </label>
          ))}
        </fieldset>

        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-[13px] font-semibold">
            {t("donate.amount")}
            <input
              type="number"
              min={1000}
              step={1000}
              required
              value={amount}
              onChange={(event) => setAmount(Number(event.target.value))}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-[15px] font-normal"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAmount(preset)}
                className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${
                  amount === preset ? "border-brand bg-brand-soft text-brand-text" : "border-line"
                }`}
              >
                {formatRupiah(preset, locale)}
              </button>
            ))}
          </div>
          <span className="text-[12px] text-muted">{t("donate.amountHint")}</span>
        </div>

        <label className="flex flex-col gap-1 text-[13px] font-semibold">
          {t("donate.donorName")}
          <input
            value={donorName}
            onChange={(event) => setDonorName(event.target.value)}
            placeholder={t("donate.donorNamePlaceholder")}
            disabled={anonymous}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-[14px] font-normal disabled:opacity-50"
          />
        </label>

        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={anonymous}
            onChange={(event) => setAnonymous(event.target.checked)}
          />
          {t("donate.anonymous")}
        </label>

        {ready && !token ? (
          <label className="flex flex-col gap-1 text-[13px] font-semibold">
            {t("donate.guestEmail")}
            <input
              type="email"
              value={guestEmail}
              onChange={(event) => setGuestEmail(event.target.value)}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-[14px] font-normal"
            />
            <span className="text-[12px] font-normal text-muted">{t("donate.guestEmailHint")}</span>
          </label>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-[13px] text-danger">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy || !picId}
          className="rounded-lg bg-brand px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-50"
        >
          {busy ? t("donate.creating") : t("donate.submit")}
        </button>
      </form>
    </AppShell>
  );
}
