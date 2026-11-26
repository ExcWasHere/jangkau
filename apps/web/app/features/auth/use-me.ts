import { useEffect, useState } from "react";

import type { AppRole } from "@jangkau/shared";

import { apiFetch, ApiError } from "~/shared/api/client";
import { useSession } from "./session";

export type Me = {
  id: string;
  email: string | null;
  role: AppRole;
  fullName: string;
  organizationId: string | null;
};

/**
 * Profil + peran dari API. Dipakai untuk menyusun navigasi dan menjaga
 * akses halaman. `organizationId` hanya terisi bila organisasi sudah
 * diverifikasi admin — organisasi pending tidak mendapat akses apa pun.
 */
export function useMe() {
  const { token, ready } = useSession();
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(!ready);
      return;
    }

    let active = true;
    setLoading(true);

    apiFetch<{ user: Me }>("/me", { token })
      .then((data) => {
        if (!active) return;
        setMe(data.user);
        setError(null);
      })
      .catch((cause) => {
        if (!active) return;
        setError(cause instanceof ApiError ? cause.message : "Gagal memuat profil");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [ready, token]);

  return { me, error, loading, token };
}
