import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import type { Route } from "./+types/donasi-detail";

import { useAuthState } from "~/features/auth/session";
import { formatRupiah } from "~/features/feed/api";
import type { EventDetail } from "~/features/feed/api";
import type { Donation } from "~/features/donate/api";
import { fetchDonation, remainingTime, simulatePaid } from "~/features/donate/api";
import { QrPanel, SimulatePayButton, ThankYouFlow } from "~/features/donate/components";
import { rememberPendingClaim } from "~/features/donate/pending-claim";
import { translatorFromMatches, useT } from "~/i18n";
import { AppShell } from "~/shared/layout/app-shell";
import { Skeleton } from "~/shared/ui/skeleton";

export function meta({ matches }: Route.MetaArgs) {
  const t = translatorFromMatches(matches);
  return [{ title: `${t("donate.title")} — ${t("meta.eventTitleSuffix")}` }];
}

const POLL_MS = 2000;

export default function DonationPage() {
  const { t, locale } = useT();
  const { token, ready } = useAuthState();
  const navigate = useNavigate();
  const { id: donationId } = useParams();
  const [searchParams] = useSearchParams();
  // Donatur tamu membawa token klaim di URL; donatur login tidak perlu.
  const claimTokenFromUrl = searchParams.get("claim");

  const [donation, setDonation] = useState<Donation | null>(null);
  const [provider, setProvider] = useState<"mock" | "midtrans">("mock");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showThanks, setShowThanks] = useState(false);
  const [picName, setPicName] = useState("");
  const [eventTitle, setEventTitle] = useState("");

  const load = useCallback(async () => {
    if (!donationId) {
      setError(t("common.notFoundDetail"));
      setLoading(false);
      return;
    }

    try {
      const result = await fetchDonation(donationId, {
        token,
        claimToken: claimTokenFromUrl,
      });
      setDonation(result.donation);
      setProvider(result.provider);
      setError(null);
    } catch {
      setError(t("common.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [donationId, token, claimTokenFromUrl, t]);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [ready, load]);

  // Detail event memberi nama penanggung jawab dan judul untuk ucapan terima kasih.
  useEffect(() => {
    if (!donation) return;
    let active = true;

    fetch(
      `${import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8787/api/v1"}/events/${donation.eventId}`,
    )
      .then((response) => (response.ok ? (response.json() as Promise<EventDetail>) : null))
      .then((body) => {
        if (!active || !body) return;
        const pic = body.personInCharge.find(
          (item) => item.assignmentId === donation.picAssignmentId,
        );
        setPicName(pic?.displayName ?? "");
        setEventTitle(body.event.title);
      })
      .catch(() => {
        // Nama hanya untuk tampilan; kegagalan di sini tidak memblokir halaman.
      });

    return () => {
      active = false;
    };
  }, [donation]);

  // Polling status: QRIS dikonfirmasi di luar aplikasi, jadi status tidak
  // pernah datang sendiri tanpa permintaan berkala.
  useEffect(() => {
    if (!donation || donation.status !== "pending") return;

    const timer = setInterval(async () => {
      try {
        const result = await fetchDonation(donation.id, {
          token,
          claimToken: donation.claimToken,
        });
        setDonation(result.donation);
      } catch {
        // Jaringan putus sesaat bukan alasan menampilkan galat.
      }
    }, POLL_MS);

    return () => clearInterval(timer);
  }, [donation, token]);

  // Begitu lunas: simpan penanda klaim untuk donatur tamu, lalu tampilkan modal.
  useEffect(() => {
    if (!donation || donation.status !== "paid") return;

    if (!token) {
      rememberPendingClaim({ donationId: donation.id, claimToken: donation.claimToken });
    }
    setShowThanks(true);
  }, [donation, token]);

  if (loading) {
    return (
      <AppShell>
        <div className="mx-auto flex w-full max-w-[480px] flex-col gap-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppShell>
    );
  }

  if (error || !donation) {
    return (
      <AppShell>
        <p className="rounded-xl border border-line bg-surface px-5 py-6 text-[14px]">
          {error ?? t("common.notFoundDetail")}{" "}
          <Link to="/" className="font-semibold text-brand-text underline">
            {t("common.backToHome")}
          </Link>
        </p>
      </AppShell>
    );
  }

  const isPaid = donation.status === "paid";

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[480px] flex-col gap-4">
        <header className="flex flex-col gap-1">
          <h1 className="text-[24px] font-bold">{t("donate.title")}</h1>
          <p className="text-[13px] text-muted">
            {formatRupiah(donation.amount, locale)}
            {picName ? ` · ${picName}` : ""}
          </p>
        </header>

        {isPaid ? (
          <div className="rounded-xl border border-ok/40 bg-ok/10 p-5">
            <p className="text-[15px] font-semibold text-ok">{t("donate.paid")}</p>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12px]">
              <dt className="text-muted">{t("donate.orderId")}</dt>
              <dd className="font-mono">{donation.orderId}</dd>
              <dt className="text-muted">{t("donate.status")}</dt>
              <dd className="text-ok">{t("donate.paid")}</dd>
            </dl>
          </div>
        ) : remainingTime(donation.expiresAt) === null ? (
          <div className="rounded-xl border border-danger/40 bg-danger/10 p-5">
            <p className="text-[14px] font-semibold text-danger">{t("donate.expired")}</p>
            <button
              type="button"
              onClick={() => navigate(`/bencana/${donation.eventId}/donasi`)}
              className="mt-3 rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white"
            >
              {t("donate.newQr")}
            </button>
          </div>
        ) : (
          <QrPanel donation={donation} onExpired={() => void load()} />
        )}

        {!isPaid && provider === "mock" ? (
          <SimulatePayButton donation={donation} onPaid={setDonation} />
        ) : null}

        <p className="text-[13px] text-muted">
          <Link to={`/bencana/${donation.eventId}`} className="underline hover:text-ink">
            {t("donate.seeDistribution")}
          </Link>
        </p>
      </div>

      {isPaid && showThanks ? (
        <ThankYouFlow
          donation={donation}
          picName={picName || "—"}
          eventTitle={eventTitle}
          provider={provider}
          hasSession={Boolean(token)}
          onClose={() => {
            setShowThanks(false);
            if (!token) navigate(`/bencana/${donation.eventId}`);
          }}
        />
      ) : null}
    </AppShell>
  );
}
