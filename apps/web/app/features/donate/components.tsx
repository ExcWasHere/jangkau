import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { useT } from "~/i18n";
import { formatRupiah } from "~/features/feed/api";
import type { Donation } from "./api";
import { remainingTime, simulatePaid } from "./api";

/**
 * Modal ucapan terima kasih, lalu penawaran masuk untuk donatur tamu.
 *
 * Urutannya disengaja (design.md §6): pengguna harus membaca ucapan terima
 * kasih lebih dulu, baru ditawari membuat akun. Menggabungkan keduanya membuat
 * momen itu terasa seperti formulir.
 */
export function ThankYouFlow({
  donation,
  picName,
  eventTitle,
  provider,
  hasSession,
  onClose,
}: {
  donation: Donation;
  picName: string;
  eventTitle: string;
  provider: "mock" | "midtrans";
  hasSession: boolean;
  onClose: () => void;
}) {
  const { t, locale } = useT();

  const [stage, setStage] = useState<"thanks" | "offer">("thanks");
  const [canDismiss, setCanDismiss] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Klik latar tidak langsung menutup: pengguna baru saja memindai QR dan bisa
  // tidak sengaja menyentuh layar.
  useEffect(() => {
    const timer = setTimeout(() => setCanDismiss(true), 1200);
    closeRef.current?.focus();
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && canDismiss) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [canDismiss, onClose]);

  return (
    <div
      className="fixed inset-0 z-60 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onClick={() => {
        if (canDismiss && stage === "thanks") {
          if (hasSession) onClose();
          else setStage("offer");
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="thanks-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-t-xl border border-line bg-surface p-6 shadow-2xl sm:rounded-xl"
      >
        {stage === "thanks" ? (
          <>
            <div className="flex flex-col items-center gap-2 text-center">
              <span
                aria-hidden
                className="flex h-14 w-14 items-center justify-center rounded-full bg-ok/15 text-[26px] text-ok"
              >
                ✓
              </span>
              <h2 id="thanks-title" className="text-[20px] font-bold">
                {t("donate.thanksTitle")}
              </h2>
              <p className="text-[14px] text-muted">
                {t("donate.thanksBody", {
                  amount: formatRupiah(donation.amount, locale),
                  pic: picName,
                })}
              </p>
              <p className="text-[12px] text-subtle">{eventTitle}</p>
            </div>

            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-lg border border-line bg-canvas p-3 text-[12px]">
              <dt className="text-muted">{t("donate.orderId")}</dt>
              <dd className="font-mono">{donation.orderId}</dd>
              <dt className="text-muted">{t("donate.method")}</dt>
              <dd className="uppercase">QRIS{provider === "mock" ? " · simulasi" : ""}</dd>
              <dt className="text-muted">{t("donate.status")}</dt>
              <dd className="text-ok">{t("donate.paid")}</dd>
            </dl>

            <div className="mt-5 flex flex-col gap-2">
              <Link
                to={`/bencana/${donation.eventId}`}
                className="rounded-lg bg-brand px-4 py-2.5 text-center text-[14px] font-semibold text-white"
              >
                {t("donate.seeDistribution")}
              </Link>
              <button
                ref={closeRef}
                type="button"
                disabled={!canDismiss}
                onClick={() => (hasSession ? onClose() : setStage("offer"))}
                className="rounded-lg border border-line px-4 py-2.5 text-[14px] font-semibold disabled:opacity-50"
              >
                {t("donate.close")}
              </button>
            </div>
          </>
        ) : stage === "offer" ? (
          <>
            <h2 id="thanks-title" className="text-[18px] font-bold">
              {t("donate.saveTitle")}
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{t("donate.saveBody")}</p>

            <div className="mt-4 flex flex-col gap-2">
              <Link
                to="/masuk"
                className="rounded-lg bg-brand px-4 py-2.5 text-center text-[14px] font-semibold text-white"
              >
                {t("donate.saveEmail")}
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-line px-4 py-2.5 text-[14px] font-semibold"
              >
                {t("donate.saveLater")}
              </button>
            </div>

            <p className="mt-3 text-[12px] text-subtle">{t("donate.saveNote")}</p>
          </>
        ) : null}
      </div>
    </div>
  );
}

/** Tombol simulasi lunas. Hanya dirender saat provider mock. */
export function SimulatePayButton({
  donation,
  onPaid,
}: {
  donation: Donation;
  onPaid: (donation: Donation) => void;
}) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="rounded-xl border border-warn/40 bg-warn/10 p-4">
      <p className="text-[12px] font-bold tracking-wide text-warn uppercase">
        {t("donate.simulateTitle")}
      </p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">{t("donate.simulateBody")}</p>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const result = await simulatePaid(donation.id, donation.claimToken);
            onPaid(result.donation);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : t("common.loadFailed"));
          } finally {
            setBusy(false);
          }
        }}
        className="mt-3 w-full rounded-lg bg-warn px-4 py-2.5 text-[14px] font-semibold text-black disabled:opacity-50"
      >
        {t("donate.simulateButton")}
      </button>
      {error ? <p className="mt-2 text-[12px] text-danger">{error}</p> : null}
    </div>
  );
}

/** QR + hitung mundur. QR dikirim server sebagai SVG agar tidak perlu pustaka klien. */
export function QrPanel({
  donation,
  onExpired,
}: {
  donation: Donation;
  onExpired: () => void;
}) {
  const { t } = useT();
  const [remaining, setRemaining] = useState(() => remainingTime(donation.expiresAt));

  useEffect(() => {
    const timer = setInterval(() => {
      const next = remainingTime(donation.expiresAt);
      setRemaining(next);
      if (!next) onExpired();
    }, 1000);
    return () => clearInterval(timer);
  }, [donation.expiresAt, onExpired]);

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface p-5">
      <p className="text-[15px] font-semibold">{t("donate.payTitle")}</p>
      <p className="text-center text-[12px] text-muted">{t("donate.payIntro")}</p>

      {donation.qrSvg ? (
        <div
          className="h-[240px] w-[240px] rounded-lg bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
          // SVG dibuat server dari payload QR; isinya bukan masukan pengguna.
          dangerouslySetInnerHTML={{ __html: donation.qrSvg }}
        />
      ) : null}

      {remaining ? (
        <p className="text-[13px] text-warn">{t("donate.expiresIn", { time: remaining })}</p>
      ) : (
        <p className="text-[13px] text-danger">{t("donate.expired")}</p>
      )}
    </div>
  );
}
