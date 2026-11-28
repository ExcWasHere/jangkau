import { useEffect, useState } from "react";

import type { AccountType, BadgeKind, DistributorLabel, VerificationStatus } from "@jangkau/shared";

import { ApiError, apiFetch } from "~/shared/api/client";
import { useAuthState } from "./session";

export type Me = {
  id: string;
  email: string | null;
  displayName: string;
  accountType: AccountType;
  isAdmin: boolean;
  locale: "id" | "en";
  badges: BadgeKind[];
  distributor: {
    label: DistributorLabel;
    display_name: string;
    bio: string | null;
    home_city: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    social_url: string | null;
    follower_count: number | null;
    verification_status: VerificationStatus;
    verified_at: string | null;
    rejection_reason: string | null;
  } | null;
};

/**
 * Profil dari API: tipe akun, status admin, lencana, dan profil penyalur.
 * `isVerifiedDistributor` adalah satu-satunya syarat untuk mengajukan diri
 * sebagai penanggung jawab, jadi dihitung sekali di sini.
 *
 * Sengaja TIDAK memakai `useSession`: hook ini dipakai juga oleh layout
 * publik, dan `useSession` mengalihkan pengunjung tanpa sesi ke `/masuk`.
 * Penjagaan halaman adalah tugas `RequireAuth` di guards.tsx.
 */
export function useMe() {
  const { token, ready } = useAuthState();
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

  return {
    me,
    error,
    loading,
    token,
    isVerifiedDistributor: me?.distributor?.verification_status === "verified",
  };
}
