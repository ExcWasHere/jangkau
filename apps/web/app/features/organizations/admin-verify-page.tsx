import { useCallback, useEffect, useState } from "react";

import { NEED_CATEGORIES, NEED_CATEGORY_LABELS } from "@jangkau/shared";

import { AppShell } from "~/shared/layout/app-shell";
import { apiFetch, ApiError } from "~/shared/api/client";
import { RequireRole } from "~/features/auth/guards";
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

type PendingOrg = {
  id: string;
  name: string;
  legal_type: string | null;
  pic_name: string;
  pic_phone: string;
  pic_email: string | null;
  verification_status: string;
  rejection_reason: string | null;
  created_at: string;
};

type AuditRow = {
  id: number;
  action: string;
  entity: string;
  entity_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

function AdminInner() {
  const { token } = useMe();
  const [status, setStatus] = useState<"pending" | "verified" | "rejected" | "all">("pending");
  const [items, setItems] = useState<PendingOrg[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [orgs, logs] = await Promise.all([
        apiFetch<{ items: PendingOrg[] }>(`/admin/organizations?status=${status}`, { token }),
        apiFetch<{ items: AuditRow[] }>("/admin/organizations/audit", { token }),
      ]);
      setItems(orgs.items);
      setAudit(logs.items);
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Gagal memuat data");
    }
  }, [status, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: string, decision: "verified" | "rejected") {
    if (!token) return;
    setBusy(id);
    setError(null);

    try {
      await apiFetch(`/admin/organizations/${id}/verify`, {
        method: "POST",
        token,
        body: JSON.stringify({
          decision,
          reason: decision === "rejected" ? reason[id] : undefined,
        }),
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
          <h1 className="text-2xl font-bold tracking-tight">Verifikasi organisasi</h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            Hanya organisasi berstatus terverifikasi yang boleh mengambil laporan dan membuka
            donasi. Setiap keputusan tercatat di audit log.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(["pending", "verified", "rejected", "all"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setStatus(option)}
              className={
                status === option
                  ? "rounded-lg bg-brand-soft px-3 py-1.5 text-[12px] font-semibold text-brand-strong"
                  : "rounded-lg px-3 py-1.5 text-[12px] font-medium text-muted hover:text-ink"
              }
            >
              {option === "all" ? "Semua" : option === "pending" ? "Menunggu" : option === "verified" ? "Terverifikasi" : "Ditolak"}
            </button>
          ))}
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-danger">{error}</p>
        )}

        {items.length === 0 ? (
          <EmptyState
            title="Tidak ada organisasi di filter ini"
            body="Pendaftaran baru akan muncul di sini untuk diperiksa."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((org) => (
              <li key={org.id}>
                <Card className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-[15px] font-semibold">{org.name}</h2>
                      <p className="mt-0.5 text-[12px] text-muted">
                        {org.legal_type ?? "—"} · {org.pic_name} · {org.pic_phone}
                        {org.pic_email ? ` · ${org.pic_email}` : ""}
                      </p>
                      <p className="mt-1 text-[11px] text-muted">
                        Didaftarkan {new Date(org.created_at).toLocaleDateString("id-ID")}
                      </p>
                    </div>
                    <Badge
                      tone={
                        org.verification_status === "verified"
                          ? "ok"
                          : org.verification_status === "pending"
                            ? "warn"
                            : "danger"
                      }
                    >
                      {org.verification_status}
                    </Badge>
                  </div>

                  {org.rejection_reason && (
                    <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-danger">
                      Alasan: {org.rejection_reason}
                    </p>
                  )}

                  {org.verification_status === "pending" && (
                    <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
                      <Field label="Alasan (wajib bila menolak)">
                        <input
                          value={reason[org.id] ?? ""}
                          onChange={(event) =>
                            setReason((current) => ({ ...current, [org.id]: event.target.value }))
                          }
                          className={inputClass}
                          placeholder="Dokumen tidak terbaca / tidak sesuai"
                        />
                      </Field>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy === org.id}
                          onClick={() => decide(org.id, "verified")}
                          className={buttonPrimary}
                        >
                          {busy === org.id ? "Menyimpan…" : "Verifikasi"}
                        </button>
                        <button
                          type="button"
                          disabled={busy === org.id}
                          onClick={() => decide(org.id, "rejected")}
                          className={buttonSecondary}
                        >
                          Tolak
                        </button>
                      </div>
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}

        <section>
          <h2 className="text-[13px] font-semibold">Audit terakhir</h2>
          <div className="mt-3 overflow-hidden rounded-xl border border-line">
            <table className="w-full text-left text-[12px]">
              <thead className="bg-surface text-[11px] tracking-wide text-muted uppercase">
                <tr>
                  <th className="px-3 py-2 font-semibold">Aksi</th>
                  <th className="px-3 py-2 font-semibold">Entitas</th>
                  <th className="px-3 py-2 font-semibold">Waktu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-white">
                {audit.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-center text-muted">
                      Belum ada catatan.
                    </td>
                  </tr>
                )}
                {audit.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2 font-medium">{row.action}</td>
                    <td className="px-3 py-2 text-muted">{row.entity}</td>
                    <td className="px-3 py-2 text-muted tabular-nums">
                      {new Date(row.created_at).toLocaleString("id-ID")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

export function AdminVerifyPage() {
  return (
    <RequireRole allow={["admin"]}>
      <AdminInner />
    </RequireRole>
  );
}
