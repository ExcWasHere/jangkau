import type { Route } from "./+types/root";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
  },
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0a0a0b" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-dvh bg-canvas text-ink antialiased">
        {/*
          Tema dipasang sebelum paint supaya tidak ada kedip terang→gelap.
          Pilihan pengguna di localStorage menang atas default gelap.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("jangkau-theme")||"dark";document.documentElement.dataset.theme=t==="light"?"light":"dark";}catch(e){document.documentElement.dataset.theme="dark";}`,
          }}
        />
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Terjadi kesalahan";
  let detail = "Halaman ini gagal dimuat.";

  if (isRouteErrorResponse(error)) {
    title = error.status === 404 ? "Halaman tidak ditemukan" : `Error ${error.status}`;
    detail = error.status === 404 ? "Alamat yang kamu buka tidak ada." : error.statusText;
  } else if (import.meta.env.DEV && error instanceof Error) {
    detail = error.message;
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-6">
      <p className="text-sm font-semibold tracking-wide text-brand-text uppercase">Jangkau</p>
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="text-muted">{detail}</p>
      <a
        href="/"
        className="w-fit rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-strong"
      >
        Kembali ke beranda
      </a>
    </main>
  );
}
