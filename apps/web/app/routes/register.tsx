import { useState } from "react";
import { Link, useNavigate } from "react-router";
import type { Route } from "./+types/register";

import type { AccountType, DistributorLabel } from "@jangkau/shared";

import { isSupabaseConfigured } from "~/shared/lib/env";
import { useRedirectIfAuthenticated } from "~/features/auth/session";
import { getSupabaseBrowserClient } from "~/shared/lib/supabase";
import { translatorFromMatches, useT } from "~/i18n";

export function meta({ matches }: Route.MetaArgs) {
  const t = translatorFromMatches(matches);
  return [{ title: t("meta.signUpTitle") }];
}

export default function Register() {
  const { t } = useT();
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
      setError(cause instanceof Error ? cause.message : t("auth.signUpFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-6">
        <h1 className="text-2xl font-bold">{t("auth.checkEmailTitle")}</h1>
        <p className="text-sm text-muted">{t("auth.checkEmailBody", { email })}</p>
        <Link to="/masuk" className="font-semibold text-brand-text hover:underline">
          {t("auth.goToSignIn")}
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div>
        <Link to="/" className="text-lg font-extrabold tracking-tight">
          JANGKAU
          <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
        </Link>
        <h1 className="mt-6 text-2xl font-bold">{t("auth.signUpTitle")}</h1>
        <p className="mt-1 text-sm text-muted">{t("auth.signUpIntro")}</p>
      </div>

      {!isSupabaseConfigured && (
        <p className="rounded-lg border border-brand-line bg-brand-soft p-3 text-sm text-brand-text">
          {t("auth.supabaseMissing")}
        </p>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">{t("auth.accountTypeLegend")}</legend>

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
            <span className="block text-[15px] font-semibold">{t("auth.accountTypeResident")}</span>
            <span className="mt-0.5 block text-[13px] text-muted">
              {t("auth.accountTypeResidentHint")}
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
            <span className="block text-[15px] font-semibold">{t("auth.accountTypeDistributor")}</span>
            <span className="mt-0.5 block text-[13px] text-muted">
              {t("auth.accountTypeDistributorHint")}
            </span>
          </label>

          <p className="text-[12px] text-muted">{t("auth.accountTypeNote")}</p>
        </fieldset>

        {accountType === "distributor" ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">{t("auth.labelLegend")}</legend>
            {(
              [
                ["organization", "auth.labelOrganization", "auth.labelOrganizationHint"],
                ["volunteer", "auth.labelVolunteer", "auth.labelVolunteerHint"],
                ["creator", "auth.labelCreator", "auth.labelCreatorHint"],
              ] as const
            ).map(([value, titleKey, hintKey]) => (
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
                <span className="block text-[14px] font-semibold">{t(titleKey)}</span>
                <span className="block text-[12px] text-muted">{t(hintKey)}</span>
              </label>
            ))}
          </fieldset>
        ) : null}

        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("auth.fullName")}
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
          {t("auth.email")}
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
          {t("auth.phone")}
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={t("auth.phonePlaceholder")}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="rounded-lg border border-line px-3 py-2 font-normal outline-none focus:border-brand"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("auth.password")}
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-lg border border-line px-3 py-2 font-normal outline-none focus:border-brand"
          />
          <span className="text-xs font-normal text-muted">min 8</span>
        </label>

        {error && (
          <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !isSupabaseConfigured}
          className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-50"
        >
          {busy ? t("auth.processing") : t("auth.signUp")}
        </button>
      </form>

      <p className="text-sm text-muted">
        {t("auth.hasAccount")}{" "}
        <Link to="/masuk" className="font-semibold text-brand-text hover:underline">
          {t("auth.signIn")}
        </Link>
      </p>
    </main>
  );
}
