// Tells the frontend (useCoachAccess) whether the signed-in caller currently
// holds a verified Tarifim Premium subscription, without shipping any Apple
// or Supabase internals to the browser. Delegates to hasActivePremium (see
// _shared/apple-subscription.ts), which only ever reflects a row that
// apple-subscription/subscription-status wrote after independently
// verifying the purchase with Apple -- never client-writable. The ai-coach
// Edge Function re-checks the same entitlement independently before
// actually answering a message -- this endpoint only controls tab/page
// visibility, so it does no rate limiting or Anthropic call and is cheap to
// hit on every load.
//
// Deploy: supabase functions deploy coach-access
import { createClient } from "npm:@supabase/supabase-js@2";
import { hasActivePremium } from "../_shared/apple-subscription.ts";

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

    return json({ allowed: await hasActivePremium(admin, user.id) });
  } catch (err) {
    console.error("coach-access error", err);
    return json({ error: "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
