import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";

import { NEED_CATEGORIES, NEED_CATEGORY_LABELS, SEVERITY_LABELS } from "@jangkau/shared";
import type { NeedCategory, SeverityLevel } from "@jangkau/shared";

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

type InboxReport = {
  id: string;
  body_text: string | null;
  category: NeedCategory;
  severity: SeverityLevel;
  upvote_count: number;
  captured_at: string;
  post: { id: string; name: string; regency: string | null } | null;
};

type BudgetLine = {
  name: string;
  category: NeedCategory;
  quantity: number;
  unit: string;
  unitCost: number;
};

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const emptyLine = (): BudgetLine => ({
  name: "",
  category: "other",
  quantity: 1,
  unit: "pcs",
  unitCost: 0,
});

/**
 * Kotak masuk organisasi + penyusun RAB.
 *
 * RAB disusun per baris; total dihitung di klien untuk umpan balik cepat,
 * tetapi server menghitung ulang `target_amount` dari baris yang dikirim —
 * angka dari klien tidak pernah dipercaya.
 */
export function OrganizationInboxPage() {
  const { token, me } = useMe();
  const [items, setItems] = useState<InboxReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<InboxReport | null>(null);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [lines, setLines] = useState<BudgetLine[]>([emptyLine()]);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ id: string; status: string } | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch<{ items: InboxReport[] }>("/reports/inbox", { token });
      setItems(data.items);
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Gagal memuat kotak masuk");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  function pick(report: InboxReport) {
    setSelected(report);
    setCreated(null);
    setTitle(`Kebutuhan ${NEED_CATEGORY_LABELS[report.category].toLowerCase()} — ${report.post?.name ?? "pos"}`);
    setSummary(report.body_text ?? "");
    setLines([
      {
        ...emptyLine(),
        name: NEED_CATEGORY_LABELS[report.category],
        category: report.category,
      },
    ]);
  }

  const total = lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);

  async function submit() {
    if (!token || !selected) return;
    setBusy(true);
    setError(null);

    try {
      const result = await apiFetch<{ campaign: { id: string; status: string } }>("/campaigns", {
        method: "POST",
        token,
        body: JSON.stringify({
          reportId: selected.id,
          title,
          summary: summary || undefined,
          items: lines.filter((line) => line.name.trim() && line.quantity > 0),
        }),
      });
      setCreated(result.campaign);
      setSelected(null);
      await load();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Gagal menyimpan RAB");
    } finally {
      setBusy(false);
    }
  }

  if (!me?.organizationId && me?.role !== "admin") {
    return (
      <AppShell>
        <EmptyState
          title="Akun belum terhubung ke organisasi terverifikasi"
          body="Organisasi harus mendaftar dan menunggu verifikasi admin sebelum bisa mengambil laporan."
          action={
            <Link to="/organisasi/daftar" className={buttonSecondary}>
              Daftarkan organisasi
            </Link>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Laporan siap diambil</h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            Laporan yang sudah memenuhi ambang dukungan dan belum punya kampanye. Ambil satu
            laporan, lalu susun Rencana Anggaran Biaya untuk diajukan ke pelapor.
          </p>
        </div>

        {created && (
          <p className="rounded-lg border border-brand-line bg-brand-soft px-4 py-3 text-[13px] text-brand-strong">
            RAB tersimpan sebagai draf.{" "}
            <Link to={`/kampanye/${created.id}`} className="font-semibold underline">
              Buka kampanye
            </Link>{" "}
            untuk mengajukannya ke pelapor.
          </p>
        )}

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-danger">{error}</p>}

        {loading ? (
          <p className="text-[13px] text-muted">Memuat…</p>
        ) : items.length === 0 ? (
          <EmptyState
            title="Belum ada laporan yang memenuhi ambang"
            body="Laporan masuk ke sini setelah mendapat dukungan minimum dari akun berbeda."
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {items.map((report) => (
              <li key={report.id}>
                <Card className="flex h-full flex-col p-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="brand">{NEED_CATEGORY_LABELS[report.category]}</Badge>
                    <Badge tone={report.severity === "critical" ? "danger" : "neutral"}>
                      {SEVERITY_LABELS[report.severity]}
                    </Badge>
                    <span className="text-[11px] text-muted tabular-nums">
                      {report.upvote_count} dukungan
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-3 flex-1 text-[13px] leading-relaxed">
                    {report.body_text}
                  </p>
                  <p className="mt-2 text-[11px] text-muted">{report.post?.name ?? "—"}</p>
                  <button
                    type="button"
                    onClick={() => pick(report)}
                    className={`${buttonSecondary} mt-3 w-full`}
                  >
                    Susun RAB
                  </button>
                </Card>
              </li>
            ))}
          </ul>
        )}

        {selected && (
          <Card className="p-5">
            <h2 className="text-[15px] font-semibold">RAB untuk laporan terpilih</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">{selected.body_text}</p>

            <div className="mt-4 grid gap-4">
              <Field label="Judul kampanye">
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Ringkasan" hint="Tampil di halaman pos dan kartu donasi.">
                <textarea
                  rows={3}
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>

            <div className="mt-5">
              <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-semibold">Rincian kebutuhan</h3>
                <button
                  type="button"
                  onClick={() => setLines((current) => [...current, emptyLine()])}
                  className="text-[12px] font-semibold text-brand hover:underline"
                >
                  + Tambah baris
                </button>
              </div>

              <ul className="mt-3 flex flex-col gap-3">
                {lines.map((line, index) => (
                  <li key={index} className="rounded-lg border border-line p-3">
                    <div className="grid gap-2 sm:grid-cols-[1.6fr_1fr_0.7fr_0.8fr_1fr_auto]">
                      <input
                        placeholder="Nama barang"
                        value={line.name}
                        onChange={(event) =>
                          setLines((current) =>
                            current.map((row, i) =>
                              i === index ? { ...row, name: event.target.value } : row,
                            ),
                          )
                        }
                        className={inputClass}
                      />
                      <select
                        value={line.category}
                        onChange={(event) =>
                          setLines((current) =>
                            current.map((row, i) =>
                              i === index
                                ? { ...row, category: event.target.value as NeedCategory }
                                : row,
                            ),
                          )
                        }
                        className={inputClass}
                      >
                        {NEED_CATEGORIES.map((value) => (
                          <option key={value} value={value}>
                            {NEED_CATEGORY_LABELS[value]}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        value={line.quantity}
                        onChange={(event) =>
                          setLines((current) =>
                            current.map((row, i) =>
                              i === index ? { ...row, quantity: Number(event.target.value) } : row,
                            ),
                          )
                        }
                        className={inputClass}
                        aria-label="Jumlah"
                      />
                      <input
                        placeholder="satuan"
                        value={line.unit}
                        onChange={(event) =>
                          setLines((current) =>
                            current.map((row, i) =>
                              i === index ? { ...row, unit: event.target.value } : row,
                            ),
                          )
                        }
                        className={inputClass}
                        aria-label="Satuan"
                      />
                      <input
                        type="number"
                        min={0}
                        value={line.unitCost}
                        onChange={(event) =>
                          setLines((current) =>
                            current.map((row, i) =>
                              i === index ? { ...row, unitCost: Number(event.target.value) } : row,
                            ),
                          )
                        }
                        className={inputClass}
                        aria-label="Harga satuan"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setLines((current) => current.filter((_, i) => i !== index))
                        }
                        className="px-2 text-[12px] font-semibold text-danger hover:underline"
                      >
                        Hapus
                      </button>
                    </div>
                    <p className="mt-1.5 text-right text-[11px] text-muted tabular-nums">
                      Subtotal {rupiah.format(line.quantity * line.unitCost)}
                    </p>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                <span className="text-[13px] font-semibold">Total RAB</span>
                <span className="text-lg font-bold tabular-nums">{rupiah.format(total)}</span>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={submit}
                disabled={busy || total <= 0}
                className={buttonPrimary}
              >
                {busy ? "Menyimpan…" : "Simpan draf RAB"}
              </button>
              <button type="button" onClick={() => setSelected(null)} className={buttonSecondary}>
                Batal
              </button>
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
