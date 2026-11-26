import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { Session } from "@supabase/supabase-js";

import { isSupabaseConfigured } from "./env";
import { getSupabaseBrowserClient } from "./supabase";

/**
 * Sesi Supabase untuk komponen client. `ready=false` berarti masih dibaca
 * dari storage, sehingga UI tidak berkedip ke halaman masuk.
 */
export function useSession() {
  const navigate = useNavigate();
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
      if (!data.session) navigate("/masuk", { replace: true });
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) navigate("/masuk", { replace: true });
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [navigate]);

  return { session, ready, token: session?.access_token ?? null };
}
