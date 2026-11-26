import { useCallback, useEffect, useState } from "react";

import { apiFetch, ApiError } from "~/shared/api/client";
import { useMe } from "~/features/auth/use-me";
import { Badge, Card, buttonSecondary } from "~/shared/ui/primitives";

type Candidate = {
  reportId: string;
  similarity: number;
  duplicate: boolean | null;
  confidence: number | null;
  reason: string | null;
};

/**
 * Kandidat duplikat untuk satu laporan.
 *
 * Dua tahap, dan keduanya terlihat oleh pengguna: pencarian kandidat
 * memakai trigram (murah, di database), lalu setiap kandidat dinilai
 * model bahasa. Verdict model adalah saran — tombol gabung tetap milik
 * manusia, dan alasannya ditampilkan supaya keputusan bisa diperiksa.
 */
export function MergeCandidates({ reportId }: { reportId: string }) {
  const { token, me } = useMe();
  const [items, setItems] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const allowed = me?.role === "admin" || Boolean(me?.organizationId);

  const load = useCallback(async () => {
    if (!token || !allowed) return;
    try {
      const data = await apiFetch<{ items: Candidate[] }>(
        `/reports/${reportId}/merge-candidates`,
        { token },
      );
      setItems(data.items);
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Gagal memuat kandidat");
      setItems([]);
    }
  }, [allowed, reportId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function merge(intoReportId: string) {
    if (!token) return;
    setBusy(intoReportId);
    setNotice(null);
    try {
      await apiFetch(`/reports/${reportId}/merge`, {
        method: "POST",
        token,
        body: JSON.stringify({ intoReportId }),
      });
      setNotice("Laporan digabung. Dukungan dihitung pada laporan tujuan.");
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Gagal menggabungkan");
    } finally {
      setBusy(null);
    }
  }

  if (!allowed) return null;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold">Kandidat duplikat</h2>
        <Badge tone="neutral">AI menyarankan, kamu memutuskan</Badge>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-muted">
        Kandidat disaring dengan kemiripan teks, lalu dinilai model bahasa. Menggabungkan laporan
        memindahkan dukungan ke laporan tujuan dan menandai laporan ini sebagai digabung.
      </p>

      {notice && (
        <p className="mt-3 rounded-lg border border-brand-line bg-brand-soft px-3 py-2 text-[12px] text-brand-strong">
          {notice}
        </p>
      )}
      {error && <p className="mt-3 text-[12px] text-danger">{error}</p>}

      {items === null && <p className="mt-3 text-[12px] text-muted">Memeriksa…</p>}

      {items !== null && items.length === 0 && !error && (
        <p className="mt-3 text-[12px] text-muted">
          Tidak ada laporan lain di pos ini yang cukup mirip.
        </p>
      )}

      {items !== null && items.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((candidate) => (
            <li
              key={candidate.reportId}
              className="rounded-lg border border-line px-3 py-2.5 text-[12px]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-1.5">
                  <Badge
                    tone={
                      candidate.duplicate === true
                        ? "danger"
                        : candidate.duplicate === false
                          ? "ok"
                          : "neutral"
                    }
                  >
                    {candidate.duplicate === true
                      ? "kemungkinan duplikat"
                      : candidate.duplicate === false
                        ? "bukan duplikat"
                        : "belum dinilai"}
                  </Badge>
                  <span className="text-muted tabular-nums">
                    kemiripan {Math.round(candidate.similarity * 100)}%
                  </span>
                  {candidate.confidence !== null && (
                    <span className="text-muted tabular-nums">
                      keyakinan {Math.round(candidate.confidence * 100)}%
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => merge(candidate.reportId)}
                  className={buttonSecondary}
                >
                  {busy === candidate.reportId ? "Menggabung…" : "Gabungkan"}
                </button>
              </div>
              {candidate.reason && (
                <p className="mt-1.5 text-muted italic">“{candidate.reason}”</p>
              )}
              <a
                href={`/laporan/${candidate.reportId}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 inline-block font-semibold text-brand hover:underline"
              >
                Buka laporan pembanding
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
