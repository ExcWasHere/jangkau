import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { Route } from "./+types/pencairan";

import { useSession } from "~/features/auth/session";
import { formatRupiah } from "~/features/feed/api";
import {
  fetchAssignmentSummary,
  fetchDisbursement,
  requestDisbursement,
  uploadExpense,
  type AssignmentSummary,
  type Disbursement,
  type Expense,
} from "~/features/funds/api";
import { DisbursementCard } from "~/features/funds/components";
import { translatorFromMatches, useT } from "~/i18n";
import { ApiError } from "~/shared/api/client";
import { AppShell } from "~/shared/layout/app-shell";
import { Skeleton } from "~/shared/ui/skeleton";
import { useToast } from "~/shared/ui/toast";

export function meta({ matches }: Route.MetaArgs) {
  const t = translatorFromMatches(matches);
  return [{ title: `${t("funds.title")} — ${t("meta.eventTitleSuffix")}` }];
}

const MAX_STAGE_PCT = 40;

export default function DisbursementPage() {
  const { t, locale } = useT();
  const toast = useToast();
  const { token, ready } = useSession();
  const [params] = useSearchParams();
  const assignmentId = params.get("assignment");

  const [summary, setSummary] = useState<AssignmentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  const reload = useCallback(async () => {
    if (!token || !assignmentId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setSummary(await fetchAssignmentSummary(assignmentId, token));
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t("common.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [assignmentId, token, t]);

  useEffect(() => {
    if (!ready) return;
    void reload();
  }, [ready, reload]);

  async function open(disbursement: Disbursement) {
    if (!token) return;
    if (openId === disbursement.id) {
      setOpenId(null);
      return;
    }
    setOpenId(disbursement.id);
    try {
      const result = await fetchDisbursement(disbursement.id, token);
      setExpenses(result.expenses);
    } catch {
      setExpenses([]);
    }
  }

  if (!assignmentId) {
    return (
      <AppShell>
        <p className="rounded-xl border border-line bg-surface px-5 py-6 text-[14px]">
          {t("common.notFoundDetail")}{" "}
          <Link to="/dashboard" className="font-semibold text-brand-text underline">
            {t("dashboard.title")}
          </Link>
        </p>
      </AppShell>
    );
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </AppShell>
    );
  }

  if (error || !summary) {
    return (
      <AppShell>
        <p className="rounded-xl border border-line bg-surface px-5 py-6 text-[14px]">
          {error ?? t("common.loadFailed")}
        </p>
      </AppShell>
    );
  }

  const maxStage = Math.floor((summary.balance.balance * MAX_STAGE_PCT) / 100);

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-[26px] font-bold">{t("funds.title")}</h1>
          <p className="max-w-[640px] text-[13px] leading-relaxed text-muted">{t("funds.intro")}</p>
        </header>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["funds.totalIn", summary.balance.totalIn],
            ["funds.totalOut", summary.balance.totalOut],
            ["funds.balance", summary.balance.balance],
          ].map(([key, value]) => (
            <div key={key as string} className="rounded-xl border border-line bg-surface p-4">
              <dt className="text-[12px] text-muted">{t(key as never)}</dt>
              <dd className="mt-1 text-[18px] font-bold">
                {formatRupiah(Number(value), locale)}
              </dd>
            </div>
          ))}
          <div className="rounded-xl border border-line bg-surface p-4">
            <dt className="text-[12px] text-muted">{t("event.donorCount")}</dt>
            <dd className="mt-1 text-[18px] font-bold">{summary.balance.donationCount}</dd>
          </div>
        </dl>

        <RequestForm
          assignmentId={assignmentId}
          maxAmount={maxStage}
          onDone={() => void reload()}
        />

        <section aria-labelledby="tahap">
          <h2 id="tahap" className="text-[17px] font-semibold">
            {t("funds.stagesTitle")}
          </h2>

          {summary.disbursements.length === 0 ? (
            <p className="mt-2 rounded-xl border border-dashed border-line px-4 py-6 text-[13px] text-muted">
              {t("funds.receiptsEmpty")}
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {summary.disbursements.map((disbursement) => (
                <DisbursementCard
                  key={disbursement.id}
                  disbursement={disbursement}
                  expenses={openId === disbursement.id ? expenses : undefined}
                  expanded={openId === disbursement.id}
                  onOpen={() => void open(disbursement)}
                />
              ))}
            </ul>
          )}
        </section>

        {summary.disbursements.some((item) => item.status === "transferred") ? (
          <ExpenseForm
            disbursements={summary.disbursements.filter((item) => item.status === "transferred")}
            onDone={() => void reload()}
          />
        ) : null}

        <p className="text-[13px] text-muted">
          <Link to="/dashboard" className="underline hover:text-ink">
            {t("dashboard.title")}
          </Link>
        </p>
      </div>
    </AppShell>
  );
}

function RequestForm({
  assignmentId,
  maxAmount,
  onDone,
}: {
  assignmentId: string;
  maxAmount: number;
  onDone: () => void;
}) {
  const { t, locale } = useT();
  const toast = useToast();
  const { token } = useSession();

  const [amount, setAmount] = useState(0);
  const [purpose, setPurpose] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (maxAmount <= 0) {
    return (
      <p className="rounded-xl border border-line bg-surface px-4 py-3 text-[13px] text-muted">
        {t("funds.unlockHint")}
      </p>
    );
  }

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (!token) return;
        setBusy(true);
        setError(null);
        try {
          await requestDisbursement(assignmentId, { amount, purpose }, token);
          toast.push(t("funds.requested"), "success");
          setAmount(0);
          setPurpose("");
          onDone();
        } catch (cause) {
          setError(cause instanceof ApiError ? cause.message : t("common.loadFailed"));
        } finally {
          setBusy(false);
        }
      }}
      className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5"
    >
      <h2 className="text-[16px] font-semibold">{t("funds.requestTitle")}</h2>
      <p className="text-[12px] text-muted">
        {t("funds.requestIntro")} · {t("funds.maxHint", { amount: formatRupiah(maxAmount, locale) })}
      </p>

      <label className="flex flex-col gap-1 text-[13px] font-semibold">
        {t("funds.requestAmount")}
        <input
          type="number"
          min={1000}
          max={maxAmount}
          step={1000}
          required
          value={amount || ""}
          onChange={(event) => setAmount(Number(event.target.value))}
          className="rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] font-normal"
        />
      </label>

      <label className="flex flex-col gap-1 text-[13px] font-semibold">
        {t("funds.requestPurpose")}
        <input
          required
          minLength={5}
          maxLength={300}
          value={purpose}
          onChange={(event) => setPurpose(event.target.value)}
          placeholder={t("funds.requestPurposePlaceholder")}
          className="rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] font-normal"
        />
      </label>

      {error ? <p className="text-[12px] text-danger">{error}</p> : null}

      <button
        type="submit"
        disabled={busy}
        className="w-fit rounded-lg bg-brand px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-50"
      >
        {t("funds.requestSubmit")}
      </button>
    </form>
  );
}

function ExpenseForm({
  disbursements,
  onDone,
}: {
  disbursements: Disbursement[];
  onDone: () => void;
}) {
  const { t, locale } = useT();
  const toast = useToast();
  const { token } = useSession();

  const [disbursementId, setDisbursementId] = useState(disbursements[0]?.id ?? "");
  const [itemName, setItemName] = useState("");
  const [amount, setAmount] = useState(0);
  const [merchant, setMerchant] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (!token || !file) return;
        setBusy(true);
        setError(null);
        try {
          await uploadExpense(token, disbursementId, {
            file,
            itemName,
            amount,
            merchant: merchant || undefined,
            note: note || undefined,
          });
          toast.push(t("funds.receiptSaved"), "success");
          setItemName("");
          setAmount(0);
          setMerchant("");
          setNote("");
          setFile(null);
          onDone();
        } catch (cause) {
          setError(cause instanceof ApiError ? cause.message : t("common.loadFailed"));
        } finally {
          setBusy(false);
        }
      }}
      className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5"
    >
      <h2 className="text-[16px] font-semibold">{t("funds.addReceipt")}</h2>

      <label className="flex flex-col gap-1 text-[13px] font-semibold">
        {t("funds.stageLabel")}
        <select
          value={disbursementId}
          onChange={(event) => setDisbursementId(event.target.value)}
          className="rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] font-normal"
        >
          {disbursements.map((item) => (
            <option key={item.id} value={item.id}>
              {t("funds.stage", { seq: item.seq })} · {formatRupiah(item.amount, locale)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-[13px] font-semibold">
        {t("funds.receiptItem")}
        <input
          required
          minLength={2}
          maxLength={120}
          value={itemName}
          onChange={(event) => setItemName(event.target.value)}
          className="rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] font-normal"
        />
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[13px] font-semibold">
          {t("funds.receiptAmount")}
          <input
            type="number"
            min={1}
            required
            value={amount || ""}
            onChange={(event) => setAmount(Number(event.target.value))}
            className="rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] font-normal"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-semibold">
          {t("funds.receiptMerchant")}
          <input
            value={merchant}
            onChange={(event) => setMerchant(event.target.value)}
            className="rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] font-normal"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-[13px] font-semibold">
        {t("funds.receiptNote")}
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] font-normal"
        />
      </label>

      <label className="flex flex-col gap-1 text-[13px] font-semibold">
        {t("funds.receiptFile")}
        <input
          type="file"
          required
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="text-[13px] font-normal"
        />
      </label>

      {error ? <p className="text-[12px] text-danger">{error}</p> : null}

      <button
        type="submit"
        disabled={busy || !file}
        className="w-fit rounded-lg bg-brand px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-50"
      >
        {t("funds.receiptSubmit")}
      </button>
    </form>
  );
}
