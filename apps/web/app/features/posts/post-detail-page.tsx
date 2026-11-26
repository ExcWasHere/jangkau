import { Link } from "react-router";

import {
  CAMPAIGN_STATUS_LABELS,
  NEED_CATEGORY_LABELS,
  REPORT_STATUS_LABELS,
  SEVERITY_LABELS,
} from "@jangkau/shared";
import type {
  CampaignStatus,
  NeedCategory,
  ReportStatus,
  SeverityLevel,
} from "@jangkau/shared";

import { Badge, Card, EmptyState, SectionTitle } from "~/shared/ui/primitives";

export type PublicPost = {
  id: string;
  name: string;
  address: string | null;
  regency: string | null;
  province: string | null;
  lat: number;
  lng: number;
  radius_m: number;
  headcount: number;
  capacity: number | null;
  status: string;
};

export type StockRow = {
  id: string;
  name: string;
  category: NeedCategory;
  unit: string;
  quantity: number;
  low_stock_threshold: number;
  is_low: boolean;
};

export type CampaignRow = {
  id: string;
  report_id: string;
  title: string;
  summary: string | null;
  target_amount: number;
  raised_amount: number;
  status: CampaignStatus;
};

export type ReportRow = {
  id: string;
  body_text: string | null;
  category: NeedCategory;
  severity: SeverityLevel;
  status: ReportStatus;
  upvote_count: number;
  captured_at: string;
};

export type PostDetail = {
  post: PublicPost;
  stock: StockRow[];
  campaigns: CampaignRow[];
  reports: ReportRow[];
};

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const STATUS_TONE = {
  pending: "warn",
  validated: "brand",
  eligible: "ok",
  taken_up: "ok",
  rejected: "danger",
  merged: "neutral",
} as const;

/**
 * Skema radius pos. Bukan peta jalan: menggambarkan satu hal yang memang
 * dipakai sistem — batas jarak laporan yang diterima — tanpa mengunduh
 * tile atau menambah dependensi peta.
 */
function RadiusSketch({ radiusM }: { radiusM: number }) {
  const size = 200;
  const center = size / 2;
  const r = center - 12;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="h-[200px] w-[200px]"
      role="img"
      aria-label={`Radius validasi ${radiusM} meter dari titik pos`}
    >
      <circle cx={center} cy={center} r={r} fill="var(--color-brand-soft)" opacity="0.55" />
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke="var(--color-brand)"
        strokeWidth="1.5"
        strokeDasharray="4 4"
      />
      <line
        x1={center}
        y1={center}
        x2={center + r}
        y2={center}
        stroke="var(--color-brand)"
        strokeWidth="1"
      />
      <circle cx={center} cy={center} r="4.5" fill="var(--color-brand)" />
      <text
        x={center + r / 2}
        y={center - 6}
        textAnchor="middle"
        fontSize="9"
        fill="var(--color-brand-strong)"
        fontWeight="600"
      >
        {radiusM} m
      </text>
      <text
        x={center}
        y={size - 2}
        textAnchor="middle"
        fontSize="8"
        fill="var(--color-muted)"
      >
        laporan di luar batas ditolak
      </text>
    </svg>
  );
}

export function PostDetailPage({ data }: { data: PostDetail }) {
  const { post, stock, campaigns, reports } = data;
  const occupancy =
    post.capacity && post.capacity > 0
      ? Math.min(100, Math.round((post.headcount / post.capacity) * 100))
      : null;
  const lowStock = stock.filter((item) => item.is_low);
  const osmLink = `https://www.openstreetmap.org/?mlat=${post.lat}&mlon=${post.lng}#map=16/${post.lat}/${post.lng}`;

  return (
    <div className="flex flex-col gap-10">
      <header>
        <Link to="/" className="text-[12px] font-medium text-muted hover:text-brand">
          ← Beranda
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{post.name}</h1>
        <p className="mt-1 text-[13px] text-muted">
          {[post.address, post.regency, post.province].filter(Boolean).join(" · ")}
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
            <div>
              <dt className="text-[11px] font-medium text-muted">Pengungsi</dt>
              <dd className="mt-0.5 text-xl font-bold tabular-nums">{post.headcount}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium text-muted">Kapasitas</dt>
              <dd className="mt-0.5 text-xl font-bold tabular-nums">{post.capacity ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium text-muted">Laporan terbuka</dt>
              <dd className="mt-0.5 text-xl font-bold tabular-nums">{reports.length}</dd>
            </div>
          </dl>

          {occupancy !== null && (
            <div className="mt-5">
              <div className="flex items-center justify-between text-[11px] text-muted">
                <span>Keterisian</span>
                <span className="tabular-nums">{occupancy}%</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface">
                <div
                  className={`h-full rounded-full ${occupancy > 90 ? "bg-danger" : "bg-brand"}`}
                  style={{ width: `${occupancy}%` }}
                />
              </div>
            </div>
          )}

          {lowStock.length > 0 && (
            <p className="mt-5 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-warn">
              {lowStock.length} item di bawah ambang aman:{" "}
              {lowStock.map((item) => item.name).join(", ")}.
            </p>
          )}
        </Card>

        <Card className="flex items-center gap-4 p-5">
          <RadiusSketch radiusM={post.radius_m} />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-brand uppercase">
              Radius validasi
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              Laporan hanya diterima bila titik perangkat berada di dalam {post.radius_m} m dari
              pos ini.
            </p>
            <p className="mt-2 font-mono text-[11px] text-muted tabular-nums">
              {post.lat.toFixed(5)}, {post.lng.toFixed(5)}
            </p>
            <a
              href={osmLink}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-[12px] font-semibold text-brand hover:underline"
            >
              Buka di OpenStreetMap
            </a>
          </div>
        </Card>
      </section>

      <section>
        <SectionTitle
          eyebrow="Stok"
          title="Persediaan pos"
          description="Setiap perubahan tercatat dengan alasan dan pelakunya. Item di bawah ambang aman ditandai."
        />
        <div className="mt-4">
          {stock.length === 0 ? (
            <EmptyState title="Belum ada catatan stok" body="Stok muncul setelah ada barang masuk." />
          ) : (
            <div className="overflow-hidden rounded-xl border border-line">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-surface text-[11px] tracking-wide text-muted uppercase">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Item</th>
                    <th className="px-4 py-2.5 font-semibold">Kategori</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Jumlah</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Ambang</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-white">
                  {stock.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-2.5 font-medium">
                        <span className="flex items-center gap-2">
                          {item.name}
                          {item.is_low && <Badge tone="warn">Menipis</Badge>}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted">
                        {NEED_CATEGORY_LABELS[item.category]}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {Number(item.quantity).toLocaleString("id-ID")} {item.unit}
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted tabular-nums">
                        {Number(item.low_stock_threshold).toLocaleString("id-ID")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section>
        <SectionTitle
          eyebrow="Kebutuhan"
          title="Laporan tervalidasi"
          description="Laporan yang sudah lolos radius dan siap mendapat dukungan."
        />
        <div className="mt-4">
          {reports.length === 0 ? (
            <EmptyState
              title="Belum ada laporan tervalidasi"
              body="Laporan baru muncul di sini setelah lolos pemeriksaan radius pos."
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {reports.map((report) => (
                <li key={report.id}>
                  <Link
                    to={`/laporan/${report.id}`}
                    className="block h-full rounded-xl border border-line bg-white p-4 transition-colors hover:border-brand-line"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="brand">{NEED_CATEGORY_LABELS[report.category]}</Badge>
                      <Badge tone={report.severity === "critical" ? "danger" : "neutral"}>
                        {SEVERITY_LABELS[report.severity]}
                      </Badge>
                      <Badge tone={STATUS_TONE[report.status]}>
                        {REPORT_STATUS_LABELS[report.status]}
                      </Badge>
                    </div>
                    <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed">
                      {report.body_text}
                    </p>
                    <p className="mt-2 text-[11px] text-muted">
                      {report.upvote_count} dukungan ·{" "}
                      {new Date(report.captured_at).toLocaleDateString("id-ID")}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <SectionTitle eyebrow="Donasi" title="Kampanye di pos ini" />
        <div className="mt-4">
          {campaigns.length === 0 ? (
            <EmptyState
              title="Belum ada kampanye"
              body="Kampanye dibuka organisasi terverifikasi setelah RAB dikonfirmasi pelapor."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {campaigns.map((campaign) => {
                const progress = Math.min(
                  100,
                  Math.round((Number(campaign.raised_amount) / Number(campaign.target_amount)) * 100),
                );
                return (
                  <li key={campaign.id}>
                    <Card className="p-5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="text-[14px] font-semibold">{campaign.title}</h3>
                        <Badge tone={campaign.status === "active" ? "ok" : "neutral"}>
                          {CAMPAIGN_STATUS_LABELS[campaign.status]}
                        </Badge>
                      </div>
                      {campaign.summary && (
                        <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                          {campaign.summary}
                        </p>
                      )}
                      <div className="mt-4">
                        <div className="flex items-center justify-between text-[12px]">
                          <span className="font-semibold tabular-nums">
                            {rupiah.format(Number(campaign.raised_amount))}
                          </span>
                          <span className="text-muted tabular-nums">
                            dari {rupiah.format(Number(campaign.target_amount))}
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface">
                          <div
                            className="h-full rounded-full bg-brand"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
