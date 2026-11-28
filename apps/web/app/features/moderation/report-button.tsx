import { useEffect, useRef, useState } from "react";

import { useT } from "~/i18n";
import { apiFetch } from "~/shared/api/client";
import { useToast } from "~/shared/ui/toast";

const REASONS = [
  ["hoax", "report.reasonHoax"],
  ["duplicate", "report.reasonDuplicate"],
  ["irrelevant", "report.reasonIrrelevant"],
  ["graphic", "report.reasonGraphic"],
  ["other", "report.reasonOther"],
] as const;

/**
 * Tombol + dialog lapor konten.
 *
 * Laporan tidak menghapus apa pun secara langsung: ia masuk antrean admin.
 * Karena itu teksnya menyebut hal itu, supaya pelapor tidak mengira konten
 * sudah hilang setelah menekan kirim.
 */
export function ReportContentButton({
  eventId,
  token,
}: {
  eventId: string;
  token: string | null;
}) {
  const { t } = useT();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof REASONS)[number][0]>("hoax");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!token) {
    return (
      <button
        type="button"
        onClick={() => toast.push(t("report.signIn"), "info")}
        className="text-[12px] font-semibold text-muted underline"
      >
        {t("report.title")}
      </button>
    );
  }

  if (reported) {
    return <span className="text-[12px] text-ok">{t("report.alreadyReported")}</span>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[12px] font-semibold text-muted underline hover:text-ink"
      >
        {t("report.title")}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-60 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
          onClick={() => setOpen(false)}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-title"
            onClick={(event) => event.stopPropagation()}
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError(null);
              try {
                await apiFetch(`/events/${eventId}/reports`, {
                  method: "POST",
                  token,
                  body: JSON.stringify({ reason, note: note.trim() || undefined }),
                });
                toast.push(t("report.sent"), "success");
                setReported(true);
                setOpen(false);
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : t("common.loadFailed"));
              } finally {
                setBusy(false);
              }
            }}
            className="w-full max-w-md rounded-t-xl border border-line bg-surface p-5 shadow-2xl sm:rounded-xl"
          >
            <h2 id="report-title" className="text-[18px] font-bold">
              {t("report.title")}
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">{t("report.intro")}</p>

            <fieldset className="mt-4 flex flex-col gap-1.5">
              <legend className="mb-1 text-[13px] font-semibold">{t("report.reason")}</legend>
              {REASONS.map(([value, key]) => (
                <label key={value} className="flex items-center gap-2 text-[13px]">
                  <input
                    type="radio"
                    name="reason"
                    value={value}
                    checked={reason === value}
                    onChange={() => setReason(value)}
                  />
                  {t(key)}
                </label>
              ))}
            </fieldset>

            <label className="mt-3 flex flex-col gap-1 text-[13px] font-semibold">
              {t("report.note")}
              <textarea
                rows={3}
                maxLength={500}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t("report.notePlaceholder")}
                className="rounded-lg border border-line bg-canvas px-3 py-2 text-[13px] font-normal"
              />
            </label>

            {error ? <p className="mt-2 text-[12px] text-danger">{error}</p> : null}

            <div className="mt-4 flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {t("report.submit")}
              </button>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-line px-4 py-2 text-[13px] font-semibold"
              >
                {t("donate.close")}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
