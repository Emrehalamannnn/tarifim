// Rate-limited login proxy. The client (useAuth's signInWithPassword) calls
// this instead of supabase.auth.signInWithPassword directly, so repeated
// failed attempts are throttled server-side. Two independent buckets:
//
// - per-IP (tight): stops one source from brute-forcing/spraying passwords.
//   Keyed off x-forwarded-for, which Supabase's own edge-function gateway
//   populates with the real connecting IP (same header their official
//   "get user location" example reads: supabase/examples/edge-functions/
//   .../location/index.ts) — but since a caller-supplied value can't be
//   fully ruled out on every deployment topology, this bucket is scoped to
//   the request source only and is never combined with the email, so even a
//   spoofed IP can only throttle the attacker's own bucket, not a victim's.
// - per-email (loose backstop): high enough that a handful of malicious
//   requests against a *known* victim email — an identifier fully under the
//   attacker's control — can't lock that victim out, while still bounding
//   total attempts against one account instead of leaving it unlimited.
//
// auth_rate_limits has no PostgREST access at all (see schema.sql), so this
// service-role-backed check can't be read or reset by the client.
//
// Deploy: supabase functions deploy auth-login --no-verify-jwt
// (--no-verify-jwt because the caller has no session yet — that's the point
// of a login endpoint.)
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_IP_ATTEMPTS = 5;
const MAX_EMAIL_ATTEMPTS = 20;
const WINDOW_MINUTES = 15;
const TOO_MANY_ATTEMPTS_MESSAGE = `Çok fazla başarısız deneme. Lütfen ${WINDOW_MINUTES} dakika sonra tekrar dene.`;

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || "unknown";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, password } = await req.json();
    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
      return json({ error: "E-posta ve şifre gerekli." }, 400);
    }
    const email_ = email.trim().toLowerCase();
    const ipIdentifier = `ip:${clientIp(req)}`;
    const emailIdentifier = `email:${email_}`;

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

    const [{ count: ipCount }, { count: emailCount }] = await Promise.all([
      admin
        .from("auth_rate_limits")
        .select("*", { count: "exact", head: true })
        .eq("identifier", ipIdentifier)
        .eq("action", "login")
        .gte("created_at", windowStart),
      admin
        .from("auth_rate_limits")
        .select("*", { count: "exact", head: true })
        .eq("identifier", emailIdentifier)
        .eq("action", "login")
        .gte("created_at", windowStart),
    ]);

    if ((ipCount ?? 0) >= MAX_IP_ATTEMPTS || (emailCount ?? 0) >= MAX_EMAIL_ATTEMPTS) {
      return json({ error: TOO_MANY_ATTEMPTS_MESSAGE }, 429);
    }

    // Record the attempt before checking the password, not after — a
    // client that only ever sends correct passwords still counts against
    // the window, same as any other login endpoint's throttling.
    await admin.from("auth_rate_limits").insert([
      { identifier: ipIdentifier, action: "login" },
      { identifier: emailIdentifier, action: "login" },
    ]);

    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data, error } = await anon.auth.signInWithPassword({ email: email_, password });

    if (error) {
      return json({ error: error.message }, error.status && error.status >= 400 ? error.status : 400);
    }

    // Successful login — clear this account's + this source's attempt
    // history so a legitimate user who mistyped their password a couple of
    // times isn't left sitting close to either threshold.
    await admin
      .from("auth_rate_limits")
      .delete()
      .in("identifier", [ipIdentifier, emailIdentifier])
      .eq("action", "login");

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
