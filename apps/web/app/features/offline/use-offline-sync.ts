import { useCallback, useEffect, useRef, useState } from "react";

import { useAuthState } from "~/features/auth/session";
import { useT } from "~/i18n";
import { useToast } from "~/shared/ui/toast";
import {
  countQueued,
  isQueueAvailable,
  listQueuedPosts,
  markAttempt,
  removeQueuedPost,
} from "./queue";
import { isNetworkFailure, submitPost } from "./submit";

/**
 * Sinkronisasi antrean unggahan offline.
 *
 * Dijalankan sekali di layout, sehingga berlaku di halaman mana pun: begitu
 * jaringan kembali, unggahan yang tertahan ikut terkirim tanpa pengguna harus
 * membuka halaman tertentu.
 */
export function useOfflineSync() {
  const { token, ready } = useAuthState();
  const { t } = useT();
  const toast = useToast();

  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  // Mencegah dua sinkronisasi berjalan bersamaan saat event `online` dan
  // pemuatan halaman terjadi hampir bersamaan.
  const running = useRef(false);

  const refreshCount = useCallback(async () => {
    setPending(await countQueued());
  }, []);

  const sync = useCallback(async () => {
    if (!token || running.current) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;

    const queued = await listQueuedPosts();
    if (queued.length === 0) {
      await refreshCount();
      return;
    }

    running.current = true;
    setSyncing(true);

    let sent = 0;
    let failed = 0;

    try {
      for (const item of queued) {
        try {
          await submitPost(
            {
              clientUuid: item.clientUuid,
              body: item.body,
              placeLabel: item.placeLabel,
              capturedAt: item.capturedAt,
              location: item.location,
              photos: item.photos,
            },
            token,
          );
          await removeQueuedPost(item.clientUuid);
          sent += 1;
        } catch (error) {
          if (isNetworkFailure(error)) {
            // Jaringan putus lagi: hentikan, sisanya menunggu kesempatan
            // berikutnya. Percobaan tidak dihitung sebagai kesalahan.
            break;
          }

          // Ditolak server: mengulang tidak akan menolong. Catat alasannya
          // lalu keluarkan dari antrean supaya tidak menyumbat yang lain.
          await markAttempt(item.clientUuid, error instanceof Error ? error.message : "ditolak");
          await removeQueuedPost(item.clientUuid);
          failed += 1;
        }
      }
    } finally {
      running.current = false;
      setSyncing(false);
      await refreshCount();
    }

    if (sent > 0) toast.push(t("offline.synced", { count: sent }), "success");
    if (failed > 0) toast.push(t("offline.rejected", { count: failed }), "error");
  }, [token, t, toast, refreshCount]);

  useEffect(() => {
    void refreshCount();
  }, [refreshCount]);

  useEffect(() => {
    if (!ready || !token) return;
    void sync();
  }, [ready, token, sync]);

  useEffect(() => {
    function handleOnline() {
      setOnline(true);
      void sync();
    }
    function handleOffline() {
      setOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [sync]);

  return { pending, syncing, online, syncNow: sync, refreshCount };
}

export { isQueueAvailable };
