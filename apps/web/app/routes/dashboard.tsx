import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/dashboard";

import type { DistributorLabel } from "@jangkau/shared";

import { useSession } from "~/features/auth/session";
import {
  DOC_KIND_LABEL_KEY,
  applyAsPic,
  createDistributor,
  fetchDistributorMe,
  fetchMyAssignments,
  submitVerification,
  updateDistributor,
  uploadVerificationDocument,
  withdrawPicApplication,
  type DistributorMe,
  type PicAssignment,
} from "~/features/distributor/api";
import { translatorFromMatches, useT, type DictKey } from "~/i18n";
import { ApiError } from "~/shared/api/client";
import { AppShell } from "~/shared/layout/app-shell";
import { Skeleton } from "~/shared/ui/skeleton";
import { useToast } from "~/shared/ui/toast";

export function meta({ matches }: Route.MetaArgs) {
  const t = translatorFromMatches(matches);
  return [{ title: `${t("dashboard.title")} — ${t("meta.eventTitleSuffix")}` }];
}

const LABEL_KEYS: Record<DistributorLabel, DictKey> = {
  organization: "auth.labelOrganization",
  volunteer: "auth.labelVolunteer",
  creator: "auth.labelCreator",
};

const STATUS_KEYS: Record<string, DictKey> = {
  unverified: "account.verificationUnverified",
  pending: "account.verificationPending",
  verified: "account.verificationVerified",
  rejected: "account.verificationRejected",
  suspended: "account.verificationSuspended",
};

const DOC_STATE_KEYS: Record<string, DictKey> = {
  missing: "dashboard.docMissing",
  pending: "dashboard.docPending",
  approved: "dashboard.docApproved",
  rejected: "dashboard.docRejected",
};

const ASSIGNMENT_KEYS: Record<string, DictKey> = {
  applied: "dashboard.assignmentApplied",
  approved: "dashboard.assignmentApproved",
  rejected: "dashboard.assignmentRejected",
  revoked: "dashboard.assignmentRevoked",
};

function DashboardBody() {
  const { t } = useT();
  const toast = useToast();
  const { token } = useSession();

  const [state, setState] = useState<DistributorMe | null>(null);
  const [assignments, setAssignments] = useState<PicAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [me, mine] = await Promise.all([fetchDistributorMe(token), fetchMyAssignments(token)]);
      setState(me);
      setAssignments(mine.items);
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t("common.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function run(key: string, action: () => Promise<unknown>, success: string) {
    setBusy(key);
    try {
      await action();
      toast.push(success, "success");
      await reload();
    } catch (cause) {
      toast.push(cause instanceof ApiError ? cause.message : t("common.loadFailed"), "error");
    } finally {
      setBusy(null);
    }
  }

  if (loading && !state) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80" />
        <Skeleton className="mt-4 h-40 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="rounded-lg border border-line bg-surface px-4 py-3 text-[13px] text-warn">
        {error}
      </p>
    );
  }

  if (!state?.distributor) return <CreateProfile onCreated={reload} />;

  const profile = state.distributor;
  const verification = state.verification;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-[26px] font-bold">{t("dashboard.title")}</h1>
        <p className="text-[13px] text-muted">{t("dashboard.intro")}</p>
      </header>

      <section
        aria-labelledby="verifikasi"
        className="rounded-xl border border-line bg-surface p-5"
      >
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 id="verifikasi" className="text-[17px] font-semibold">
            {t("dashboard.verificationTitle")}
          </h2>
          <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-semibold text-muted">
            {t(LABEL_KEYS[profile.label])}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              profile.verification_status === "verified"
                ? "bg-ok/10 text-ok"
                : profile.verification_status === "rejected"
                  ? "bg-danger/10 text-danger"
                  : "bg-warn/10 text-warn"
            }`}
          >
            {t(STATUS_KEYS[profile.verification_status] ?? "account.verificationUnverified")}
          </span>
        </div>

        <p className="mt-2 text-[13px] text-muted">
          {profile.verification_status === "verified"
            ? t("dashboard.verifiedNote")
            : profile.verification_status === "pending"
              ? t("dashboard.pendingNote")
              : profile.rejection_reason
                ? t("dashboard.rejectionNote", { reason: profile.rejection_reason })
                : null}
        </p>

        <h3 className="mt-4 text-[13px] font-semibold">{t("dashboard.requiredDocs")}</h3>
        <ul className="mt-2 flex flex-col divide-y divide-line">
          {(verification?.required ?? []).map((item) => {
            const doc = state.documents.find((row) => row.kind === item.kind);
            const canUpload = profile.verification_status !== "verified";

            return (
              <li key={item.kind} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 text-[14px]">
                  {t(DOC_KIND_LABEL_KEY[item.kind])}
                </span>
                <span
                  className={`text-[12px] font-semibold ${
                    item.state === "approved"
                      ? "text-ok"
                      : item.state === "rejected"
                        ? "text-danger"
                        : item.state === "pending"
                          ? "text-warn"
                          : "text-muted"
                  }`}
                >
                  {t(DOC_STATE_KEYS[item.state] ?? "dashboard.docMissing")}
                </span>

                {canUpload ? (
                  <label className="cursor-pointer rounded-lg border border-line px-3 py-1 text-[12px] font-semibold hover:border-brand-line">
                    {busy === item.kind
                      ? t("dashboard.uploading")
                      : doc
                        ? t("dashboard.replaceDoc")
                        : t("dashboard.uploadDoc")}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      className="sr-only"
                      disabled={busy !== null}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file || !token) return;
                        void run(
                          item.kind,
                          () => uploadVerificationDocument(token, { kind: item.kind, file }),
                          t("dashboard.saved"),
                        );
                      }}
                    />
                  </label>
                ) : null}
              </li>
            );
          })}
        </ul>

        {verification?.canSubmit ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              token &&
              void run("submit", () => submitVerification(token), t("dashboard.submitted"))
            }
            className="mt-4 rounded-lg bg-brand px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-50"
          >
            {t("dashboard.submitVerification")}
          </button>
        ) : verification && verification.missing.length > 0 ? (
          <p className="mt-4 text-[12px] text-muted">{t("dashboard.submitBlocked")}</p>
        ) : null}
      </section>

      <section aria-labelledby="pengajuan">
        <h2 id="pengajuan" className="text-[17px] font-semibold">
          {t("dashboard.assignmentsTitle")}
        </h2>

        {assignments.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-line px-4 py-6 text-[13px] text-muted">
            {t("dashboard.assignmentsEmpty")}
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {assignments.map((assignment) => (
              <li key={assignment.id} className="rounded-xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-baseline gap-2">
                  <Link
                    to={`/bencana/${assignment.event_id}`}
                    className="text-[15px] font-semibold hover:underline"
                  >
                    {assignment.disaster_events?.title ?? assignment.event_id}
                  </Link>
                  <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-semibold text-muted">
                    {t(ASSIGNMENT_KEYS[assignment.status] ?? "dashboard.assignmentApplied")}
                  </span>
                </div>
                {assignment.pitch ? (
                  <p className="mt-1 text-[13px] text-muted">{assignment.pitch}</p>
                ) : null}
                {assignment.review_note ? (
                  <p className="mt-1 text-[12px] text-danger">
                    {t("dashboard.rejectionNote", { reason: assignment.review_note })}
                  </p>
                ) : null}

                {assignment.status === "applied" && token ? (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() =>
                      void run(
                        assignment.id,
                        () => withdrawPicApplication(token, assignment.event_id),
                        t("dashboard.saved"),
                      )
                    }
                    className="mt-2 text-[12px] font-semibold text-muted underline"
                  >
                    {t("dashboard.withdraw")}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ProfileEditor profile={profile} onSaved={reload} />
    </div>
  );
}

function CreateProfile({ onCreated }: { onCreated: () => Promise<void> }) {
  const { t } = useT();
  const toast = useToast();
  const { token } = useSession();

  const [label, setLabel] = useState<DistributorLabel>("volunteer");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [homeCity, setHomeCity] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [socialUrl, setSocialUrl] = useState("");
  const [followerCount, setFollowerCount] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setBusy(true);
    try {
      await createDistributor(token, {
        label,
        displayName,
        bio: bio || undefined,
        homeCity: homeCity || undefined,
        contactPhone: contactPhone || undefined,
        socialUrl: socialUrl || undefined,
        followerCount: followerCount ? Number(followerCount) : undefined,
      });
      toast.push(t("dashboard.saved"), "success");
      await onCreated();
    } catch (cause) {
      toast.push(cause instanceof ApiError ? cause.message : t("common.loadFailed"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-[24px] font-bold">{t("dashboard.notDistributorTitle")}</h1>
        <p className="max-w-[640px] text-[13px] leading-relaxed text-muted">
          {t("dashboard.notDistributorBody")}
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        className="mx-auto flex w-full max-w-[560px] flex-col gap-4 rounded-xl border border-line bg-surface p-5"
      >
        <h2 className="text-[16px] font-semibold">{t("dashboard.createTitle")}</h2>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-[13px] font-semibold">{t("dashboard.labelLegend")}</legend>
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

        <label className="flex flex-col gap-1 text-[13px] font-semibold">
          {t("dashboard.displayName")}
          <input
            required
            minLength={3}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] font-normal"
          />
        </label>

        <label className="flex flex-col gap-1 text-[13px] font-semibold">
          {t("dashboard.bio")}
          <textarea
            rows={3}
            maxLength={600}
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            className="rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] font-normal"
          />
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[13px] font-semibold">
            {t("dashboard.homeCity")}
            <input
              value={homeCity}
              onChange={(event) => setHomeCity(event.target.value)}
              className="rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] font-normal"
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-semibold">
            {t("dashboard.contactPhone")}
            <input
              value={contactPhone}
              onChange={(event) => setContactPhone(event.target.value)}
              className="rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] font-normal"
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-semibold">
            {t("dashboard.socialUrl")}
            <input
              type="url"
              value={socialUrl}
              onChange={(event) => setSocialUrl(event.target.value)}
              placeholder="https://instagram.com/…"
              className="rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] font-normal"
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-semibold">
            {t("dashboard.followerCount")}
            <input
              type="number"
              min={0}
              value={followerCount}
              onChange={(event) => setFollowerCount(event.target.value)}
              className="rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] font-normal"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
        >
          {t("dashboard.createSubmit")}
        </button>
      </form>
    </div>
  );
}

function ProfileEditor({
  profile,
  onSaved,
}: {
  profile: NonNullable<DistributorMe["distributor"]>;
  onSaved: () => Promise<void>;
}) {
  const { t } = useT();
  const toast = useToast();
  const { token } = useSession();

  const [displayName, setDisplayName] = useState(profile.display_name);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [homeCity, setHomeCity] = useState(profile.home_city ?? "");
  const [busy, setBusy] = useState(false);

  async function onSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setBusy(true);
    try {
      await updateDistributor(token, { displayName, bio, homeCity });
      toast.push(t("dashboard.saved"), "success");
      await onSaved();
    } catch (cause) {
      toast.push(cause instanceof ApiError ? cause.message : t("common.loadFailed"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSave}
      className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5"
    >
      <h2 className="text-[16px] font-semibold">{t("account.distributorTitle")}</h2>

      <label className="flex flex-col gap-1 text-[13px] font-semibold">
        {t("dashboard.displayName")}
        <input
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          className="rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] font-normal"
        />
      </label>

      <label className="flex flex-col gap-1 text-[13px] font-semibold">
        {t("dashboard.bio")}
        <textarea
          rows={3}
          maxLength={600}
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          className="rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] font-normal"
        />
      </label>

      <label className="flex flex-col gap-1 text-[13px] font-semibold">
        {t("dashboard.homeCity")}
        <input
          value={homeCity}
          onChange={(event) => setHomeCity(event.target.value)}
          className="rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] font-normal"
        />
      </label>

      <button
        type="submit"
        disabled={busy}
        className="w-fit rounded-lg border border-line px-4 py-2 text-[13px] font-semibold disabled:opacity-50"
      >
        {t("dashboard.save")}
      </button>
    </form>
  );
}

export default function DashboardPage() {
  return (
    <AppShell>
      <DashboardBody />
    </AppShell>
  );
}
