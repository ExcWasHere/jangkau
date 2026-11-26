import { Link, useNavigate } from "react-router";

import {
  NEED_CATEGORY_LABELS,
  REPORT_STATUS_LABELS,
  SEVERITY_LABELS,
} from "@jangkau/shared";
import type { NeedCategory, ReportStatus, SeverityLevel } from "@jangkau/shared";
import { useEffect, useState } from "react";

import { useAuthState } from "~/features/auth/session";
import { apiFetch, ApiError } from "~/shared/api/client";
import { Badge, Card, buttonPrimary, buttonSecondary } from "~/shared/ui/primitives";

export type ReportDetail = {
  id: string;
  post_id: string;
  body_text: string | null;
  transcript: string | null;
  category: NeedCategory;
  ai_category: NeedCategory | null;
  ai_confidence: number | null;
  severity: SeverityLevel;
  status: ReportStatus;
  upvote_count: number;
  captured_at: string;
  reject_reason: string | null;
  media: Array<{ mimeType: string; url: string }>;
  hasVoted: boolean;
  upvoteThreshold: number;
  post: { id: string; name: string; regency: string | null; radius_m: number } | null;
};

const STATUS_TONE = {
  pending: "warn",
  validated: "brand",
  eligible: "ok",
  taken_up: "ok",
  rejected: "danger",
  merged: "neutral",
} as const;

export function ReportDetailPage({ initial }: { initial: ReportDetail }) {
  // Halaman publik: jangan paksa pindah ke /masuk saat belum login.
  const { token, ready } = useAuthState();
  const navigate = useNavigate();
  const [report, setReport] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Setelah sesi terbaca, ambil ulang agar status dukungan pemanggil akurat.
  useEffect(() => {
    if (!token) return;
    let active = true;

    apiFetch<ReportDetail>(`/reports/${initial.id}`, { token })
      .then((data) => {
        if (active) setReport(data);
      })
      .catch(() => {
        /* biarkan data awal tampil */
      });

    return () => {
      active = false;
    };
  }, [initial.id, token]);

  async function toggleVote() {
    if (!token) {
      navigate("/masuk", { replace: true });
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const method = report.hasVoted ? "DELETE" : "POST";
      const result = await apiFetch<{ upvote_count: number; hasVoted: boolean; status: ReportStatus }>(
        `/reports/${report.id}/votes`,
        { method, token },
      );
      setReport((current) => ({ ...current, ...result }));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Gagal memperbarui dukungan");
    } finally {
      setBusy(false);
    }
  }

  const progress = Math.min(
    100,
    Math.round((report.upvote_count / Math.max(1, report.upvoteThreshold)) * 100),
  );
  const remaining = Math.max(0, report.upvoteThreshold - report.upvote_count);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          to={report.post ? `/pos/${report.post.id}` : "/"}
          className="text-[12px] font-medium text-muted hover:text-brand"
        >
          ← {report.post ? report.post.name : "Beranda"}
        </Link>
      </div>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="brand">{NEED_CATEGORY_LABELS[report.category]}</Badge>
          <Badge tone={report.severity === "critical" ? "danger" : "neutral"}>
            {SEVERITY_LABELS[report.severity]}
          </Badge>
          <Badge tone={STATUS_TONE[report.status]}>
            {REPORT_STATUS_LABELS[report.status]}
          </Badge>
          {report.ai_confidence !== null && (
            <span className="text-[11px] text-muted">
              AI {Math.round(Number(report.ai_confidence) * 100)}%
            </span>
          )}
        </div>

        <h1 className="mt-3 text-xl leading-snug font-bold tracking-tight sm:text-2xl">
          {report.body_text ?? report.transcript}
        </h1>

        <p className="mt-2 text-[12px] text-muted">
          Dilaporkan {new Date(report.captured_at).toLocaleString("id-ID")}
          {report.post?.regency ? ` · ${report.post.regency}` : ""}
        </p>

        {report.media.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {report.media.map((file, index) => (
              <li key={index}>
                <a href={file.url} target="_blank" rel="noreferrer">
                  <img
                    src={file.url}
                    alt={`Foto laporan ${index + 1}`}
                    loading="lazy"
                    className="h-28 w-28 rounded-lg border border-line object-cover"
                  />
                </a>
              </li>
            ))}
          </ul>
        )}

        {report.reject_reason && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-danger">
            Ditolak: {report.reject_reason}
          </p>
        )}

        <div className="mt-6 border-t border-line pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold tabular-nums">
                {report.upvote_count} dari {report.upvoteThreshold} dukungan
              </p>
              <p className="mt-0.5 text-[11px] text-muted">
                {report.status === "eligible" || report.status === "taken_up"
                  ? "Ambang terpenuhi — laporan bisa diambil organisasi."
                  : `Butuh ${remaining} dukungan lagi agar bisa diambil organisasi.`}
              </p>
            </div>
            <button
              type="button"
              onClick={toggleVote}
              disabled={busy || !ready || report.status === "merged" || report.status === "rejected"}
              className={report.hasVoted ? buttonSecondary : buttonPrimary}
            >
              {busy ? "Memproses…" : report.hasVoted ? "Batalkan dukungan" : "Beri dukungan"}
            </button>
          </div>

          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface">
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${
                report.status === "eligible" || report.status === "taken_up" ? "bg-ok" : "bg-brand"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>

          {!token && ready && (
            <p className="mt-3 text-[11px] text-muted">
              <Link to="/masuk" className="font-semibold text-brand hover:underline">
                Masuk
              </Link>{" "}
              untuk memberi dukungan. Satu akun satu dukungan per laporan.
            </p>
          )}

          {error && <p className="mt-3 text-[12px] text-danger">{error}</p>}
        </div>
      </Card>
    </div>
  );
}
