import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/notifikasi";

import { useSession } from "~/features/auth/session";
import { relativeTime } from "~/features/feed/api";
import {
  announceNotificationsChanged,
  fetchNotifications,
  markAllRead,
  markRead,
  notificationGroup,
  type Notification,
} from "~/features/notifications/api";
import { translatorFromMatches, useT, type DictKey } from "~/i18n";
import { AppShell } from "~/shared/layout/app-shell";
import { Skeleton } from "~/shared/ui/skeleton";
import { useToast } from "~/shared/ui/toast";

export function meta({ matches }: Route.MetaArgs) {
  const t = translatorFromMatches(matches);
  return [{ title: `${t("notifications.title")} — ${t("meta.eventTitleSuffix")}` }];
}

const GROUP_KEY: Record<string, DictKey> = {
  verification: "notifications.kindVerification",
  pic: "notifications.kindPic",
  donation: "notifications.kindDonation",
  disbursement: "notifications.kindDisbursement",
  moderation: "notifications.kindModeration",
  other: "notifications.kindOther",
};

export default function NotificationsPage() {
  const { t, locale } = useT();
  const toast = useToast();
  const { token, ready } = useSession();

  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const result = await fetchNotifications(token, 50);
      setItems(result.items);
      setUnread(result.unreadCount);
    } catch {
      // Halaman notifikasi tidak boleh gagal total karena satu permintaan.
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!ready) return;
    void reload();
  }, [ready, reload]);

  async function open(notification: Notification) {
    if (!token || notification.read_at) return;
    try {
      await markRead(notification.id, token);
      setItems((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item,
        ),
      );
      setUnread((count) => Math.max(0, count - 1));
      announceNotificationsChanged();
    } catch {
      // Gagal menandai dibaca bukan alasan memblokir navigasi.
    }
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-5">
        <header className="flex flex-wrap items-baseline gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-[26px] font-bold">{t("notifications.title")}</h1>
            <p className="text-[13px] text-muted">{t("notifications.intro")}</p>
          </div>

          {unread > 0 ? (
            <div className="ml-auto flex items-center gap-3">
              <span className="text-[12px] font-semibold text-warn">
                {t("notifications.unread", { count: unread })}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  if (!token) return;
                  setBusy(true);
                  try {
                    await markAllRead(token);
                    toast.push(t("notifications.markedAll"), "success");
                    announceNotificationsChanged();
                    await reload();
                  } finally {
                    setBusy(false);
                  }
                }}
                className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50"
              >
                {t("notifications.markAll")}
              </button>
            </div>
          ) : null}
        </header>

        {loading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-[13px] text-muted">
            {t("notifications.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((notification) => {
              const group = notificationGroup(notification.kind);
              const unreadItem = notification.read_at === null;

              return (
                <li
                  key={notification.id}
                  className={`rounded-xl border p-4 ${
                    unreadItem ? "border-brand-line bg-brand-soft/30" : "border-line bg-surface"
                  }`}
                >
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] font-bold tracking-wide text-muted uppercase">
                      {t(GROUP_KEY[group])}
                    </span>
                    <span className="text-[14px] font-semibold">{notification.title}</span>
                    {unreadItem ? (
                      <span
                        aria-label={t("notifications.unread", { count: 1 })}
                        className="h-1.5 w-1.5 rounded-full bg-brand"
                      />
                    ) : null}
                    <span className="ml-auto text-[12px] text-subtle">
                      {relativeTime(notification.created_at, locale)}
                    </span>
                  </div>

                  {notification.body ? (
                    <p className="mt-1 text-[13px] leading-relaxed text-muted">{notification.body}</p>
                  ) : null}

                  {notification.link ? (
                    <Link
                      to={notification.link}
                      onClick={() => void open(notification)}
                      className="mt-2 inline-block text-[12px] font-semibold text-brand-text underline"
                    >
                      {t("notifications.open")}
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
