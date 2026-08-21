// AI health coach — premium-gated chat backed by Claude. Runs server-side
// (Supabase Edge Function, Deno) so ANTHROPIC_API_KEY never reaches the
// browser, and so premium status is re-verified here against the
// `subscriptions` table rather than trusted from the client (a client could
// otherwise call this function directly and bypass a UI-only paywall).
//
// Deploy: supabase functions deploy ai-coach
// Secret: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically by
// the Edge Functions runtime — do not set them yourself.)
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.68";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_TOTAL_CONTENT_LENGTH = 12000;

const RATE_LIMIT_MAX_REQUESTS = 20;
const RATE_LIMIT_WINDOW_MINUTES = 10;

const SYSTEM_PROMPT = `Sen Tarifim uygulamasının yapay zeka sağlık koçusun. Kullanıcıların sepetindeki tariflere, kalori bilgilerine ve beslenme tercihlerine göre kişiselleştirilmiş, samimi ve pratik beslenme/sağlık tavsiyeleri veriyorsun.

Kurallar:
- Her zaman Türkçe yanıt ver.
- Tıbbi teşhis koyma veya reçete önerme; ciddi sağlık sorunlarında bir doktora danışılmasını öner.
- Kullanıcının uygulama içindeki gerçek verilerine (sepetteki tarifler, kalori hedefleri, beslenme filtresi) referans ver, genel geçer tavsiyelerden kaçın.
- Kısa ve uygulanabilir öneriler sun, uzun makaleler yazma.`;

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

    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("plan, status, current_period_end")
      .eq("user_id", user.id)
      .maybeSingle();

    const isPremium =
      subscription?.plan === "premium" &&
      subscription?.status === "active" &&
      (!subscription.current_period_end || new Date(subscription.current_period_end) > new Date());

    if (!isPremium) {
      return json({ error: "Premium subscription required" }, 403);
    }

    // Service-role client, distinct from the user-scoped `supabase` above:
    // ai_rate_limits has no PostgREST-facing policies (see schema.sql), so
    // only a genuine service-role request can read or write it.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await admin
      .from("ai_rate_limits")
      .delete()
      .lt("created_at", new Date(Date.now() - 86_400_000).toISOString());

    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();
    const { count } = await admin
      .from("ai_rate_limits")
      .select("*", { count: "exact", head: true })
      .eq("identifier", user.id)
      .eq("action", "ai-coach")
      .gte("created_at", windowStart);

    if ((count ?? 0) >= RATE_LIMIT_MAX_REQUESTS) {
      return json(
        { error: `Too many requests. Please try again in ${RATE_LIMIT_WINDOW_MINUTES} minutes.` },
        429
      );
    }

    await admin.from("ai_rate_limits").insert({ identifier: user.id, action: "ai-coach" });

    const { messages, context } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: "messages[] is required" }, 400);
    }
    if (messages.length > MAX_MESSAGES) {
      return json({ error: `Too many messages (max ${MAX_MESSAGES})` }, 400);
    }

    let totalContentLength = 0;
    for (const message of messages) {
      if (!message || typeof message.content !== "string") {
        return json({ error: "Each message must have string content" }, 400);
      }
      if (message.content.length > MAX_MESSAGE_LENGTH) {
        return json({ error: `Message exceeds max length of ${MAX_MESSAGE_LENGTH} characters` }, 400);
      }
      totalContentLength += message.content.length;
    }
    if (totalContentLength > MAX_TOTAL_CONTENT_LENGTH) {
      return json({ error: `Combined message content exceeds max length of ${MAX_TOTAL_CONTENT_LENGTH} characters` }, 400);
    }

    const contextLines = [];
    if (context?.dietaryFilter) contextLines.push(`Beslenme filtresi: ${context.dietaryFilter}`);
    if (context?.cartRecipeNames?.length) {
      contextLines.push(`Sepetindeki tarifler: ${context.cartRecipeNames.join(", ")}`);
    }
    if (context?.dailyCalorieGoal) contextLines.push(`Günlük kalori hedefi: ${context.dailyCalorieGoal} kcal`);

    const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
    const response = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      system: contextLines.length
        ? `${SYSTEM_PROMPT}\n\nKullanıcı bağlamı:\n${contextLines.join("\n")}`
        : SYSTEM_PROMPT,
      messages,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    return json({ reply: textBlock?.text ?? "" });
  } catch (err) {
    console.error("ai-coach error", err);
    return json({ error: "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
