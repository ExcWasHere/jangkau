import { useEffect, useRef, useState } from "react";

import { useAuthState } from "~/features/auth/session";
import { useT } from "~/i18n";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_LABELS,
  LOCALES,
  THEME_COOKIE,
  type Locale,
  type Theme,
} from "~/i18n/config";
import { apiFetch } from "~/shared/api/client";

const THEME_KEYS: Theme[] = ["dark", "light", "system"];

function writeCookie(name: string, value: string) {
  // Satu tahun, path root, SameSite=Lax: cukup untuk preferensi tampilan.
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`;
}

function applyTheme(theme: Theme) {
  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark"
      : theme;

  document.documentElement.dataset.theme = resolved;
  localStorage.setItem("jangkau-theme", theme);
  writeCookie(THEME_COOKIE, theme);
}

/**
 * Pemilih bahasa dan tema. Preferensi berlaku seketika di perangkat ini dan
 * disimpan ke akun bila pengguna login, supaya ikut di perangkat lain.
 */
export function PreferencesMenu() {
  const { t, locale } = useT();
  const { token } = useAuthState();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem("jangkau-theme");
    if (stored === "dark" || stored === "light" || stored === "system") setTheme(stored);
  }, []);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function changeTheme(next: Theme) {
    setTheme(next);
    applyTheme(next);
    void persist({ theme: next });
  }

  function changeLocale(next: Locale) {
    writeCookie(LOCALE_COOKIE, next);
    void persist({ locale: next });
    // Bahasa memengaruhi HTML yang dirender server, jadi halaman dimuat ulang.
    window.location.reload();
  }

  async function persist(patch: { theme?: Theme; locale?: Locale }) {
    if (!token) return;
    try {
      await apiFetch("/me/preferences", {
        method: "PATCH",
        token,
        body: JSON.stringify(patch),
      });
    } catch {
      // Preferensi lokal sudah berlaku; kegagalan menyimpan ke akun bukan
      // alasan mengganggu pengguna dengan galat.
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${t("preferences.language")} / ${t("preferences.theme")}`}
        className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-muted hover:text-ink"
      >
        {locale.toUpperCase()}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={`${t("preferences.language")} / ${t("preferences.theme")}`}
          className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-line bg-surface p-3 shadow-xl"
        >
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-[11px] font-bold tracking-wide text-subtle uppercase">
              {t("preferences.language")}
            </legend>
            {LOCALES.map((value) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-surface-2"
              >
                <input
                  type="radio"
                  name="locale"
                  value={value}
                  checked={locale === value}
                  onChange={() => changeLocale(value)}
                />
                {LOCALE_LABELS[value]}
              </label>
            ))}
          </fieldset>

          <hr className="my-2 border-line" />

          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-[11px] font-bold tracking-wide text-subtle uppercase">
              {t("preferences.theme")}
            </legend>
            {THEME_KEYS.map((value) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] hover:bg-surface-2"
              >
                <input
                  type="radio"
                  name="theme"
                  value={value}
                  checked={theme === value}
                  onChange={() => changeTheme(value)}
                />
                {value === "dark"
                  ? t("preferences.themeDark")
                  : value === "light"
                    ? t("preferences.themeLight")
                    : t("preferences.themeSystem")}
              </label>
            ))}
          </fieldset>
        </div>
      ) : null}
    </div>
  );
}

export { DEFAULT_LOCALE };
