// Rate-limited password-reset-request proxy. Throttles how often a reset
// email can be triggered for a given address, independent of Supabase's own
// IP-based limits, and — whether the address is rate-limited, unregistered,
// or genuinely just sent a reset email — always resolves to the same
// generic response so a caller can't use this endpoint to enumerate which
// emails have accounts or probe the rate-limit state itself.
//
// Deploy: supabase functions deploy auth-password-reset --no-verify-jwt
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_ATTEMPTS = 3;
const WINDOW_MINUTES = 60;

const GENERIC_RESPONSE = {
  message: "Bu e-posta ile bir hesap varsa, şifre sıfırlama bağlantısı gönderildi.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, redirectTo } = await req.json();
    if (typeof email !== "string" || !email.trim()) {
      return json({ error: "E-posta gerekli." }, 400);
    }
    const identifier = email.trim().toLowerCase();

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await admin
      .from("auth_rate_limits")
      .delete()
      .lt("created_at", new Date(Date.now() - 86_400_000).toISOString());

    const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
    const { count } = await admin
      .from("auth_rate_limits")
      .select("*", { count: "exact", head: true })
      .eq("identifier", identifier)
      .eq("action", "password_reset")
      .gte("created_at", windowStart);

    if ((count ?? 0) >= MAX_ATTEMPTS) {
      // Rate-limited — stop short of actually sending mail, but return the
      // same shape as success so this response can't be distinguished from
      // "email sent" by a caller probing the limit.
      return json(GENERIC_RESPONSE, 200);
    }

    await admin.from("auth_rate_limits").insert({ identifier, action: "password_reset" });

    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    await anon.auth.resetPasswordForEmail(identifier, {
      redirectTo: typeof redirectTo === "string" ? redirectTo : undefined,
    });

    return json(GENERIC_RESPONSE, 200);
  } catch (err) {
    console.error("auth-password-reset error", err);
    // Even on an unexpected error, don't leak internals — same generic
    // shape, just via the catch-all path.
    return json(GENERIC_RESPONSE, 200);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
