import { useCallback, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

// Read-only view of the current user's entitlement (public.subscriptions —
// see supabase/schema.sql). No client-side write path exists on purpose:
// a user must never be able to grant themselves premium. Until a payment
// processor is wired up (StoreKit/RevenueCat on iOS), the only way a row
// gets here is a manual SQL Editor insert for testing.
export function useSubscription(userId) {
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !userId) {
      setSubscription(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    setSubscription(data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isPremium =
    subscription?.plan === "premium" &&
    subscription?.status === "active" &&
    (!subscription.current_period_end || new Date(subscription.current_period_end) > new Date());

  return { subscription, isPremium, loading, refresh };
}
