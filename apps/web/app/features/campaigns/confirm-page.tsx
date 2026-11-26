import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";

import { CAMPAIGN_STATUS_LABELS } from "@jangkau/shared";
import type { CampaignStatus } from "@jangkau/shared";

import { AppShell } from "~/shared/layout/app-shell";
import { apiFetch, ApiError } from "~/shared/api/client";
import { useMe } from "~/features/auth/use-me";
import { Badge, Card, EmptyState, buttonPrimary, buttonSecondary } from "~/shared/ui/primitives";

type Campaign = {
  id: string;
  report_id: string;
  title: string;
  summary: string | null;
  target_amount: number;
  raised_amount: number;
  status: CampaignStatus;
  created_at: string;
};

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

/**
 * Konfirmasi RAB oleh pelapor.
 *
 * Ini satu-satunya titik yang mengubah kampanye menjadi `active`. Donasi
 * tidak bisa masuk sebelum pelapor menyetujui rincian biaya.
 */
export function ConfirmRabPage() {
  const { token } = useMe();
  const [items, setItems] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch<{ items: Campaign[] }>(
        "/campaigns?scope=awaiting",
        { token },
      );
      setItems(data.items);
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Gagal memuat daftar");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: string, accept: boolean) {
    if (!token) return;
    setBusy(id);
    setError(null);
    try {
      await apiFetch(`/campaigns/${id}/confirm`, {
        method: "POST",
        token,
        body: JSON.stringify({ accept }),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Gagal menyimpan keputusan");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Konfirmasi RAB</h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            Organisasi menyusun Rencana Anggaran Biaya dari laporanmu. Periksa rinciannya; donasi
            baru dibuka setelah kamu setujui.
          </p>
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-danger">{error}</p>}

        {loading ? (
          <p className="text-[13px] text-muted">Memuat…</p>
        ) : items.length === 0 ? (
          <EmptyState
            title="Tidak ada RAB yang menunggu konfirmasi"
            body="Kamu akan melihat RAB di sini setelah organisasi mengambil laporanmu."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((campaign) => (
              <li key={campaign.id}>
                <Card className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-[15px] font-semibold">{campaign.title}</h2>
                      {campaign.summary && (
                        <p className="mt-1 text-[12px] leading-relaxed text-muted">
                          {campaign.summary}
                        </p>
                      )}
                      <p className="mt-2 text-[12px] tabular-nums">
                        Total diajukan{" "}
                        <strong>{rupiah.format(Number(campaign.target_amount))}</strong>
                      </p>
                    </div>
                    <Badge tone="warn">{CAMPAIGN_STATUS_LABELS[campaign.status]}</Badge>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                    <Link to={`/kampanye/${campaign.id}`} className={buttonSecondary}>
                      Lihat rincian
                    </Link>
                    <button
                      type="button"
                      disabled={busy === campaign.id}
                      onClick={() => decide(campaign.id, true)}
                      className={buttonPrimary}
                    >
                      Setujui RAB
                    </button>
                    <button
                      type="button"
                      disabled={busy === campaign.id}
                      onClick={() => decide(campaign.id, false)}
                      className={buttonSecondary}
                    >
                      Tolak
                    </button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
