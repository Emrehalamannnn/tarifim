import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// AI Coach access gate, backed by a real Apple auto-renewable subscription.
// coach-access checks the caller's server-verified premium entitlement
// (public.subscriptions, only ever written after independent Apple
// verification — see supabase/functions/_shared/apple-subscription.ts) and
// returns a single boolean. This is a UI-only convenience (hide/show the tab
// and page); the ai-coach Edge Function re-checks the same entitlement
// server-side against the caller's verified session, so this hook can never
// itself grant access to the API.
export function useCoachAccess(user) {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (!user) {
      setAllowed(false);
      return;
    }
    let cancelled = false;
    supabase.functions.invoke("coach-access").then(({ data, error }) => {
      if (!cancelled) setAllowed(!error && !!data?.allowed);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return allowed;
}
