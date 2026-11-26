import type { Route } from "./+types/report-detail";

import { MarketingFooter, MarketingHeader } from "~/features/marketing/components/chrome";
import { ReportDetailPage, type ReportDetail } from "~/features/reports/report-detail-page";
import { apiFetch } from "~/shared/api/client";

export function meta({ data }: Route.MetaArgs) {
  const report = data?.report;
  return [
    {
      title: report
        ? `${report.body_text?.slice(0, 60) ?? "Laporan"} — Jangkau`
        : "Laporan — Jangkau",
    },
    {
      name: "description",
      content: "Rincian laporan kebutuhan pos pengungsian beserta status dukungan.",
    },
  ];
}

/**
 * Endpoint ini memakai auth opsional di API: pengunjung tanpa akun tetap
 * bisa membaca laporan yang sudah tervalidasi (dan itu yang di-SSR), lalu
 * komponen client mengambil ulang dengan token untuk tahu status dukungan.
 */
export async function loader({ params }: Route.LoaderArgs) {
  try {
    const report = await apiFetch<ReportDetail>(`/reports/${params.reportId}`);
    return { report };
  } catch {
    return { report: null };
  }
}

export default function ReportDetailRoute({ loaderData }: Route.ComponentProps) {
  const { report } = loaderData;

  return (
    <>
      <MarketingHeader />
      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
        {report ? (
          <ReportDetailPage initial={report} />
        ) : (
          <div className="rounded-xl border border-dashed border-line bg-surface/60 px-6 py-14 text-center">
            <h1 className="text-xl font-bold">Laporan tidak tersedia</h1>
            <p className="mt-2 text-[13px] text-muted">
              Laporan ini belum tervalidasi, atau tautannya salah.
            </p>
          </div>
        )}
      </main>
      <MarketingFooter />
    </>
  );
}
