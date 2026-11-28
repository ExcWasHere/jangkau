import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/konfirmasi";

import { useSession } from "~/features/auth/session";
import { formatRupiah, relativeTime } from "~/features/feed/api";
import { fetchPendingConfirmations, type PendingConfirmation } from "~/features/funds/api";
import { ConfirmationForm } from "~/features/funds/components";
import { translatorFromMatches, useT } from "~/i18n";
import { ApiError } from "~/shared/api/client";
import { AppShell } from "~/shared/layout/app-shell";
import { Skeleton } from "~/shared/ui/skeleton";

export function meta({ matches }: Route.MetaArgs) {
  const t = translatorFromMatches(matches);
  return [{ title: `${t("funds.taskTitle")} — ${t("meta.eventTitleSuffix")}` }];
}

/**
 * Tugas pelapor: bukti belanja yang diklaim penanggung jawab dan belum
 * dikonfirmasi. Inilah satu-satunya saluran pelapor untuk menyatakan bahwa
 * barang benar-benar sampai.
 */
export default function ConfirmationPage() {
  const { t, locale } = useT();
  const { token, ready } = useSession();

  const [items, setItems] = useState<PendingConfirmation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const result = await fetchPendingConfirmations(token);
      setItems(result.items);
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t("common.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    if (!ready) return;
    void reload();
  }, [ready, reload]);

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-1">
          <h1 className="text-[26px] font-bold">{t("funds.taskTitle")}</h1>
          <p className="max-w-[640px] text-[13px] leading-relaxed text-muted">
            {t("funds.taskIntro")}
          </p>
        </header>

        {loading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : error ? (
          <p className="rounded-xl border border-line bg-surface px-5 py-6 text-[14px]">{error}</p>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-[13px] text-muted">
            {t("funds.taskEmpty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li key={item.id} className="rounded-xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[15px] font-semibold">{item.itemName}</span>
                  <span className="font-semibold">{formatRupiah(item.amount, locale)}</span>
                  {item.picName ? (
                    <span className="text-[12px] text-muted">
                      {t("funds.byPic", { name: item.picName })}
                    </span>
                  ) : null}
                  <span className="ml-auto text-[12px] text-subtle">
                    {relativeTime(item.createdAt, locale)}
                  </span>
                </div>

                {item.receiptUrl ? (
                  <a
                    href={item.receiptUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-[12px] font-semibold text-brand-text underline"
                  >
                    {t("funds.openReceipt")}
                  </a>
                ) : null}

                {token ? (
                  <ConfirmationForm
                    expenseId={item.id}
                    token={token}
                    onSubmitted={() => void reload()}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <p className="text-[13px] text-muted">
          <Link to="/" className="underline hover:text-ink">
            {t("common.backToHome")}
          </Link>
        </p>
      </div>
    </AppShell>
  );
}
