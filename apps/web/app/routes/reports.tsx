import { useEffect, useState } from "react";

import { NEED_CATEGORY_LABELS, REPORT_STATUS_LABELS } from "@jangkau/shared";
import type { NeedCategory, ReportStatus } from "@jangkau/shared";

import { Link } from "react-router";

import { RequireRole } from "~/features/auth/guards";
import { AppShell } from "~/shared/layout/app-shell";
import { apiFetch, ApiError } from "~/shared/api/client";
import { useSession } from "~/features/auth/session";

type Report = {
  id: string;
  body_text: string | null;
  category: NeedCategory;
  severity: string;
  status: ReportStatus;
  upvote_count: number;
  captured_at: string;
  ai_confidence: number | null;
  media: Array<{ mimeType: string; url: string }>;
  hasVoted: boolean;
};

export default function Reports() {
  const { token, ready } = useSession();
  const [items, setItems] = useState<Report[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let active = true;

    apiFetch<{ items: Report[] }>("/reports?limit=50&mine=1", { token })
      .then((data) => {
        if (!active) return;
        setItems(data.items);
        setError(null);
      })
      .catch((cause) => {
        if (!active) return;
        setError(cause instanceof ApiError ? cause.message : "Gagal memuat laporan");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  return (
    <AppShell>
      <RequireRole allow={["resident", "organization", "admin"]}>
      <h1 className="text-2xl font-bold">Laporan</h1>
      <p className="mt-1 text-sm text-muted">
        Laporan yang kamu kirim, terbaru dulu menurut waktu kejadian di perangkat.
      </p>

      {loading && <p className="mt-6 text-sm text-muted">Memuat…</p>}

      {error && (
        <p className="mt-6 rounded-lg border border-line bg-surface p-3 text-sm text-warn">
          {error}
        </p>
      )}

      {!loading && !error && items.length === 0 && (
        <p className="mt-6 rounded-lg border border-line bg-surface p-3 text-sm text-muted">
          Belum ada laporan. Mulai dari halaman <strong>Lapor</strong>.
        </p>
      )}

      <ul className="mt-6 divide-y divide-line rounded-xl border border-line">
        {items.map((report) => (
          <li key={report.id} className="p-4 transition-colors hover:bg-surface/50">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-brand-soft px-2 py-0.5 font-semibold text-brand-strong">
                {NEED_CATEGORY_LABELS[report.category]}
              </span>
              <span className="rounded-full bg-surface px-2 py-0.5 font-medium text-muted">
                {REPORT_STATUS_LABELS[report.status]}
              </span>
              <span className="text-muted">
                {report.upvote_count} dukungan ·{" "}
                {new Date(report.captured_at).toLocaleString("id-ID")}
              </span>
              {report.ai_confidence !== null && (
                <span className="text-muted">
                  AI {Math.round(Number(report.ai_confidence) * 100)}%
                </span>
              )}
            </div>
            <Link to={`/laporan/${report.id}`} className="mt-2 block text-sm hover:text-brand">
              {report.body_text}
            </Link>
            {report.media.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {report.media.map((file, index) => (
                  <li key={`${report.id}-${index}`}>
                    <a href={file.url} target="_blank" rel="noreferrer">
                      <img
                        src={file.url}
                        alt={`Foto laporan ${index + 1}`}
                        loading="lazy"
                        className="h-20 w-20 rounded-lg border border-line object-cover"
                      />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      </RequireRole>
    </AppShell>
  );
}
