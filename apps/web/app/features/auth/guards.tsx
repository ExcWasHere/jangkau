import { Navigate } from "react-router";

import { useMe } from "~/features/auth/use-me";
import { useAuthState } from "./session";

/**
 * Halaman yang butuh login. Selama sesi atau profil masih dimuat, tampilkan
 * status memuat — bukan redirect, supaya pengguna yang sudah login tidak
 * terlempar ke halaman masuk karena perlombaan waktu.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
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

  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { ready } = useAuthState();
  const { me, loading } = useMe();

  if (!ready || loading) return <p className="text-[13px] text-muted">Memuat sesi…</p>;
  if (!me) return <Navigate to="/masuk" replace />;
  if (!me.isAdmin) return <Navigate to="/" replace />;

  return <>{children}</>;
}

/**
 * Pengajuan penanggung jawab hanya untuk penyalur yang sudah mendapat centang
 * terverifikasi. Akun penyalur tanpa centang tetap boleh melapor dan berdonasi,
 * jadi blokirnya dijelaskan, bukan sekadar dialihkan.
 */
export function RequireVerifiedDistributor({ children }: { children: React.ReactNode }) {
  const { ready } = useAuthState();
  const { me, loading, isVerifiedDistributor } = useMe();

  if (!ready || loading) return <p className="text-[13px] text-muted">Memuat sesi…</p>;
  if (!me) return <Navigate to="/masuk" replace />;

  if (!isVerifiedDistributor) {
    return (
      <div className="rounded-xl border border-line bg-surface px-5 py-6">
        <p className="text-[14px] font-semibold">Verifikasi penyalur belum disetujui</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          Lengkapi dokumen di dasbor penyalur dan tunggu persetujuan admin. Setelah mendapat
          centang terverifikasi, kamu bisa mengajukan diri sebagai penanggung jawab penyaluran.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
