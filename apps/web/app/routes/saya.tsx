import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/saya";

import { RequireAuth } from "~/features/auth/guards";
import { useMe } from "~/features/auth/use-me";
import { useAuthState } from "~/features/auth/session";
import { formatRupiah } from "~/features/feed/api";
import { apiFetch } from "~/shared/api/client";
import { translatorFromMatches, useT } from "~/i18n";
import { AppShell } from "~/shared/layout/app-shell";

export function meta({ matches }: Route.MetaArgs) {
  const t = translatorFromMatches(matches);
  return [{ title: t("meta.accountTitle") }];
}

const BADGE_KEY = {
  reporter: "account.badgeReporter",
  funder: "account.badgeFunder",
} as const;

const LABEL_KEY = {
  organization: "event.labelOrganization",
  volunteer: "event.labelVolunteer",
  creator: "event.labelCreator",
} as const;

const VERIFICATION_KEY = {
  unverified: "account.verificationUnverified",
  pending: "account.verificationPending",
  verified: "account.verificationVerified",
  rejected: "account.verificationRejected",
  suspended: "account.verificationSuspended",
} as const;

type DonationHistory = {
  id: string;
  amount: number;
  status: string;
  paid_at: string | null;
  created_at: string;
  disaster_events: { title: string } | null;
};

function DonationHistorySection() {
  const { t, locale } = useT();
  const { token } = useAuthState();
  const [items, setItems] = useState<DonationHistory[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!token) return;
    let active = true;

    apiFetch<{ items: DonationHistory[] }>("/donations", { token })
      .then((result) => {
        if (active) setItems(result.items);
      })
      .catch(() => {
        // Riwayat donasi pelengkap; kegagalan tidak menggagalkan halaman akun.
      })
      .finally(() => {
        if (active) setLoaded(true);
      });

    return () => {
      active = false;
    };
  }, [token]);

  return (
    <section aria-labelledby="donasi-saya">
      <h2 id="donasi-saya" className="text-[16px] font-semibold">
        {t("donate.historyTitle")}
      </h2>

      {loaded && items.length === 0 ? (
        <p className="mt-2 text-[13px] text-muted">{t("donate.historyEmpty")}</p>
      ) : (
        <ul className="mt-2 flex flex-col divide-y divide-line rounded-xl border border-line bg-surface">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-baseline gap-2 px-4 py-2.5 text-[13px]">
              <span className="font-semibold">{formatRupiah(item.amount, locale)}</span>
              <span className="min-w-0 flex-1 truncate text-muted">
                {item.disaster_events?.title ?? "—"}
              </span>
              <span
                className={`text-[11px] font-semibold ${
                  item.status === "paid" ? "text-ok" : "text-warn"
                }`}
              >
                {item.status === "paid" ? t("donate.paid") : t("donate.waiting")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AccountBody() {
  const { t } = useT();
  const { me, isVerifiedDistributor } = useMe();
  if (!me) return null;

  const role =
    me.accountType === "distributor" ? t("account.roleDistributor") : t("account.roleResident");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-[26px] font-bold">{me.displayName}</h1>
        <p className="text-[13px] text-muted">
          {role}
          {me.isAdmin ? ` · ${t("account.roleAdmin")}` : ""}
          {me.email ? ` · ${me.email}` : ""}
        </p>
      </header>

      <section aria-labelledby="lencana">
        <h2 id="lencana" className="text-[16px] font-semibold">
          {t("account.badgesTitle")}
        </h2>
        {me.badges.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted">{t("account.badgesEmpty")}</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {me.badges.map((badge) => (
              <li
                key={badge}
                className="rounded-full border border-line bg-surface px-3 py-1 text-[12px] font-semibold"
              >
                {t(BADGE_KEY[badge] ?? "account.badgeReporter")}
              </li>
            ))}
          </ul>
        )}
      </section>

      {me.distributor ? (
        <section aria-labelledby="penyalur" className="rounded-xl border border-line bg-surface p-5">
          <h2 id="penyalur" className="text-[16px] font-semibold">
            {t("account.distributorTitle")}
          </h2>
          <p className="mt-1 text-[13px] text-muted">
            {t(LABEL_KEY[me.distributor.label] ?? "event.labelVolunteer")} ·{" "}
            {t(VERIFICATION_KEY[me.distributor.verification_status] ?? "account.verificationUnverified")}
          </p>

          {me.distributor.bio ? (
            <p className="mt-2 text-[14px] leading-relaxed">{me.distributor.bio}</p>
          ) : null}

          {isVerifiedDistributor ? (
            <p className="mt-3 text-[13px] text-ok">{t("account.distributorVerified")}</p>
          ) : (
            <p className="mt-3 text-[13px] text-muted">
              {t("account.distributorPending")}
              {me.distributor.rejection_reason
                ? ` ${t("account.distributorRejection", { reason: me.distributor.rejection_reason })}`
                : ""}
            </p>
          )}
        </section>
      ) : null}

      <DonationHistorySection />

      <p className="text-[13px] text-muted">
        <Link to="/" className="underline hover:text-ink">
          {t("common.backToHome")}
        </Link>
      </p>
    </div>
  );
}

export default function SayaPage() {
  return (
    <AppShell>
      <RequireAuth>
        <AccountBody />
      </RequireAuth>
    </AppShell>
  );
}
