import { useState } from "react";
import { Link, useNavigate } from "react-router";
import type { Route } from "./+types/login";

import { isSupabaseConfigured } from "~/shared/lib/env";
import { useRedirectIfAuthenticated } from "~/features/auth/session";
import { getSupabaseBrowserClient } from "~/shared/lib/supabase";
import { translatorFromMatches, useT } from "~/i18n";

export function meta({ matches }: Route.MetaArgs) {
  const t = translatorFromMatches(matches);
  return [{ title: t("meta.signInTitle") }];
}

export default function Login() {
  const { t } = useT();
  const navigate = useNavigate();
  const { ready: sessionReady } = useRedirectIfAuthenticated();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signInWithGoogle() {
    setError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/` },
      });
      if (oauthError) throw oauthError;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("auth.googleFailed"));
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      navigate("/", { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("auth.signInFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6">
      <div>
        <Link to="/" className="text-lg font-extrabold tracking-tight">
          JANGKAU
          <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
        </Link>
        <h1 className="mt-6 text-2xl font-bold">{t("auth.signInTitle")}</h1>
        <p className="mt-1 text-sm text-muted">{t("auth.signInIntro")}</p>
      </div>

      {!isSupabaseConfigured && (
        <p className="rounded-lg border border-brand-line bg-brand-soft p-3 text-sm text-brand-text">
          {t("auth.supabaseMissing")}
        </p>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("auth.email")}
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2 font-normal outline-none focus:border-brand"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("auth.password")}
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-lg border border-line bg-surface px-3 py-2 font-normal outline-none focus:border-brand"
          />
        </label>

        {error ? (
          <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy || !isSupabaseConfigured || !sessionReady}
          className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50"
        >
          {busy || !sessionReady ? t("auth.processing") : t("auth.signIn")}
        </button>
      </form>

      <div className="flex items-center gap-3 text-[12px] text-muted">
        <span className="h-px flex-1 bg-line" />
        {t("auth.or")}
        <span className="h-px flex-1 bg-line" />
      </div>

      <button
        type="button"
        disabled={busy || !isSupabaseConfigured}
        onClick={() => void signInWithGoogle()}
        className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:border-brand-line disabled:opacity-50"
      >
        {t("auth.withGoogle")}
      </button>

      <p className="text-sm text-muted">
        {t("auth.noAccount")}{" "}
        <Link to="/daftar" className="font-semibold text-brand-text hover:underline">
          {t("auth.signUp")}
        </Link>
      </p>
    </main>
  );
}
