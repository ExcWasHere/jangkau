import { Link } from "react-router";

import { useAuthState } from "~/features/auth/session";

/**
 * Header pemasaran. Latar selalu putih dengan garis tipis supaya tidak
 * berubah-ubah saat scroll — perubahan visual di halaman ini hanya
 * milik konten, bukan chrome.
 */
export function MarketingHeader() {
  const { session, ready } = useAuthState();
  const signedIn = ready && Boolean(session);

  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
        <Link to="/" className="group flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-[13px] font-bold text-white">
            J
          </span>
          <span className="text-[15px] font-bold tracking-tight">
            Jangkau
            <span className="text-brand">.</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 text-[13px] sm:flex">
          <a href="#cara-kerja" className="rounded-md px-2.5 py-1.5 text-muted hover:text-ink">
            Cara kerja
          </a>
          <a href="#fitur" className="rounded-md px-2.5 py-1.5 text-muted hover:text-ink">
            Fitur
          </a>
          <a href="#peran" className="rounded-md px-2.5 py-1.5 text-muted hover:text-ink">
            Peran
          </a>
        </nav>

        <div className="flex items-center gap-2 text-[13px]">
          <Link
            to={signedIn ? "/laporan" : "/masuk"}
            className="rounded-md px-3 py-1.5 font-medium text-muted transition-colors hover:text-ink"
          >
            {signedIn ? "Dasbor" : "Masuk"}
          </Link>
          <Link
            to={signedIn ? "/lapor" : "/daftar"}
            className="rounded-md bg-brand px-3.5 py-1.5 font-semibold text-white transition-colors hover:bg-brand-strong"
          >
            {signedIn ? "Buat laporan" : "Mulai lapor"}
          </Link>
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-line bg-canvas">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-end sm:justify-between sm:px-8">
        <div>
          <p className="text-sm font-semibold">Jangkau — Tim Isin Aq Yank</p>
          <p className="mt-1 max-w-md text-[13px] leading-relaxed text-muted">
            Politeknik Negeri Malang · STACK 2026, GDGoC ITB · Case 2. Prototipe memakai data
            sintetis; pencairan dana dan pembayaran berjalan dalam mode simulasi.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted">
          <Link to="/masuk" className="hover:text-ink">
            Masuk
          </Link>
          <Link to="/daftar" className="hover:text-ink">
            Daftar
          </Link>
          <a href="#cara-kerja" className="hover:text-ink">
            Cara kerja
          </a>
        </div>
      </div>
    </footer>
  );
}
