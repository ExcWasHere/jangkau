import { Link, NavLink } from "react-router";

import { getSupabaseBrowserClient } from "~/shared/lib/supabase";

const NAV = [
  { to: "/lapor", label: "Lapor" },
  { to: "/laporan", label: "Laporan saya" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  async function signOut() {
    await getSupabaseBrowserClient().auth.signOut();
    window.location.href = "/";
  }

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-10 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="text-base font-extrabold tracking-tight">
            Jangkau<span className="text-brand">.</span>
          </Link>

          <nav className="flex items-center gap-1 text-sm">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 font-medium ${
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
              className="rounded-lg px-3 py-1.5 font-medium text-muted hover:text-ink"
            >
              Keluar
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
    </div>
  );
}
