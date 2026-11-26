import { useEffect, useState } from "react";

import { AppShell } from "~/shared/layout/app-shell";
import { apiFetch, ApiError } from "~/shared/api/client";
import { Badge, Card, EmptyState, buttonSecondary } from "~/shared/ui/primitives";
import { useMe } from "~/features/auth/use-me";

type Organization = {
  id: string;
  name: string;
  legal_type: string | null;
  pic_name: string;
  pic_phone: string;
  pic_email: string | null;
  verification_status: "pending" | "verified" | "rejected" | "suspended";
  verified_at: string | null;
  rejection_reason: string | null;
  created_at: string;
};

const STATUS_COPY = {
  pending: {
    tone: "warn" as const,
    title: "Menunggu verifikasi admin",
    body: "Selama menunggu, akun belum bisa mengambil laporan atau membuka donasi.",
  },
  verified: {
    tone: "ok" as const,
    title: "Terverifikasi",
    body: "Akun bisa mengambil laporan yang memenuhi ambang dan menyusun RAB.",
  },
  rejected: {
    tone: "danger" as const,
    title: "Pendaftaran ditolak",
    body: "Perbaiki dokumen lalu hubungi admin untuk peninjauan ulang.",
  },
  suspended: {
    tone: "danger" as const,
    title: "Ditangguhkan",
    body: "Kewenangan operasional dicabut sementara oleh admin.",
  },
};

export function OrganizationStatusPage() {
  const { token } = useMe();
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let active = true;

    apiFetch<{ organization: Organization | null }>("/organizations/me", { token })
      .then((data) => {
        if (active) setOrg(data.organization);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof ApiError ? cause.message : "Gagal memuat data");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  if (loading) {
    return (
      <AppShell>
        <p className="text-[13px] text-muted">Memuat…</p>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <p className="rounded-lg border border-line bg-surface px-4 py-3 text-[13px] text-warn">
          {error}
        </p>
      </AppShell>
    );
  }

  if (!org) {
    return (
      <AppShell>
        <EmptyState
          title="Belum terhubung ke organisasi"
          body="Daftarkan organisasi lebih dulu. Setelah admin memverifikasi, akun bisa mengambil laporan dan menyusun RAB."
          action={
            <a href="/organisasi/daftar" className={buttonSecondary}>
              Daftarkan organisasi
            </a>
          }
        />
      </AppShell>
    );
  }

  const copy = STATUS_COPY[org.verification_status];

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{org.name}</h1>
          <p className="mt-1 text-[13px] text-muted">
            {org.legal_type ?? "Badan usaha"} · terdaftar{" "}
            {new Date(org.created_at).toLocaleDateString("id-ID")}
          </p>
        </div>

        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={copy.tone}>{copy.title}</Badge>
            {org.verified_at && (
              <span className="text-[11px] text-muted">
                diverifikasi {new Date(org.verified_at).toLocaleDateString("id-ID")}
              </span>
            )}
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">{copy.body}</p>
          {org.rejection_reason && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-danger">
              Alasan: {org.rejection_reason}
            </p>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-[13px] font-semibold">Penanggung jawab</h2>
          <dl className="mt-3 grid gap-3 text-[13px] sm:grid-cols-2">
            <div>
              <dt className="text-[11px] text-muted">Nama</dt>
              <dd className="mt-0.5">{org.pic_name}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted">Telepon</dt>
              <dd className="mt-0.5 tabular-nums">{org.pic_phone}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted">Email</dt>
              <dd className="mt-0.5">{org.pic_email ?? "—"}</dd>
            </div>
          </dl>
        </Card>

        {org.verification_status === "verified" && (
          <div className="flex flex-wrap gap-3">
            <a href="/laporan-masuk" className={buttonSecondary}>
              Laporan siap diambil
            </a>
            <a href="/organisasi/kampanye" className={buttonSecondary}>
              Kampanye organisasi
            </a>
          </div>
        )}
      </div>
    </AppShell>
  );
}
