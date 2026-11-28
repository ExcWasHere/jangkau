import { useState } from "react";

import { useT } from "~/i18n";
import { formatRupiah } from "~/features/feed/api";
import type { Disbursement, Expense } from "./api";
import { DECISION_KEY, DISBURSEMENT_STATUS_KEY, confirmExpense } from "./api";
import type { DictKey } from "~/i18n";

const STATUS_TONE: Record<string, string> = {
  locked: "bg-canvas text-muted",
  requested: "bg-warn/10 text-warn",
  approved: "bg-info/10 text-info",
  transferred: "bg-ok/10 text-ok",
  rejected: "bg-danger/10 text-danger",
};

/** Kartu satu tahap pencairan: nominal, status, dan bukti belanjanya. */
export function DisbursementCard({
  disbursement,
  expenses,
  onOpen,
  expanded,
}: {
  disbursement: Disbursement;
  expenses?: Expense[];
  onOpen?: () => void;
  expanded?: boolean;
}) {
  const { t, locale } = useT();

  return (
    <li className="rounded-xl border border-line bg-surface">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full flex-wrap items-baseline gap-2 px-4 py-3 text-left"
      >
        <span className="text-[14px] font-semibold">
          {t("funds.stage", { seq: disbursement.seq })}
        </span>
        <span className="font-semibold">{formatRupiah(disbursement.amount, locale)}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            STATUS_TONE[disbursement.status] ?? STATUS_TONE.locked
          }`}
        >
          {t(DISBURSEMENT_STATUS_KEY[disbursement.status] as DictKey)}
        </span>
        {disbursement.isSimulated ? (
          <span className="rounded-full bg-warn/10 px-2 py-0.5 text-[11px] font-semibold text-warn">
            {t("funds.simulated")}
          </span>
        ) : null}
        <span className="ml-auto text-[12px] text-muted">
          {t("funds.receiptsTitle")}: {disbursement.receiptCount}
          {disbursement.confirmedCount > 0 ? ` · ${disbursement.confirmedCount} ${t("funds.confirmed").toLowerCase()}` : ""}
        </span>
      </button>

      {disbursement.purpose ? (
        <p className="px-4 pb-2 text-[13px] text-muted">{disbursement.purpose}</p>
      ) : null}

      {expanded ? (
        <div className="border-t border-line px-4 py-3">
          {!expenses || expenses.length === 0 ? (
            <p className="text-[13px] text-muted">{t("funds.receiptsEmpty")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {expenses.map((expense) => (
                <li key={expense.id} className="rounded-lg border border-line bg-canvas p-3">
                  <div className="flex flex-wrap items-baseline gap-2 text-[13px]">
                    <span className="font-semibold">{expense.itemName}</span>
                    <span>{formatRupiah(expense.amount, locale)}</span>
                    {expense.merchant ? (
                      <span className="text-muted">· {expense.merchant}</span>
                    ) : null}
                  </div>

                  {expense.note ? (
                    <p className="mt-1 text-[12px] text-muted">{expense.note}</p>
                  ) : null}

                  {expense.receiptUrl ? (
                    <a
                      href={expense.receiptUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-[12px] font-semibold text-brand-text underline"
                    >
                      {t("funds.openReceipt")}
                    </a>
                  ) : null}

                  <div className="mt-2 flex flex-col gap-1">
                    {expense.confirmations.length === 0 ? (
                      <p className="text-[12px] text-muted">{t("funds.confirmEmpty")}</p>
                    ) : (
                      expense.confirmations.map((confirmation) => (
                        <p key={confirmation.profileId} className="text-[12px]">
                          <span
                            className={`font-semibold ${
                              confirmation.decision === "received"
                                ? "text-ok"
                                : confirmation.decision === "partial"
                                  ? "text-warn"
                                  : "text-danger"
                            }`}
                          >
                            {t(DECISION_KEY[confirmation.decision] as DictKey)}
                          </span>
                          {confirmation.displayName ? ` · ${confirmation.displayName}` : ""}
                          {confirmation.note ? ` — ${confirmation.note}` : ""}
                        </p>
                      ))
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </li>
  );
}

/**
 * Form konfirmasi pelapor untuk satu bukti belanja.
 *
 * Catatan sengaja opsional tapi ditampilkan menonjol: inilah satu-satunya
 * saluran pelapor untuk bersuara tentang barang yang diklaim dibeli.
 */
export function ConfirmationForm({
  expenseId,
  token,
  onSubmitted,
}: {
  expenseId: string;
  token: string;
  onSubmitted: () => void;
}) {
  const { t } = useT();
  const [decision, setDecision] = useState<"received" | "partial" | "not_received">("received");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await confirmExpense(expenseId, { decision, note: note.trim() || undefined }, token);
          onSubmitted();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : t("common.loadFailed"));
        } finally {
          setBusy(false);
        }
      }}
      className="mt-2 flex flex-col gap-2 border-t border-line pt-3"
    >
      <fieldset className="flex flex-col gap-1">
        <legend className="text-[12px] font-semibold">{t("funds.taskDecision")}</legend>
        {(
          [
            ["received", "funds.confirmed"],
            ["partial", "funds.partial"],
            ["not_received", "funds.notReceived"],
          ] as const
        ).map(([value, key]) => (
          <label key={value} className="flex items-center gap-2 text-[13px]">
            <input
              type="radio"
              name={`decision-${expenseId}`}
              value={value}
              checked={decision === value}
              onChange={() => setDecision(value)}
            />
            {t(key)}
          </label>
        ))}
      </fieldset>

      <label className="flex flex-col gap-1 text-[12px] font-semibold">
        {t("funds.taskNote")}
        <textarea
          rows={2}
          maxLength={500}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t("funds.taskNotePlaceholder")}
          className="rounded-lg border border-line bg-canvas px-3 py-2 text-[13px] font-normal"
        />
      </label>

      {error ? <p className="text-[12px] text-danger">{error}</p> : null}

      <button
        type="submit"
        disabled={busy}
        className="w-fit rounded-lg bg-brand px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
      >
        {t("funds.taskSubmit")}
      </button>
    </form>
  );
}
