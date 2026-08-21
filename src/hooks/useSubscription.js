import { useCallback, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

// Authoritative entitlement source: subscription-status re-verifies with
// Apple's App Store Server API when the cached row looks stale before
// answering (see supabase/functions/subscription-status). isPremium is never
// derived from local StoreKit state or a direct table read — only from this
// endpoint's response, which is itself only ever populated by an
// Apple-verified purchase/restore (see supabase/functions/apple-subscription).
export function useSubscription(userId) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !userId) {
      setStatus(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("subscription-status");
    setStatus(error ? null : data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    subscription: status
      ? { status: status.status, current_period_end: status.currentPeriodEnd }
      : null,
    isPremium: Boolean(status?.isPremium),
    loading,
    refresh,
  };
}
