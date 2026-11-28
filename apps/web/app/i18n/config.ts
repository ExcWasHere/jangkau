/**
 * Konfigurasi bahasa dan tema.
 *
 * Urutan penentuan bahasa (PRD §9): pilihan pengguna (cookie/localStorage) →
 * `Accept-Language` → Indonesia. Cookie dipakai supaya SSR merender bahasa yang
 * benar pada byte pertama, tanpa kedip bahasa.
 */

export const LOCALES = ["id", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "id";

export const LOCALE_COOKIE = "jangkau-locale";
export const THEME_COOKIE = "jangkau-theme";

export const THEMES = ["dark", "light", "system"] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "dark";

/** Nama bahasa ditulis dalam bahasanya sendiri, bukan diterjemahkan. */
export const LOCALE_LABELS: Record<Locale, string> = {
  id: "Bahasa Indonesia",
  en: "English",
};

/** Tag BCP 47 untuk `Intl`. */
export const INTL_LOCALE: Record<Locale, string> = {
  id: "id-ID",
  en: "en-GB",
};

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "id" || value === "en";
}

export function isTheme(value: string | null | undefined): value is Theme {
  return value === "dark" || value === "light" || value === "system";
}

/**
 * `Accept-Language: en-GB,en;q=0.9,id;q=0.8` → `en`.
 * Hanya dua bahasa yang didukung; selain itu jatuh ke default.
 */
export function negotiateLocale(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;

  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const quality = params
        .map((param) => param.trim())
        .find((param) => param.startsWith("q="))
        ?.slice(2);
      return { tag: tag.trim().toLowerCase(), quality: quality ? Number(quality) : 1 };
    })
    .filter((entry) => entry.tag.length > 0 && Number.isFinite(entry.quality))
    .sort((a, b) => b.quality - a.quality);

  for (const entry of ranked) {
    const base = entry.tag.split("-")[0];
    if (isLocale(base)) return base;
  }

  return DEFAULT_LOCALE;
}
