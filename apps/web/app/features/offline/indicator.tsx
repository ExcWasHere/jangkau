import { useT } from "~/i18n";

/**
 * Penanda antrean offline di bawah header.
 *
 * Hanya muncul saat ada sesuatu yang perlu diketahui: laporan tertahan, atau
 * perangkat sedang tanpa jaringan. Indikator permanen yang selalu hijau tidak
 * memberi informasi apa pun dan hanya menambah kebisingan.
 */
export function OfflineIndicator({
  pending,
  syncing,
  online,
  onSync,
}: {
  pending: number;
  syncing: boolean;
  online: boolean;
  onSync: () => void;
}) {
  const { t } = useT();

  if (pending === 0 && online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`border-b text-[12px] ${
        online ? "border-warn/30 bg-warn/10 text-warn" : "border-line bg-surface-2 text-muted"
      }`}
    >
      <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center gap-2 px-4 py-1.5">
        <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
        <span>
          {syncing
            ? t("offline.indicatorSyncing", { count: pending })
            : pending > 0
              ? t("offline.indicator", { count: pending })
              : t("offline.offline")}
        </span>

        {pending > 0 && online && !syncing ? (
          <button
            type="button"
            onClick={onSync}
            className="ml-auto font-semibold underline"
          >
            {t("offline.syncNow")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
