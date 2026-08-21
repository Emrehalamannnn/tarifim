// Tells the frontend (useCoachAccess) whether the signed-in caller is
// authorized for the AI coach, without ever shipping the allowlisted
// email(s) to the browser. The ai-coach Edge Function re-checks the same
// allowlist independently before actually answering a message — this
// endpoint only controls tab/page visibility, so it does no rate limiting
// or Anthropic call and is cheap to hit on every load.
//
// Deploy: supabase functions deploy coach-access
// Secret: supabase secrets set AI_COACH_ALLOWED_EMAIL=someone@example.com
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function isCoachAllowed(user: { email?: string | null; email_confirmed_at?: string | null }): boolean {
  const allowed = Deno.env.get("AI_COACH_ALLOWED_EMAIL")?.toLowerCase().trim();
  const email = user.email?.toLowerCase().trim();
  return !!allowed && !!email && !!user.email_confirmed_at && email === allowed;
}

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

    return json({ allowed: isCoachAllowed(user) });
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
