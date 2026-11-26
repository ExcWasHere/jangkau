import { Link, NavLink } from "react-router";

import type { AppRole } from "@jangkau/shared";

import { useMe } from "~/features/auth/use-me";
import { getSupabaseBrowserClient } from "~/shared/lib/supabase";

type NavItem = { to: string; label: string; roles: AppRole[] };

/**
 * Navigasi mengikuti peran yang dilaporkan API, bukan tebakan di klien.
 * `organizationId` hanya terisi setelah organisasi diverifikasi, jadi
 * organisasi berstatus pending tidak melihat menu operasional.
 */
const NAV: NavItem[] = [
  { to: "/lapor", label: "Lapor", roles: ["resident", "organization", "admin"] },
  { to: "/laporan", label: "Laporan saya", roles: ["resident", "organization", "admin"] },
  { to: "/konfirmasi-rab", label: "Konfirmasi RAB", roles: ["resident", "organization", "admin"] },
  { to: "/laporan-masuk", label: "Laporan masuk", roles: ["organization", "admin"] },
  { to: "/stok", label: "Stok", roles: ["organization", "admin"] },
  { to: "/organisasi", label: "Organisasi", roles: ["organization", "admin"] },
  { to: "/admin/organisasi", label: "Verifikasi", roles: ["admin"] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { me, loading } = useMe();

  async function signOut() {
    await getSupabaseBrowserClient().auth.signOut();
    window.location.href = "/";
  }

  const visible = NAV.filter((item) => {
    if (!me) return item.roles.includes("resident") && item.to !== "/konfirmasi-rab";
    // Menu organisasi hanya untuk yang sudah terverifikasi; status
    // verifikasi adalah dasar kewenangan, bukan sekadar label.
    if (item.to === "/laporan-masuk") {
      return me.role === "admin" || Boolean(me.organizationId);
    }
    return item.roles.includes(me.role);
  });

  const roleLabel = loading
    ? null
    : me?.role === "admin"
      ? "Admin"
      : me?.organizationId
        ? "Org terverifikasi"
        : "Pelapor";

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-[15px] font-extrabold tracking-tight">
              Jangkau<span className="text-brand">.</span>
            </Link>
            {roleLabel && (
              <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-muted">
                {roleLabel}
              </span>
            )}
          </div>

          <nav className="flex flex-wrap items-center gap-0.5 text-[13px]">
            {visible.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-lg px-2.5 py-1.5 font-medium transition-colors ${
                    isActive ? "bg-brand-soft text-brand-strong" : "text-muted hover:text-ink"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
            <button
              type="button"
              onClick={signOut}
              className="rounded-lg px-2.5 py-1.5 font-medium text-muted transition-colors hover:text-ink"
            >
              Keluar
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
