import { Navigate } from "react-router";

import type { AppRole } from "@jangkau/shared";

import { useMe } from "~/features/auth/use-me";
import { useAuthState } from "./session";

/**
 * Penjaga halaman berdasarkan peran dari API.
 *
 * Aturannya sengaja tegas: organisasi hanya boleh masuk bila sudah
 * diverifikasi (`organizationId` terisi), karena status verifikasi adalah
 * dasar kewenangan di alur dana.
 */
export function RequireRole({
  allow,
  children,
}: {
  allow: AppRole[];
  children: React.ReactNode;
}) {
  const { ready } = useAuthState();
  const { me, loading, error } = useMe();

  if (!ready || loading) {
    return <p className="text-[13px] text-muted">Memuat sesi…</p>;
  }

  if (error) {
    return (
      <p className="rounded-lg border border-line bg-surface px-4 py-3 text-[13px] text-warn">
        {error}
      </p>
    );
  }

  if (!me) return <Navigate to="/masuk" replace />;
  if (!allow.includes(me.role)) return <Navigate to="/laporan" replace />;

  return <>{children}</>;
}

/** Halaman organisasi: wajib terverifikasi, bukan sekadar punya akun. */
export function RequireVerifiedOrganization({ children }: { children: React.ReactNode }) {
  const { ready } = useAuthState();
  const { me, loading } = useMe();

  if (!ready || loading) {
    return <p className="text-[13px] text-muted">Memuat sesi…</p>;
  }
  if (!me) return <Navigate to="/masuk" replace />;

  if (me.role !== "admin" && !me.organizationId) {
    return (
      <div className="rounded-xl border border-line bg-surface px-5 py-6">
        <p className="text-[14px] font-semibold">Akun belum terhubung ke organisasi terverifikasi</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          Organisasi harus mendaftar dan menunggu verifikasi admin sebelum bisa mengambil laporan
          atau membuka donasi.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
