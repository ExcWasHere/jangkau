import type { Route } from "./+types/root";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";

import { DEFAULT_LOCALE, DEFAULT_THEME, type Locale, type Theme } from "~/i18n/config";
import { I18nProvider, createTranslator, readThemeCookie, resolveLocale } from "~/i18n";
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

/**
 * Bahasa dan tema ditentukan di server dari cookie, sehingga HTML pertama
 * sudah memakai bahasa dan tema yang benar. Tanpa ini, pengguna mode terang
 * melihat kedip gelap setiap kali berpindah halaman.
 */
export async function loader({ request }: Route.LoaderArgs) {
  return {
    locale: resolveLocale(request),
    theme: readThemeCookie(request.headers.get("cookie")) ?? DEFAULT_THEME,
  };
}

/** Nilai yang dipakai bila loader belum jalan (mis. halaman galat). */
function useRootPreferences(): { locale: Locale; theme: Theme } {
  const data = useRouteLoaderData<typeof loader>("root");
  return {
    locale: data?.locale ?? DEFAULT_LOCALE,
    theme: data?.theme ?? DEFAULT_THEME,
  };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { locale, theme } = useRootPreferences();

  return (
    <html lang={locale} data-theme={theme === "system" ? "dark" : theme}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content={theme === "light" ? "#ffffff" : "#0a0a0b"} />
        <Meta />
        <Links />
      </head>
      <body className="min-h-dvh bg-canvas text-ink antialiased">
        {/*
          Hanya `system` yang perlu diselesaikan di klien; nilai `dark` dan
          `light` sudah ditulis di atribut html oleh server. Skrip ini berjalan
          sebelum paint sehingga tidak ada kedip.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=document.documentElement;if(d.dataset.theme==="dark"&&localStorage.getItem("jangkau-theme")==="system"){d.dataset.theme=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";}}catch(e){}})();`,
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
  const { locale } = useRootPreferences();

  return (
    <I18nProvider locale={locale}>
      <Outlet />
    </I18nProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { locale } = useRootPreferences();
  const t = createTranslator(locale);

  let title = t("common.errorTitle");
  let detail = t("common.errorDetail");

  if (isRouteErrorResponse(error)) {
    title = error.status === 404 ? t("common.notFoundTitle") : `Error ${error.status}`;
    detail = error.status === 404 ? t("common.notFoundDetail") : error.statusText;
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
        {t("common.backToHome")}
      </a>
    </main>
  );
}
