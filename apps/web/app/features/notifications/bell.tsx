import { useEffect, useState } from "react";
import { Link } from "react-router";

import { useAuthState } from "~/features/auth/session";
import { fetchUnreadCount, onNotificationsChanged } from "~/features/notifications/api";
import { useT } from "~/i18n";

const POLL_MS = 60_000;

/**
 * Lencana notifikasi di header.
 *
 * Dimuat setelah sesi siap dan disegarkan berkala, bukan lewat websocket:
 * notifikasi di produk ini tidak mendesak, dan satu permintaan ringan per
 * menit jauh lebih murah daripada koneksi yang harus dijaga.
 */
export function NotificationBell() {
  const { t } = useT();
  const { token, ready } = useAuthState();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!ready || !token) {
      setUnread(0);
      return;
    }

    let active = true;

    async function load() {
      try {
        const result = await fetchUnreadCount(token as string);
        if (active) setUnread(result.unreadCount);
      } catch {
        // Lencana gagal dimuat bukan alasan menampilkan galat di header.
      }
    }

    void load();
    const timer = setInterval(load, POLL_MS);
    const unsubscribe = onNotificationsChanged(() => void load());

    return () => {
      active = false;
      clearInterval(timer);
      unsubscribe();
    };
  }, [ready, token]);

  if (!token) return null;

  return (
    <Link
      to="/notifikasi"
      aria-label={t("notifications.badgeLabel", { count: unread })}
      className="relative rounded-lg border border-line px-2.5 py-1.5 text-[13px] font-semibold text-muted hover:text-ink"
    >
      <span aria-hidden>🔔</span>
      {unread > 0 ? (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      ) : null}
    </Link>
  );
}
