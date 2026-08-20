// Rate-limited login proxy. The client (useAuth's signInWithPassword) calls
// this instead of supabase.auth.signInWithPassword directly, so repeated
// failed attempts against one email are throttled server-side per
// *identifier* — Supabase's own platform rate limits are IP-based and don't
// stop credential stuffing spread across many IPs at a single target
// account. auth_rate_limits has no PostgREST access at all (see schema.sql),
// so this service-role-backed check can't be read or reset by the client.
//
// Deploy: supabase functions deploy auth-login --no-verify-jwt
// (--no-verify-jwt because the caller has no session yet — that's the point
// of a login endpoint.)
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, password } = await req.json();
    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
      return json({ error: "E-posta ve şifre gerekli." }, 400);
    }
    const identifier = email.trim().toLowerCase();

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Opportunistic cleanup so this table doesn't grow forever without
    // needing a separate cron job.
    await admin
      .from("auth_rate_limits")
      .delete()
      .lt("created_at", new Date(Date.now() - 86_400_000).toISOString());

    const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
    const { count } = await admin
      .from("auth_rate_limits")
      .select("*", { count: "exact", head: true })
      .eq("identifier", identifier)
      .eq("action", "login")
      .gte("created_at", windowStart);

    if ((count ?? 0) >= MAX_ATTEMPTS) {
      return json(
        { error: `Çok fazla başarısız deneme. Lütfen ${WINDOW_MINUTES} dakika sonra tekrar dene.` },
        429
      );
    }

    // Record the attempt before checking the password, not after — a
    // client that only ever sends correct passwords still counts against
    // the window, same as any other login endpoint's throttling.
    await admin.from("auth_rate_limits").insert({ identifier, action: "login" });

    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data, error } = await anon.auth.signInWithPassword({ email: identifier, password });

    if (error) {
      return json({ error: error.message }, error.status && error.status >= 400 ? error.status : 400);
    }

    // Successful login — clear this identifier's attempt history so a
    // legitimate user who mistyped their password a couple of times isn't
    // left sitting close to the threshold.
    await admin.from("auth_rate_limits").delete().eq("identifier", identifier).eq("action", "login");

    return json({ session: data.session, user: data.user }, 200);
  } catch (err) {
    console.error("auth-login error", err);
    return json({ error: "Beklenmeyen bir hata oluştu." }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
