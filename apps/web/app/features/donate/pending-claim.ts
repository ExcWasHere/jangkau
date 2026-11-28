import { useEffect, useState } from "react";

import { claimDonation } from "./api";
import { useAuthState } from "~/features/auth/session";
import { useT } from "~/i18n";
import { useToast } from "~/shared/ui/toast";

const STORAGE_KEY = "jangkau-pending-claim";

type PendingClaim = { donationId: string; claimToken: string };

/**
 * Donasi tamu yang belum ditautkan ke akun.
 *
 * Disimpan di `sessionStorage` karena pengguna mungkin harus melewati
 * pengalihan OAuth dulu; token klaim tidak boleh hilang di tengah jalan.
 * Klaim dijalankan sekali setelah sesi siap, lalu penandanya dihapus.
 */
export function rememberPendingClaim(claim: PendingClaim) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(claim));
  } catch {
    // Mode privat bisa memblokir storage; donasi tetap tercatat di server.
  }
}

export function readPendingClaim(): PendingClaim | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingClaim>;
    return parsed.donationId && parsed.claimToken
      ? { donationId: parsed.donationId, claimToken: parsed.claimToken }
      : null;
  } catch {
    return null;
  }
}

export function clearPendingClaim() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // tidak ada yang perlu dilakukan
  }
}

/**
 * Mengklaim donasi tamu setelah pengguna masuk. Dipasang di layout supaya
 * berlaku untuk login lewat email maupun Google, di halaman mana pun.
 */
export function usePendingClaim() {
  const { token, ready } = useAuthState();
  const { t } = useT();
  const toast = useToast();
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    if (!ready || !token) return;

    const pending = readPendingClaim();
    if (!pending) return;

    let active = true;
    setClaiming(true);

    claimDonation(pending.donationId, pending.claimToken, token)
      .then(() => {
        if (!active) return;
        clearPendingClaim();
        toast.push(t("donate.claimSuccess"), "success");
      })
      .catch(() => {
        if (!active) return;
        // Penanda sengaja TIDAK dihapus: pengguna bisa mencoba lagi setelah
        // memastikan akun yang dipakai memang akun yang sama.
        toast.push(t("donate.claimFailed"), "error");
      })
      .finally(() => {
        if (active) setClaiming(false);
      });

    return () => {
      active = false;
    };
  }, [ready, token, t, toast]);

  return { claiming };
}
