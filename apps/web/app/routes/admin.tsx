import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/admin";

import { useSession } from "~/features/auth/session";
import { translatorFromMatches, useT, type DictKey } from "~/i18n";
import { ApiError, apiFetch } from "~/shared/api/client";
import { AppShell } from "~/shared/layout/app-shell";
import { Skeleton } from "~/shared/ui/skeleton";
import { useToast } from "~/shared/ui/toast";

export function meta({ matches }: Route.MetaArgs) {
  const t = translatorFromMatches(matches);
  return [{ title: `${t("admin.title")} — ${t("meta.eventTitleSuffix")}` }];
}

type Stats = {
  pendingVerifications: number;
  pendingPicApplications: number;
  openContentReports: number;
  monitoredEvents: number;
  pendingDisbursements: number;
};

type VerificationItem = {
  profile: {
    profile_id: string;
    label: string;
    display_name: string;
    bio: string | null;
    home_city: string | null;
    contact_phone: string | null;
    social_url: string | null;
    follower_count: number | null;
    verification_status: string;
  };
  required: string[];
  documents: Array<{
    id: string;
    kind: string;
    url: string | null;
    review_status: string;
    rejection_reason: string | null;
  }>;
  allApproved: boolean;
};

type PicItem = {
  id: string;
  pitch: string | null;
  applied_at: string;
  disaster_events: { id: string; title: string; regency: string | null; province: string | null } | null;
  distributor_profiles: { label: string; display_name: string; verification_status: string } | null;
};

type ReportItem = {
  id: string;
  reason: string;
  note: string | null;
  created_at: string;
  event_id: string | null;
  disaster_events: { id: string; title: string } | null;
  profiles: { display_name: string } | null;
};

const REASON_KEYS: Record<string, DictKey> = {
  hoax: "admin.reasonHoax",
  duplicate: "admin.reasonDuplicate",
  irrelevant: "admin.reasonIrrelevant",
  graphic: "admin.reasonGraphic",
  other: "admin.reasonOther",
};

const DOC_KEYS: Record<string, DictKey> = {
  legal_deed: "dashboard.docKindLegalDeed",
  sk_kemenkumham: "dashboard.docKindSk",
  pic_identity: "dashboard.docKindPicIdentity",
  pic_selfie: "dashboard.docKindPicSelfie",
  org_letter: "dashboard.docKindOrgLetter",
  social_profile: "dashboard.docKindSocialProfile",
  follower_stats: "dashboard.docKindFollowerStats",
  field_proof: "dashboard.docKindFieldProof",
  other: "dashboard.docKindFieldProof",
};

type Tab = "verifications" | "pic" | "reports" | "funds";

type DisbursementItem = {
  id: string;
  seq: number;
  amount: number;
  status: string;
  purpose: string | null;
  is_simulated: boolean;
  spent: number;
  pic_assignments: {
    distributor_profiles: { display_name: string } | null;
    disaster_events: { title: string } | null;
  } | null;
};

function AdminBody() {
  const { t } = useT();
  const toast = useToast();
  const { token } = useSession();

  const [tab, setTab] = useState<Tab>("verifications");
  const [stats, setStats] = useState<Stats | null>(null);
  const [verifications, setVerifications] = useState<VerificationItem[]>([]);
  const [pics, setPics] = useState<PicItem[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [funds, setFunds] = useState<DisbursementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [s, v, p, r, d, dApproved] = await Promise.all([
        apiFetch<Stats>("/admin/stats", { token }),
        apiFetch<{ items: VerificationItem[] }>("/admin/verifications?status=pending", { token }),
        apiFetch<{ items: PicItem[] }>("/admin/pic-applications?status=applied", { token }),
        apiFetch<{ items: ReportItem[] }>("/admin/content-reports?status=open", { token }),
        apiFetch<{ items: DisbursementItem[] }>("/admin/disbursements?status=requested", { token }),
        apiFetch<{ items: DisbursementItem[] }>("/admin/disbursements?status=approved", { token }),
      ]);
      setStats(s);
      setVerifications(v.items);
      setPics(p.items);
      setReports(r.items);
      // Dua tahap ditampilkan sekaligus: yang menunggu persetujuan, dan yang
      // sudah disetujui tapi belum ditandai berpindah. Tanpa ini admin harus
      // menebak kapan menekan tombol kedua.
      setFunds([...d.items, ...dApproved.items]);
    } catch (cause) {
      toast.push(cause instanceof ApiError ? cause.message : t("common.loadFailed"), "error");
    } finally {
      setLoading(false);
    }
  }, [token, t, toast]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function decide(key: string, path: string, body: unknown) {
    if (!token) return;
    setBusy(key);
    try {
      await apiFetch(path, { method: "POST", token, body: JSON.stringify(body) });
      toast.push(t("admin.saved"), "success");
      await reload();
    } catch (cause) {
      toast.push(cause instanceof ApiError ? cause.message : t("common.loadFailed"), "error");
    } finally {
      setBusy(null);
    }
  }

  const TABS: Array<{ key: Tab; label: DictKey; count: number }> = [
    { key: "verifications", label: "admin.tabVerifications", count: stats?.pendingVerifications ?? 0 },
    { key: "pic", label: "admin.tabPic", count: stats?.pendingPicApplications ?? 0 },
    { key: "reports", label: "admin.tabReports", count: stats?.openContentReports ?? 0 },
    { key: "funds", label: "adminFunds.tab", count: stats?.pendingDisbursements ?? 0 },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-[26px] font-bold">{t("admin.title")}</h1>
        <p className="text-[13px] text-muted">{t("admin.intro")}</p>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["admin.statVerifications", stats?.pendingVerifications ?? 0],
          ["admin.statPic", stats?.pendingPicApplications ?? 0],
          ["admin.statReports", stats?.openContentReports ?? 0],
          ["admin.statMonitored", stats?.monitoredEvents ?? 0],
        ].map(([key, value]) => (
          <div key={key as string} className="rounded-xl border border-line bg-surface p-4">
            <dt className="text-[12px] text-muted">{t(key as DictKey)}</dt>
            <dd className="mt-1 text-[22px] font-bold">{value}</dd>
          </div>
        ))}
      </dl>

      <div role="tablist" aria-label={t("admin.title")} className="flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.key}
            role="tab"
            type="button"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className={`rounded-lg border px-3 py-1.5 text-[13px] font-semibold ${
              tab === item.key ? "border-brand bg-brand-soft text-brand-text" : "border-line text-muted"
            }`}
          >
            {t(item.label)}
            {item.count > 0 ? ` · ${item.count}` : ""}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : tab === "verifications" ? (
        verifications.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-[13px] text-muted">
            {t("admin.emptyVerifications")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {verifications.map((item) => (
              <li
                key={item.profile.profile_id}
                className="rounded-xl border border-line bg-surface p-4"
              >
                <p className="text-[15px] font-semibold">{item.profile.display_name}</p>
                <p className="text-[13px] text-muted">
                  {item.profile.label} · {item.profile.home_city ?? "—"}
                  {item.profile.social_url ? ` · ${item.profile.social_url}` : ""}
                  {item.profile.follower_count !== null
                    ? ` · ${item.profile.follower_count} followers`
                    : ""}
                </p>
                {item.profile.bio ? (
                  <p className="mt-1 text-[13px] text-muted">{item.profile.bio}</p>
                ) : null}

                <ul className="mt-3 flex flex-col divide-y divide-line">
                  {item.documents.map((doc) => (
                    <li key={doc.id} className="flex flex-wrap items-center gap-2 py-2 text-[13px]">
                      <span className="min-w-0 flex-1">
                        {t(DOC_KEYS[doc.kind] ?? "dashboard.docKindFieldProof")}
                      </span>
                      <span
                        className={`text-[11px] font-semibold ${
                          doc.review_status === "approved"
                            ? "text-ok"
                            : doc.review_status === "rejected"
                              ? "text-danger"
                              : "text-warn"
                        }`}
                      >
                        {doc.review_status}
                      </span>
                      {doc.url ? (
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[12px] font-semibold text-brand-text underline"
                        >
                          {t("admin.documentOpen")}
                        </a>
                      ) : null}
                      {/*
                        Tombol keputusan hanya untuk dokumen yang masih
                        menunggu. Tanpa syarat ini, admin bisa mengklik ulang
                        dokumen yang sudah disetujui dan mengira antrean tidak
                        berubah.
                      */}
                      {doc.review_status === "pending" ? (
                        <>
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() =>
                              void decide(
                                doc.id,
                                `/admin/verifications/${item.profile.profile_id}/documents/${doc.id}`,
                                { decision: "approved" },
                              )
                            }
                            className="rounded-lg border border-ok/40 px-2 py-1 text-[11px] font-semibold text-ok"
                          >
                            {t("admin.approve")}
                          </button>
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => {
                              const reason = window.prompt(t("admin.reasonPrompt")) ?? "";
                              if (!reason.trim()) return;
                              void decide(
                                doc.id,
                                `/admin/verifications/${item.profile.profile_id}/documents/${doc.id}`,
                                { decision: "rejected", reason },
                              );
                            }}
                            className="rounded-lg border border-danger/40 px-2 py-1 text-[11px] font-semibold text-danger"
                          >
                            {t("admin.reject")}
                          </button>
                        </>
                      ) : (
                        <span className="text-[11px] text-subtle">
                          {t(doc.review_status === "approved" ? "dashboard.docApproved" : "dashboard.docRejected")}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )
      ) : tab === "pic" ? (
        pics.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-[13px] text-muted">
            {t("admin.emptyPic")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pics.map((item) => (
              <li key={item.id} className="rounded-xl border border-line bg-surface p-4">
                <p className="text-[15px] font-semibold">
                  {item.distributor_profiles?.display_name ?? item.id}
                </p>
                <p className="text-[13px] text-muted">
                  {t("admin.picEvent")}:{" "}
                  <Link to={`/bencana/${item.disaster_events?.id}`} className="underline">
                    {item.disaster_events?.title ?? "—"}
                  </Link>
                </p>
                <p className="mt-2 text-[13px]">
                  <span className="font-semibold">{t("admin.picPitch")}: </span>
                  {item.pitch ?? "—"}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() =>
                      void decide(item.id, `/admin/pic-applications/${item.id}/decision`, {
                        decision: "approved",
                      })
                    }
                    className="rounded-lg bg-brand px-3 py-1.5 text-[12px] font-semibold text-white"
                  >
                    {t("admin.approve")}
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => {
                      const note = window.prompt(t("admin.reasonPrompt")) ?? "";
                      if (!note.trim()) return;
                      void decide(item.id, `/admin/pic-applications/${item.id}/decision`, {
                        decision: "rejected",
                        note,
                      });
                    }}
                    className="rounded-lg border border-danger/40 px-3 py-1.5 text-[12px] font-semibold text-danger"
                  >
                    {t("admin.reject")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : tab === "funds" ? (
        funds.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-[13px] text-muted">
            {t("adminFunds.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {funds.map((item) => (
              <li key={item.id} className="rounded-xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[15px] font-semibold">
                    {item.pic_assignments?.distributor_profiles?.display_name ?? "—"}
                  </span>
                  <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-semibold text-muted">
                    {t("funds.stage", { seq: item.seq })}
                  </span>
                  <span className="font-semibold">
                    {new Intl.NumberFormat("id-ID", {
                      style: "currency",
                      currency: "IDR",
                      maximumFractionDigits: 0,
                    }).format(item.amount)}
                  </span>
                </div>

                <p className="mt-1 text-[13px] text-muted">
                  {item.pic_assignments?.disaster_events?.title ?? "—"}
                </p>
                {item.purpose ? (
                  <p className="mt-1 text-[13px]">
                    <span className="font-semibold">{t("adminFunds.purpose")}: </span>
                    {item.purpose}
                  </p>
                ) : null}
                <p className="mt-1 text-[12px] text-muted">
                  {t("adminFunds.spent")}: {item.spent}
                </p>
                <p className="mt-1 text-[12px] text-warn">{t("adminFunds.simulatedNote")}</p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {item.status === "requested" ? (
                    <>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          void decide(item.id, `/admin/disbursements/${item.id}/decision`, {
                            decision: "approved",
                          })
                        }
                        className="rounded-lg bg-brand px-3 py-1.5 text-[12px] font-semibold text-white"
                      >
                        {t("adminFunds.approve")}
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => {
                          const note = window.prompt(t("adminFunds.notePrompt")) ?? "";
                          if (!note.trim()) return;
                          void decide(item.id, `/admin/disbursements/${item.id}/decision`, {
                            decision: "rejected",
                            note,
                          });
                        }}
                        className="rounded-lg border border-danger/40 px-3 py-1.5 text-[12px] font-semibold text-danger"
                      >
                        {t("adminFunds.reject")}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() =>
                        void decide(item.id, `/admin/disbursements/${item.id}/decision`, {
                          decision: "transferred",
                        })
                      }
                      className="rounded-lg bg-ok px-3 py-1.5 text-[12px] font-semibold text-black"
                    >
                      {t("adminFunds.transfer")}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )
      ) : reports.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-[13px] text-muted">
          {t("admin.emptyReports")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {reports.map((item) => (
            <li key={item.id} className="rounded-xl border border-line bg-surface p-4">
              <p className="text-[14px] font-semibold">
                {t(REASON_KEYS[item.reason] ?? "admin.reasonOther")} ·{" "}
                {item.profiles?.display_name ?? "—"}
              </p>
              {item.disaster_events ? (
                <p className="text-[13px] text-muted">
                  <Link to={`/bencana/${item.disaster_events.id}`} className="underline">
                    {item.disaster_events.title}
                  </Link>
                </p>
              ) : null}
              {item.note ? <p className="mt-1 text-[13px] text-muted">{item.note}</p> : null}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    void decide(item.id, `/admin/content-reports/${item.id}`, {
                      decision: "actioned",
                      hideEvent: true,
                    })
                  }
                  className="rounded-lg border border-danger/40 px-3 py-1.5 text-[12px] font-semibold text-danger"
                >
                  {t("admin.hideEvent")}
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() =>
                    void decide(item.id, `/admin/content-reports/${item.id}`, {
                      decision: "dismissed",
                    })
                  }
                  className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-semibold"
                >
                  {t("admin.dismiss")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AdminPage() {
  return (
    <AppShell>
      <AdminBody />
    </AppShell>
  );
}
