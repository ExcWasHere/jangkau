import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router";

import { useMe } from "~/features/auth/use-me";
import { usePendingClaim } from "~/features/donate/pending-claim";
import { NotificationBell } from "~/features/notifications/bell";
import { OfflineIndicator } from "~/features/offline/indicator";
import { useOfflineSync } from "~/features/offline/use-offline-sync";
import { useAuthState } from "~/features/auth/session";
import { useT } from "~/i18n";
import { getSupabaseBrowserClient } from "~/shared/lib/supabase";
import { PreferencesMenu } from "./preferences";
import { ToastProvider } from "~/shared/ui/toast";

const NAV_KEYS = [
  { to: "/", key: "nav.home", end: true },
  { to: "/leaderboard", key: "nav.leaderboard", end: false },
  { to: "/pantau", key: "nav.pantau", end: false },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  const { session } = useAuthState();
  const { me } = useMe();
  // Klaim donasi tamu dijalankan di layout supaya berlaku untuk login lewat
  // email maupun Google, di halaman mana pun pengguna mendarat.
  usePendingClaim();
  // Sinkronisasi antrean offline dipasang di layout supaya berjalan di halaman
  // mana pun, bukan hanya saat pengguna membuka halaman unggah.
  const offline = useOfflineSync();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Menu ponsel harus tertutup setelah berpindah halaman, kalau tidak
  // panelnya menutupi konten yang baru dibuka.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  return (
    <ToastProvider>
      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-40 border-b border-line bg-canvas/90 backdrop-blur">
          <div className="mx-auto flex h-16 w-full max-w-[1120px] items-center gap-4 px-4">
            <Link
              to="/"
              className="flex items-baseline gap-0.5 text-[20px] font-extrabold tracking-tight"
            >
              JANGKAU
              <span aria-hidden className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-brand" />
            </Link>

            <nav className="hidden items-center gap-5 text-[14px] md:flex">
              {NAV_KEYS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    isActive ? "font-semibold text-ink" : "text-muted hover:text-ink"
                  }
                >
                  {t(item.key)}
                </NavLink>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-2">
              <NotificationBell />
              <PreferencesMenu />

              {session ? (
                <>
                  <Link
                    to="/unggah"
                    className="hidden rounded-lg bg-brand px-4 py-2 text-[14px] font-semibold text-white hover:bg-brand-strong sm:block"
                  >
                    {t("nav.upload")}
                  </Link>
                  {me?.distributor ? (
                    <Link
                      to="/dashboard"
                      className="hidden text-[14px] text-muted hover:text-ink sm:block"
                    >
                      {t("dashboard.title")}
                    </Link>
                  ) : (
                    <Link
                      to="/konfirmasi"
                      className="hidden text-[14px] text-muted hover:text-ink sm:block"
                    >
                      {t("funds.taskTitle")}
                    </Link>
                  )}
                  <Link
                    to="/saya"
                    className="hidden max-w-[120px] truncate text-[14px] text-muted hover:text-ink sm:block"
                  >
                    {me?.displayName ?? t("nav.account")}
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    to="/masuk"
                    className="hidden text-[14px] text-muted hover:text-ink sm:block"
                  >
                    {t("nav.signIn")}
                  </Link>
                  <Link
                    to="/daftar"
                    className="hidden rounded-lg bg-brand px-4 py-2 text-[14px] font-semibold text-white hover:bg-brand-strong sm:block"
                  >
                    {t("nav.signUp")}
                  </Link>
                </>
              )}

              <button
                type="button"
                onClick={() => setMenuOpen((value) => !value)}
                aria-expanded={menuOpen}
                aria-controls="mobile-menu"
                aria-label={menuOpen ? t("nav.closeMenu") : t("nav.openMenu")}
                className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-muted md:hidden"
              >
                {menuOpen ? "✕" : "☰"}
              </button>
            </div>
          </div>

          {menuOpen ? (
            <nav
              id="mobile-menu"
              className="border-t border-line bg-surface px-4 py-3 md:hidden"
            >
              <ul className="flex flex-col gap-1 text-[14px]">
                {NAV_KEYS.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      className="block rounded-lg px-2 py-2 text-muted hover:bg-surface-2 hover:text-ink"
                    >
                      {t(item.key)}
                    </NavLink>
                  </li>
                ))}
                <li>
                  <NavLink
                    to={session ? "/unggah" : "/masuk"}
                    className="block rounded-lg px-2 py-2 text-muted hover:bg-surface-2 hover:text-ink"
                  >
                    {session ? t("nav.upload") : t("nav.signIn")}
                  </NavLink>
                </li>
                <li>
                  <NavLink
                    to={session ? "/saya" : "/daftar"}
                    className="block rounded-lg px-2 py-2 text-muted hover:bg-surface-2 hover:text-ink"
                  >
                    {session ? t("nav.account") : t("nav.signUp")}
                  </NavLink>
                </li>
              </ul>
            </nav>
          ) : null}
        </header>

        <OfflineIndicator
          pending={offline.pending}
          syncing={offline.syncing}
          online={offline.online}
          onSync={() => void offline.syncNow()}
        />

        <main className="mx-auto w-full max-w-[1120px] flex-1 px-4 py-8">{children}</main>

        <footer className="border-t border-line">
          <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center gap-4 px-4 py-6 text-[13px] text-muted">
            <span>{t("footer.tagline")}</span>
            <span className="ml-auto">{t("footer.demoNote")}</span>
            {session ? (
              <button
                type="button"
                onClick={() => void getSupabaseBrowserClient().auth.signOut()}
                className="underline hover:text-ink"
              >
                {t("nav.signOut")}
              </button>
            ) : null}
          </div>
        </footer>
      </div>
    </ToastProvider>
  );
}
