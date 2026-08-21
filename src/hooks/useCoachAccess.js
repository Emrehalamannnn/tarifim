import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// Pre-StoreKit gate for the AI coach: there's no purchasable entitlement
// yet, so access is restricted to a single allowed account instead of a real
// subscription check (see useSubscription). The allowlist itself lives only
// in the coach-access Edge Function's AI_COACH_ALLOWED_EMAIL secret — never
// in frontend source — so this hook just asks the server what the signed-in
// user is authorized for. This is a UI-only convenience (hide/show the tab
// and page); the ai-coach Edge Function re-checks the same allowlist
// server-side against the caller's verified session, so this hook can never
// itself grant access to the API. Swap coach-access's body for a
// subscriptions-table lookup once purchases ship; every call site here only
// ever reads the single boolean.
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
