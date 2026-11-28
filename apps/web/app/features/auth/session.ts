import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { Session } from "@supabase/supabase-js";

import { isSupabaseConfigured } from "~/shared/lib/env";
import { getSupabaseBrowserClient } from "~/shared/lib/supabase";

/**
 * Sesi Supabase untuk komponen client, tanpa memaksa navigasi.
 * `ready=false` berarti sesi masih dibaca dari storage.
 */
export function useAuthState() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setReady(true);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setReady(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return { session, ready, token: session?.access_token ?? null };
}

/**
 * Halaman yang butuh login: tanpa sesi → `/masuk`.
 * Dipakai halaman data, bukan halaman publik.
 */
export function useSession() {
  const navigate = useNavigate();
  const { session, ready } = useAuthState();

  useEffect(() => {
    if (ready && !session) navigate("/masuk", { replace: true });
  }, [navigate, ready, session]);

  return { session, ready, token: session?.access_token ?? null };
}

/**
 * Halaman auth (`/masuk`, `/daftar`): pengguna yang sudah punya sesi
 * langsung diarahkan ke beranda, supaya tidak ada dua kondisi login.
 */
export function useRedirectIfAuthenticated() {
  const navigate = useNavigate();
  const { session, ready } = useAuthState();

  useEffect(() => {
    if (ready && session) navigate("/", { replace: true });
  }, [navigate, ready, session]);

  return { ready };
}
