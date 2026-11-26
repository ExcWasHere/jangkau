import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";

import { CAMPAIGN_STATUS_LABELS, NEED_CATEGORY_LABELS } from "@jangkau/shared";
import type { CampaignStatus, NeedCategory } from "@jangkau/shared";

import { AppShell } from "~/shared/layout/app-shell";
import { apiFetch, ApiError } from "~/shared/api/client";
import { useMe } from "~/features/auth/use-me";
import {
  Badge,
  Card,
  EmptyState,
  Field,
  buttonPrimary,
  buttonSecondary,
  inputClass,
} from "~/shared/ui/primitives";

type Campaign = {
  id: string;
  report_id: string;
  organization_id: string;
  title: string;
  summary: string | null;
  target_amount: number;
  raised_amount: number;
  status: CampaignStatus;
  reporter_confirmed_at: string | null;
  created_at: string;
};

type Tranche = {
  id: string;
  seq: number;
  amount: number;
  status: "planned" | "receipts_submitted" | "goods_confirmed" | "released" | "disputed";
  purpose: string | null;
  released_at: string | null;
  receipts: Array<{ id: string; vendor: string | null; amount: number | null; url: string }>;
};

type BudgetItem = {
  id: string;
  name: string;
  category: NeedCategory;
  quantity: number;
  unit: string;
  unit_cost: number;
  subtotal: number;
};

type Donation = {
  id: string;
  amount: number;
  status: string;
  donor_name: string | null;
  created_at: string;
};

type CampaignDetail = {
  campaign: Campaign;
  organization: { id: string; name: string } | null;
  items: BudgetItem[];
  donations: Donation[];
  tranches: Tranche[];
};

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const TRANCHE_LABEL: Record<Tranche["status"], string> = {
  planned: "Direncanakan",
  receipts_submitted: "Bukti diunggah",
  goods_confirmed: "Barang diterima",
  released: "Dana dicairkan",
  disputed: "Sengketa",
};

export function CampaignDetailPage({ campaignId }: { campaignId: string }) {
  const { token, me } = useMe();
  const [data, setData] = useState<CampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("100000");
  const [trancheAmount, setTrancheAmount] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const detail = await apiFetch<CampaignDetail>(`/campaigns/${campaignId}`, { token });
      setData(detail);
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Gagal memuat kampanye");
    } finally {
      setLoading(false);
    }
  }, [campaignId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(path: string, body?: unknown, successMessage?: string) {
    if (!token) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch(path, {
        method: "POST",
        token,
        body: body ? JSON.stringify(body) : undefined,
      });
      await load();
      if (successMessage) setNotice(successMessage);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Aksi gagal");
    } finally {
      setBusy(false);
    }
  }

  async function releaseTranche(trancheId: string) {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/tranches/${trancheId}/release`, { method: "POST", token });
      await load();
      setNotice("Dana tahap ini dicairkan (simulasi, tanpa transfer nyata).");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Gagal mencairkan");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <p className="text-[13px] text-muted">Memuat…</p>
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell>
        <EmptyState title="Kampanye tidak ditemukan" body={error ?? undefined} />
      </AppShell>
    );
  }

  const { campaign, organization, items, donations, tranches } = data;
  const isOrg = Boolean(me?.organizationId && me.organizationId === campaign.organization_id);
  const isAdmin = me?.role === "admin";
  const progress = Math.min(
    100,
    Math.round((Number(campaign.raised_amount) / Number(campaign.target_amount)) * 100),
  );
  const released = tranches
    .filter((tranche) => tranche.status === "released")
    .reduce((sum, tranche) => sum + Number(tranche.amount), 0);

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div>
          <Link to="/laporan" className="text-[12px] font-medium text-muted hover:text-brand">
            ← Kembali
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={campaign.status === "active" ? "ok" : "neutral"}>
              {CAMPAIGN_STATUS_LABELS[campaign.status]}
            </Badge>
            <Badge tone="neutral">Mode simulasi</Badge>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">{campaign.title}</h1>
          <p className="mt-1 text-[13px] text-muted">{organization?.name ?? "Organisasi"}</p>
          {campaign.summary && (
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
              {campaign.summary}
            </p>
          )}
        </div>

        {notice && (
          <p className="rounded-lg border border-brand-line bg-brand-soft px-4 py-3 text-[13px] text-brand-strong">
            {notice}
          </p>
        )}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-danger">{error}</p>}

        <Card className="p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] text-muted">Terkumpul</p>
              <p className="text-2xl font-bold tabular-nums">
                {rupiah.format(Number(campaign.raised_amount))}
              </p>
            </div>
            <p className="text-[12px] text-muted tabular-nums">
              target {rupiah.format(Number(campaign.target_amount))} · {progress}%
            </p>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
            <div className="h-full rounded-full bg-brand" style={{ width: `${progress}%` }} />
          </div>

          {campaign.reporter_confirmed_at ? (
            <p className="mt-3 text-[12px] text-ok">
              RAB dikonfirmasi pelapor pada{" "}
              {new Date(campaign.reporter_confirmed_at).toLocaleString("id-ID")}.
            </p>
          ) : (
            <p className="mt-3 text-[12px] text-warn">
              RAB belum dikonfirmasi pelapor. Donasi belum bisa dibuka.
            </p>
          )}
        </Card>

        <section>
          <h2 className="text-[13px] font-semibold">Rencana Anggaran Biaya</h2>
          <div className="mt-3 overflow-hidden rounded-xl border border-line">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-surface text-[11px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-3 py-2 font-semibold">Item</th>
                  <th className="px-3 py-2 font-semibold">Kategori</th>
                  <th className="px-3 py-2 text-right font-semibold">Qty</th>
                  <th className="px-3 py-2 text-right font-semibold">Satuan</th>
                  <th className="px-3 py-2 text-right font-semibold">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-white">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2 font-medium">{item.name}</td>
                    <td className="px-3 py-2 text-muted">
                      {NEED_CATEGORY_LABELS[item.category]}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(item.quantity)}</td>
                    <td className="px-3 py-2 text-right text-muted">{item.unit}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {rupiah.format(Number(item.subtotal))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {(isOrg || isAdmin) && (
          <Card className="p-5">
            <h2 className="text-[13px] font-semibold">Langkah organisasi</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {campaign.status === "draft" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    act(`/campaigns/${campaignId}/request-confirmation`, undefined, "RAB diajukan ke pelapor untuk dikonfirmasi.")
                  }
                  className={buttonPrimary}
                >
                  Ajukan ke pelapor
                </button>
              )}
              {campaign.status === "active" && (
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="Rencana pencairan (Rp)">
                    <input
                      type="number"
                      min={1}
                      value={trancheAmount}
                      onChange={(event) => setTrancheAmount(event.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <button
                    type="button"
                    disabled={busy || !trancheAmount}
                    onClick={async () => {
                      await act(`/campaigns/${campaignId}/tranches`, { amount: Number(trancheAmount) });
                      setTrancheAmount("");
                    }}
                    className={buttonSecondary}
                  >
                    Tambah tahap
                  </button>
                </div>
              )}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted">
              Dana dicairkan bertahap. Setiap tahap butuh bukti belanja dan konfirmasi barang
              diterima; aturan ini dijaga di database, bukan hanya di antarmuka.
            </p>
          </Card>
        )}

        <section>
          <h2 className="text-[13px] font-semibold">Pencairan bertahap</h2>
          <p className="mt-1 text-[11px] text-muted tabular-nums">
            Sudah dicairkan {rupiah.format(released)} dari {rupiah.format(Number(campaign.raised_amount))}{" "}
            terkumpul.
          </p>

          <div className="mt-3">
            {tranches.length === 0 ? (
              <EmptyState
                title="Belum ada tahap"
                body="Organisasi membuat rencana pencairan setelah donasi masuk."
              />
            ) : (
              <ol className="flex flex-col gap-3">
                {tranches.map((tranche) => (
                  <li key={tranche.id}>
                    <Card className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[13px] font-semibold">
                            Tahap {tranche.seq} · {rupiah.format(Number(tranche.amount))}
                          </p>
                          {tranche.purpose && (
                            <p className="mt-0.5 text-[12px] text-muted">{tranche.purpose}</p>
                          )}
                        </div>
                        <Badge tone={tranche.status === "released" ? "ok" : "neutral"}>
                          {TRANCHE_LABEL[tranche.status]}
                        </Badge>
                      </div>

                      {tranche.receipts.length > 0 && (
                        <ul className="mt-3 flex flex-wrap gap-2">
                          {tranche.receipts.map((receipt) => (
                            <li key={receipt.id}>
                              <a
                                href={receipt.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11px] font-semibold text-brand hover:underline"
                              >
                                {receipt.vendor ?? "Bukti belanja"}
                                {receipt.amount ? ` · ${rupiah.format(Number(receipt.amount))}` : ""}
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}

                      {(isOrg || isAdmin) && tranche.status !== "released" && (
                        <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={async () => {
                              const key = `receipts/${tranche.id}/${crypto.randomUUID()}.pdf`;
                              await act(
                                `/tranches/${tranche.id}/receipts`,
                                { r2Key: key, vendor: "Toko Mitra", amount: Number(tranche.amount) },
                                "Bukti belanja dicatat (contoh, tanpa unggah berkas).",
                              );
                            }}
                            className={buttonSecondary}
                          >
                            Tandai bukti belanja
                          </button>
                          {tranche.status === "receipts_submitted" && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={async () => {
                                await act(
                                  `/tranches/${tranche.id}/confirm-goods`,
                                  undefined,
                                  "Barang dikonfirmasi diterima di pos.",
                                );
                              }}
                              className={buttonSecondary}
                            >
                              Konfirmasi barang diterima
                            </button>
                          )}
                          {isAdmin && tranche.status === "goods_confirmed" && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => releaseTranche(tranche.id)}
                              className={buttonPrimary}
                            >
                              Cairkan dana
                            </button>
                          )}
                        </div>
                      )}
                    </Card>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-[13px] font-semibold">Donasi</h2>
          <p className="mt-1 text-[11px] text-muted">
            Mode simulasi: donasi dicatat langsung lunas tanpa payment gateway, dan diberi label.
          </p>

          {["active", "funded"].includes(campaign.status) && (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <Field label="Nominal (Rp)">
                <input
                  type="number"
                  min={1000}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className={inputClass}
                />
              </Field>
              <button
                type="button"
                disabled={busy}
                onClick={() => act(`/campaigns/${campaignId}/donations`, { amount: Number(amount) }, "Donasi simulasi tercatat.")}
                className={buttonPrimary}
              >
                Donasi (simulasi)
              </button>
            </div>
          )}

          <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-white">
            {donations.length === 0 && (
              <li className="px-3 py-4 text-center text-[12px] text-muted">Belum ada donasi.</li>
            )}
            {donations.map((donation) => (
              <li key={donation.id} className="flex items-center justify-between px-3 py-2.5">
                <span className="text-[13px]">{donation.donor_name ?? "Anonim"}</span>
                <span className="flex items-center gap-3 text-[12px]">
                  <span className="tabular-nums">{rupiah.format(Number(donation.amount))}</span>
                  <Badge tone={donation.status === "paid" ? "ok" : "warn"}>
                    {donation.status === "paid" ? "lunas" : donation.status}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
