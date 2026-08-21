// Registers a verified Apple subscription purchase/restore against the
// caller's own account. Client StoreKit state is never sufficient on its
// own -- every call independently re-verifies the given transaction with
// Apple's App Store Server API (see _shared/apple-subscription.ts) before
// writing anything. Writes go through the service-role client only:
// public.subscriptions has zero client-facing insert/update policy (see
// schema.sql), so a caller can never self-grant premium.
//
// Deploy: supabase functions deploy apple-subscription
// Secrets: APPLE_IAP_KEY_ID, APPLE_IAP_ISSUER_ID, APPLE_IAP_PRIVATE_KEY, APPLE_BUNDLE_ID
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

    const body = await req.json().catch(() => null);
    if (body?.action !== "register") {
      return json({ error: "Unsupported action" }, 400);
    }
    const transactionId = body?.transactionId;
    if (!transactionId || typeof transactionId !== "string") {
      return json({ error: "transactionId is required" }, 400);
    }

    const entitlement = await verifyAppleSubscription(transactionId);

    if (!entitlement.entitled) {
      return json({ error: "Apple did not report an active entitlement for this transaction" }, 403);
    }

    // Apple includes the appAccountToken we set at purchase time (see
    // storekit.js / StoreKitPlugin.swift) in the signed transaction payload.
    // It must be present and must match the caller's own Supabase user id --
    // a missing token (e.g. a transaction purchased before this identity
    // binding existed, or outside this app's purchase flow) is treated the
    // same as a mismatch and fails closed, rather than being silently
    // accepted.
    if (!entitlement.appAccountToken || entitlement.appAccountToken !== user.id) {
      console.error("apple-subscription: appAccountToken missing or mismatched for transaction", transactionId);
      return json({ error: "Transaction does not belong to this account" }, 403);
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { error: upsertError } = await admin.from("subscriptions").upsert(
      {
        user_id: user.id,
        plan: "premium",
        status: entitlement.status,
        store: "app_store",
        store_transaction_id: entitlement.transactionId,
        original_transaction_id: entitlement.originalTransactionId,
        current_period_end: entitlement.expirationDate,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (upsertError) {
      console.error("apple-subscription: upsert failed", upsertError);
      return json({ error: "Failed to record subscription" }, 500);
    }

    return json({
      isPremium: true,
      status: entitlement.status,
      currentPeriodEnd: entitlement.expirationDate,
    });
  } catch (err) {
    console.error("apple-subscription error", err);
    return json({ error: "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
