import { createContext, useContext, useMemo } from "react";

import {
  DEFAULT_LOCALE,
  INTL_LOCALE,
  LOCALE_COOKIE,
  LOCALE_LABELS,
  LOCALES,
  THEME_COOKIE,
  isLocale,
  isTheme,
  negotiateLocale,
  type Locale,
  type Theme,
} from "./config";
import { en } from "./en";
import { id, type Dict } from "./id";

const DICTIONARIES: Record<Locale, Dict> = { id, en };

/**
 * Semua jalur kunci yang valid, mis. `"feed.seeAll"` atau `"event.picTitle"`.
 * Dihasilkan dari kamus Indonesia, jadi kunci yang salah langsung gagal
 * typecheck alih-alih menampilkan teks kosong saat runtime.
 */
type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? Prefix extends ""
      ? K
      : `${Prefix}.${K}`
    : Leaves<T[K], Prefix extends "" ? K : `${Prefix}.${K}`>;
}[keyof T & string];

export type DictKey = Leaves<Dict>;

export type TranslateVars = Record<string, string | number>;

export type Translator = (key: DictKey, vars?: TranslateVars) => string;

function lookup(dictionary: Dict, key: string): string | undefined {
  const value = key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined,
      dictionary,
    );

  return typeof value === "string" ? value : undefined;
}

/** Mengganti `{nama}` dengan nilai. Placeholder tanpa nilai dibiarkan apa adanya. */
function interpolate(template: string, vars: TranslateVars | undefined): string {
  if (!vars) return template;

  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

export function createTranslator(locale: Locale): Translator {
  const dictionary = DICTIONARIES[locale];

  return (key, vars) => {
    const template = lookup(dictionary, key) ?? lookup(DICTIONARIES[DEFAULT_LOCALE], key);
    return template ? interpolate(template, vars) : key;
  };
}

// ---------------------------------------------------------------- React

type I18nValue = {
  locale: Locale;
  t: Translator;
  /** Tag `Intl` siap pakai untuk tanggal dan angka. */
  intlLocale: string;
};

const I18nContext = createContext<I18nValue>({
  locale: DEFAULT_LOCALE,
  t: createTranslator(DEFAULT_LOCALE),
  intlLocale: INTL_LOCALE[DEFAULT_LOCALE],
});

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const value = useMemo<I18nValue>(
    () => ({ locale, t: createTranslator(locale), intlLocale: INTL_LOCALE[locale] }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): I18nValue {
  return useContext(I18nContext);
}

// ---------------------------------------------------------------- preferensi

export function readLocaleCookie(cookieHeader: string | null | undefined): Locale | null {
  const value = readCookie(cookieHeader, LOCALE_COOKIE);
  return isLocale(value) ? value : null;
}

export function readThemeCookie(cookieHeader: string | null | undefined): Theme | null {
  const value = readCookie(cookieHeader, THEME_COOKIE);
  return isTheme(value) ? value : null;
}

function readCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }

  return null;
}

/** Urutan: cookie → Accept-Language → default. */
export function resolveLocale(request: Request): Locale {
  return readLocaleCookie(request.headers.get("cookie")) ?? negotiateLocale(request.headers.get("accept-language"));
}

export const localeLabels = LOCALE_LABELS;
export const supportedLocales = LOCALES;

/**
 * Penerjemah untuk fungsi `meta`. Route `meta` tidak berada di dalam provider,
 * jadi locale dibaca dari data loader route `root`.
 */
export function translatorFromMatches(
  matches: ReadonlyArray<{ id: string; data?: unknown } | undefined>,
): Translator {
  const root = matches.find((match) => match?.id === "root");
  const locale = (root?.data as { locale?: string } | undefined)?.locale;
  return createTranslator(isLocale(locale) ? locale : DEFAULT_LOCALE);
}
