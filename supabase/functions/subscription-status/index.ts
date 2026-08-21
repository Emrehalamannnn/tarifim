// Authoritative subscription-status endpoint. Reads the caller's stored
// public.subscriptions row (only ever written by apple-subscription after
// an Apple-verified purchase/restore) and revalidates directly with Apple's
// App Store Server API when that row looks stale, instead of trusting a
// cached value indefinitely. The client never derives premium status from
// local StoreKit state -- only from this response.
//
// Deploy: supabase functions deploy subscription-status
// Secrets: same Apple IAP secrets as apple-subscription (see _shared/apple-subscription.ts)
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyAppleSubscription } from "../_shared/apple-subscription.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return json({ error: "Invalid session" }, 401);
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: subscription } = await admin
      .from("subscriptions")
      .select("plan, status, store, store_transaction_id, current_period_end")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!subscription || subscription.store !== "app_store" || !subscription.store_transaction_id) {
      return json({ isPremium: false, status: "free", currentPeriodEnd: null });
    }

    const periodEnd = subscription.current_period_end ? new Date(subscription.current_period_end).getTime() : 0;
    const looksStale = periodEnd <= Date.now() || subscription.status === "in_grace_period";

    if (!looksStale) {
      return json({
        isPremium: subscription.plan === "premium" && subscription.status === "active",
        status: subscription.status,
        currentPeriodEnd: subscription.current_period_end,
      });
    }

    const entitlement = await verifyAppleSubscription(subscription.store_transaction_id);

    if (entitlement.status === "unknown") {
      // Verification itself failed (Apple unreachable, malformed response,
      // etc.), as opposed to Apple explicitly reporting expired/revoked.
      // Fail closed for *this response* without overwriting the last
      // known-good row, so a transient outage can't silently downgrade a
      // real subscriber's stored state.
      return json({ isPremium: false, status: subscription.status, currentPeriodEnd: subscription.current_period_end });
    }

    await admin
      .from("subscriptions")
      .update({
        plan: entitlement.entitled ? "premium" : "free",
        status: entitlement.status,
        current_period_end: entitlement.expirationDate,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    return json({
      isPremium: entitlement.entitled,
      status: entitlement.status,
      currentPeriodEnd: entitlement.expirationDate,
    });
  } catch (err) {
    console.error("subscription-status error", err);
    return json({ error: "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
