import { Link, NavLink } from "react-router";

import { useMe } from "~/features/auth/use-me";
import { useAuthState } from "~/features/auth/session";
import { getSupabaseBrowserClient } from "~/shared/lib/supabase";

const NAV = [
  { to: "/", label: "Beranda", end: true },
  { to: "/leaderboard", label: "Leaderboard", end: false },
  { to: "/pantau", label: "Pantau", end: false },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { session } = useAuthState();
  const { me } = useMe();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1120px] items-center gap-6 px-4">
          <Link to="/" className="flex items-baseline gap-0.5 text-[20px] font-extrabold tracking-tight">
            JANGKAU
            <span aria-hidden className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-brand" />
          </Link>

          <nav className="hidden items-center gap-5 text-[14px] md:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  isActive ? "font-semibold text-ink" : "text-muted hover:text-ink"
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {session ? (
              <>
                <Link
                  to="/unggah"
                  className="rounded-lg bg-brand px-4 py-2 text-[14px] font-semibold text-white hover:bg-brand-strong"
                >
                  Unggah
                </Link>
                <Link to="/saya" className="text-[14px] text-muted hover:text-ink">
                  {me?.displayName ?? "Akun"}
                </Link>
              </>
            ) : (
              <>
                <Link to="/masuk" className="text-[14px] text-muted hover:text-ink">
                  Masuk
                </Link>
                <Link
                  to="/daftar"
                  className="rounded-lg bg-brand px-4 py-2 text-[14px] font-semibold text-white hover:bg-brand-strong"
                >
                  Daftar
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1120px] flex-1 px-4 py-8">{children}</main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center gap-4 px-4 py-6 text-[13px] text-muted">
          <span>Jangkau — bantuan tepat sasaran untuk lokasi bencana.</span>
          <span className="ml-auto">Data demo. Pencairan dana disimulasikan.</span>
          {session ? (
            <button
              type="button"
              onClick={() => void getSupabaseBrowserClient().auth.signOut()}
              className="underline hover:text-ink"
            >
              Keluar
            </button>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
