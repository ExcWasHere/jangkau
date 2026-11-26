import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { isSupabaseConfigured } from "../lib/env";
import { useRedirectIfAuthenticated } from "../lib/session";
import { getSupabaseBrowserClient } from "../lib/supabase";

export default function Login() {
  const navigate = useNavigate();
  const { ready: sessionReady } = useRedirectIfAuthenticated();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      navigate("/laporan", { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal masuk");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6">
      <div>
        <Link to="/" className="text-lg font-extrabold tracking-tight">
          Jangkau<span className="text-brand">.</span>
        </Link>
        <h1 className="mt-6 text-2xl font-bold">Masuk</h1>
        <p className="mt-1 text-sm text-muted">
          Pelapor, organisasi, dan admin memakai pintu yang sama.
        </p>
      </div>

      {!isSupabaseConfigured && (
        <p className="rounded-lg border border-brand-line bg-brand-soft p-3 text-sm text-brand-strong">
          Supabase belum dikonfigurasi. Isi <code>VITE_SUPABASE_URL</code> dan{" "}
          <code>VITE_SUPABASE_ANON_KEY</code> di <code>apps/web/.env</code>.
        </p>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-lg border border-line px-3 py-2 font-normal outline-none focus:border-brand"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Kata sandi
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-lg border border-line px-3 py-2 font-normal outline-none focus:border-brand"
          />
        </label>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !isSupabaseConfigured || !sessionReady}
          className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50"
        >
          {busy || !sessionReady ? "Memproses…" : "Masuk"}
        </button>
      </form>

      <p className="text-sm text-muted">
        Belum punya akun?{" "}
        <Link to="/daftar" className="font-semibold text-brand hover:underline">
          Daftar
        </Link>
      </p>
    </main>
  );
}
