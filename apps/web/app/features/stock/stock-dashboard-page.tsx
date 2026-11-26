import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";

import { NEED_CATEGORIES, NEED_CATEGORY_LABELS, STOCK_REASONS } from "@jangkau/shared";
import type { NeedCategory, StockReason } from "@jangkau/shared";

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

type Post = {
  id: string;
  name: string;
  regency: string | null;
  headcount: number;
  openReportCount: number;
};

type StockRow = {
  id: string;
  name: string;
  category: NeedCategory;
  unit: string;
  quantity: number;
  low_stock_threshold: number;
  is_low: boolean;
};

type StockLog = {
  id: string;
  delta: number;
  quantity_after: number;
  reason: StockReason;
  note: string | null;
  created_at: string;
};

const REASON_LABEL: Record<StockReason, string> = {
  report: "Dari laporan",
  donation: "Donasi masuk",
  distribution: "Distribusi ke pengungsi",
  adjustment: "Koreksi",
  opname: "Stok awal",
};

/**
 * Dashboard stok per pos.
 *
 * Saldo tidak pernah diedit langsung: setiap perubahan dikirim sebagai
 * `delta` dengan alasan, dan API memprosesnya lewat RPC yang menulis log.
 * Karena itu kolom jumlah di sini hanya baca.
 */
export function StockDashboardPage() {
  const { token, me } = useMe();
  const [posts, setPosts] = useState<Post[]>([]);
  const [postId, setPostId] = useState("");
  const [stock, setStock] = useState<StockRow[]>([]);
  const [logs, setLogs] = useState<StockLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [moveItem, setMoveItem] = useState("");
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState<StockReason>("donation");
  const [note, setNote] = useState("");

  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<NeedCategory>("food");
  const [newUnit, setNewUnit] = useState("pcs");
  const [newThreshold, setNewThreshold] = useState("0");
  const [newQty, setNewQty] = useState("0");

  const canWrite = me?.role === "admin" || Boolean(me?.organizationId);

  useEffect(() => {
    let active = true;
    apiFetch<{ items: Post[] }>("/posts")
      .then((data) => {
        if (!active) return;
        setPosts(data.items);
        if (data.items[0]) setPostId((current) => current || data.items[0]!.id);
      })
      .catch(() => {
        if (active) setError("Gagal memuat daftar pos");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const loadStock = useCallback(async () => {
    if (!postId) return;
    try {
      const detail = await apiFetch<{ stock: StockRow[] }>(`/posts/${postId}`);
      setStock(detail.stock);
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Gagal memuat stok");
    }
  }, [postId]);

  useEffect(() => {
    void loadStock();
  }, [loadStock]);

  async function loadLogs(itemId: string) {
    if (!token || !itemId) {
      setLogs([]);
      return;
    }
    try {
      const data = await apiFetch<{ items: StockLog[] }>(`/stock/${itemId}/logs`, { token });
      setLogs(data.items);
    } catch {
      setLogs([]);
    }
  }

  async function submitMovement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !moveItem) return;

    setNotice(null);
    setError(null);

    try {
      await apiFetch("/stock/movements", {
        method: "POST",
        token,
        body: JSON.stringify({
          stockItemId: moveItem,
          delta: Number(delta),
          reason,
          note: note || undefined,
        }),
      });
      setDelta("");
      setNote("");
      await loadStock();
      await loadLogs(moveItem);
      setNotice("Pergerakan stok tercatat.");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Gagal mencatat pergerakan");
    }
  }

  async function addItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !postId) return;

    setNotice(null);
    setError(null);

    try {
      await apiFetch("/stock/items", {
        method: "POST",
        token,
        body: JSON.stringify({
          postId,
          name: newName,
          category: newCategory,
          unit: newUnit,
          lowStockThreshold: Number(newThreshold),
          initialQuantity: Number(newQty),
        }),
      });
      setNewName("");
      setNewQty("0");
      setNewThreshold("0");
      await loadStock();
      setNotice("Item stok ditambahkan.");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Gagal menambah item");
    }
  }

  const selectedPost = posts.find((post) => post.id === postId);
  const lowCount = stock.filter((item) => item.is_low).length;

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stok pos</h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            Saldo hanya berubah lewat pergerakan yang tercatat. Setiap baris menyimpan alasan dan
            pelakunya, sehingga surplus dan kekurangan bisa ditelusuri.
          </p>
        </div>

        {notice && (
          <p className="rounded-lg border border-brand-line bg-brand-soft px-4 py-3 text-[13px] text-brand-strong">
            {notice}
          </p>
        )}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-danger">{error}</p>}

        {loading ? (
          <p className="text-[13px] text-muted">Memuat…</p>
        ) : posts.length === 0 ? (
          <EmptyState
            title="Belum ada pos"
            body="Pos pengungsian dibuat admin sebelum laporan bisa diterima."
          />
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Pos pengungsian">
                <select
                  value={postId}
                  onChange={(event) => {
                    setPostId(event.target.value);
                    setMoveItem("");
                    setLogs([]);
                  }}
                  className={inputClass}
                >
                  {posts.map((post) => (
                    <option key={post.id} value={post.id}>
                      {post.name}
                      {post.regency ? ` — ${post.regency}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Link to={`/pos/${postId}`} className={buttonSecondary}>
                Lihat halaman publik
              </Link>
            </div>

            {selectedPost && (
              <div className="flex flex-wrap gap-2 text-[12px]">
                <Badge tone="neutral">{selectedPost.headcount} pengungsi</Badge>
                <Badge tone={selectedPost.openReportCount > 0 ? "warn" : "neutral"}>
                  {selectedPost.openReportCount} laporan terbuka
                </Badge>
                <Badge tone={lowCount > 0 ? "danger" : "ok"}>
                  {lowCount > 0 ? `${lowCount} item menipis` : "stok aman"}
                </Badge>
              </div>
            )}

            <div className="overflow-hidden rounded-xl border border-line">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-surface text-[11px] tracking-wide text-muted uppercase">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Item</th>
                    <th className="px-4 py-2.5 font-semibold">Kategori</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Saldo</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Ambang</th>
                    <th className="px-4 py-2.5 font-semibold">Riwayat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-white">
                  {stock.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-muted">
                        Belum ada item stok di pos ini.
                      </td>
                    </tr>
                  )}
                  {stock.map((item) => (
                    <tr key={item.id} className={item.is_low ? "bg-amber-50/40" : undefined}>
                      <td className="px-4 py-2.5 font-medium">
                        <span className="flex items-center gap-2">
                          {item.name}
                          {item.is_low && <Badge tone="warn">Menipis</Badge>}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted">
                        {NEED_CATEGORY_LABELS[item.category]}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                        {Number(item.quantity).toLocaleString("id-ID")} {item.unit}
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted tabular-nums">
                        {Number(item.low_stock_threshold).toLocaleString("id-ID")}
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            setMoveItem(item.id);
                            void loadLogs(item.id);
                          }}
                          className="text-[12px] font-semibold text-brand hover:underline"
                        >
                          Lihat
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {canWrite && (
              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="p-5">
                  <h2 className="text-[13px] font-semibold">Catat pergerakan</h2>
                  <form onSubmit={submitMovement} className="mt-3 flex flex-col gap-3">
                    <Field label="Item">
                      <select
                        required
                        value={moveItem}
                        onChange={(event) => {
                          setMoveItem(event.target.value);
                          void loadLogs(event.target.value);
                        }}
                        className={inputClass}
                      >
                        <option value="" disabled>
                          Pilih item
                        </option>
                        {stock.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name} ({item.quantity} {item.unit})
                          </option>
                        ))}
                      </select>
                    </Field>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Perubahan" hint="Negatif untuk barang keluar.">
                        <input
                          required
                          type="number"
                          value={delta}
                          onChange={(event) => setDelta(event.target.value)}
                          className={inputClass}
                          placeholder="mis. 20 atau -5"
                        />
                      </Field>
                      <Field label="Alasan">
                        <select
                          value={reason}
                          onChange={(event) => setReason(event.target.value as StockReason)}
                          className={inputClass}
                        >
                          {STOCK_REASONS.map((value) => (
                            <option key={value} value={value}>
                              {REASON_LABEL[value]}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>

                    <Field label="Catatan">
                      <input
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        className={inputClass}
                        placeholder="mis. kiriman dari donatur"
                      />
                    </Field>

                    <button type="submit" className={buttonPrimary} disabled={!moveItem}>
                      Simpan pergerakan
                    </button>
                  </form>
                </Card>

                <Card className="p-5">
                  <h2 className="text-[13px] font-semibold">Item baru</h2>
                  <form onSubmit={addItem} className="mt-3 flex flex-col gap-3">
                    <Field label="Nama item">
                      <input
                        required
                        minLength={2}
                        value={newName}
                        onChange={(event) => setNewName(event.target.value)}
                        className={inputClass}
                      />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Kategori">
                        <select
                          value={newCategory}
                          onChange={(event) => setNewCategory(event.target.value as NeedCategory)}
                          className={inputClass}
                        >
                          {NEED_CATEGORIES.map((value) => (
                            <option key={value} value={value}>
                              {NEED_CATEGORY_LABELS[value]}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Satuan">
                        <input
                          value={newUnit}
                          onChange={(event) => setNewUnit(event.target.value)}
                          className={inputClass}
                        />
                      </Field>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Ambang aman">
                        <input
                          type="number"
                          min={0}
                          value={newThreshold}
                          onChange={(event) => setNewThreshold(event.target.value)}
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Stok awal">
                        <input
                          type="number"
                          min={0}
                          value={newQty}
                          onChange={(event) => setNewQty(event.target.value)}
                          className={inputClass}
                        />
                      </Field>
                    </div>
                    <button type="submit" className={buttonSecondary}>
                      Tambah item
                    </button>
                  </form>
                </Card>
              </div>
            )}

            {moveItem && (
              <Card className="p-5">
                <h2 className="text-[13px] font-semibold">Riwayat pergerakan</h2>
                {logs.length === 0 ? (
                  <p className="mt-2 text-[12px] text-muted">Belum ada pergerakan tercatat.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-line">
                    {logs.map((log) => (
                      <li key={log.id} className="flex items-center justify-between py-2 text-[12px]">
                        <span>
                          <span
                            className={
                              Number(log.delta) > 0
                                ? "font-semibold text-ok tabular-nums"
                                : "font-semibold text-danger tabular-nums"
                            }
                          >
                            {Number(log.delta) > 0 ? "+" : ""}
                            {Number(log.delta).toLocaleString("id-ID")}
                          </span>{" "}
                          <span className="text-muted">
                            {REASON_LABEL[log.reason]}
                            {log.note ? ` · ${log.note}` : ""}
                          </span>
                        </span>
                        <span className="text-muted tabular-nums">
                          saldo {Number(log.quantity_after).toLocaleString("id-ID")} ·{" "}
                          {new Date(log.created_at).toLocaleDateString("id-ID")}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
