import { useState } from "react";
import { Link, useNavigate } from "react-router";

import { isSupabaseConfigured } from "~/shared/lib/env";
import { useRedirectIfAuthenticated } from "~/features/auth/session";
import type { AccountType, DistributorLabel } from "@jangkau/shared";

import { getSupabaseBrowserClient } from "~/shared/lib/supabase";

export default function Register() {
  const navigate = useNavigate();
  useRedirectIfAuthenticated();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [accountType, setAccountType] = useState<AccountType>("resident");
  const [label, setLabel] = useState<DistributorLabel>("volunteer");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, phone, account_type: accountType },
          emailRedirectTo: `${window.location.origin}/`,
        },
      });
      if (signUpError) throw signUpError;

      // Bila konfirmasi email dimatikan, sesi langsung tersedia.
      if (data.session) {
        navigate(accountType === "distributor" ? "/saya" : "/", { replace: true });
        return;
      }
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal mendaftar");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-6">
        <h1 className="text-2xl font-bold">Cek email kamu</h1>
        <p className="text-sm text-muted">
          Tautan konfirmasi dikirim ke <strong>{email}</strong>. Setelah dikonfirmasi, kamu bisa
          masuk dan mulai melapor.
        </p>
        <Link to="/masuk" className="font-semibold text-brand hover:underline">
          Ke halaman masuk
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div>
        <Link to="/" className="text-lg font-extrabold tracking-tight">
          Jangkau<span className="text-brand">.</span>
        </Link>
        <h1 className="mt-6 text-2xl font-bold">Daftar akun</h1>
        <p className="mt-1 text-sm text-muted">
          Pilih peran utamamu. Keduanya bisa melaporkan bencana dan berdonasi.
        </p>
      </div>

      {!isSupabaseConfigured && (
        <p className="rounded-lg border border-brand-line bg-brand-soft p-3 text-sm text-brand-strong">
          Supabase belum dikonfigurasi. Isi <code>VITE_SUPABASE_URL</code> dan{" "}
          <code>VITE_SUPABASE_ANON_KEY</code> di <code>apps/web/.env</code>.
        </p>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Aku mendaftar sebagai</legend>

          <label
            className={`cursor-pointer rounded-xl border px-4 py-3 ${
              accountType === "resident" ? "border-brand bg-brand-soft" : "border-line"
            }`}
          >
            <input
              type="radio"
              name="accountType"
              value="resident"
              checked={accountType === "resident"}
              onChange={() => setAccountType("resident")}
              className="sr-only"
            />
            <span className="block text-[15px] font-semibold">Warga</span>
            <span className="mt-0.5 block text-[13px] text-muted">
              Laporkan kondisi bencana di sekitarmu dan bantu lewat donasi.
            </span>
          </label>

          <label
            className={`cursor-pointer rounded-xl border px-4 py-3 ${
              accountType === "distributor" ? "border-brand bg-brand-soft" : "border-line"
            }`}
          >
            <input
              type="radio"
              name="accountType"
              value="distributor"
              checked={accountType === "distributor"}
              onChange={() => setAccountType("distributor")}
              className="sr-only"
            />
            <span className="block text-[15px] font-semibold">Penyalur Bantuan</span>
            <span className="mt-0.5 block text-[13px] text-muted">
              Kelola posko dan salurkan bantuan ke lokasi bencana.
            </span>
          </label>

          <p className="text-[12px] text-muted">
            Keduanya bisa melaporkan bencana dan berdonasi. Penyalur bantuan bisa mengajukan diri
            sebagai penanggung jawab setelah terverifikasi.
          </p>
        </fieldset>

        {accountType === "distributor" ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Jenis penyalur</legend>
            {(
              [
                ["organization", "Organisasi Tanggap Bencana", "Siapkan akta, SK, dan KTP penanggung jawab"],
                ["volunteer", "Relawan", "Siapkan KTP dan bukti kegiatan"],
                ["creator", "Kreator", "Siapkan tautan sosial dan statistik pengikut"],
              ] as const
            ).map(([value, title, hint]) => (
              <label
                key={value}
                className={`cursor-pointer rounded-lg border px-3 py-2 ${
                  label === value ? "border-brand bg-brand-soft" : "border-line"
                }`}
              >
                <input
                  type="radio"
                  name="label"
                  value={value}
                  checked={label === value}
                  onChange={() => setLabel(value)}
                  className="sr-only"
                />
                <span className="block text-[14px] font-semibold">{title}</span>
                <span className="block text-[12px] text-muted">{hint}</span>
              </label>
            ))}
          </fieldset>
        ) : null}

        <label className="flex flex-col gap-1 text-sm font-medium">
          Nama lengkap
          <input
            required
            minLength={3}
            autoComplete="name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            className="rounded-lg border border-line px-3 py-2 font-normal outline-none focus:border-brand"
          />
        </label>

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
          Nomor HP
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="08xx"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="rounded-lg border border-line px-3 py-2 font-normal outline-none focus:border-brand"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Kata sandi
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-lg border border-line px-3 py-2 font-normal outline-none focus:border-brand"
          />
          <span className="text-xs font-normal text-muted">Minimal 8 karakter.</span>
        </label>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !isSupabaseConfigured}
          className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50"
        >
          {busy ? "Memproses…" : "Daftar"}
        </button>
      </form>

      <p className="text-sm text-muted">
        Sudah punya akun?{" "}
        <Link to="/masuk" className="font-semibold text-brand hover:underline">
          Masuk
        </Link>
      </p>
    </main>
  );
}
