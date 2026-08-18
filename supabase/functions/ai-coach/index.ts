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

    const { messages, context } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: "messages[] is required" }, 400);
    }

    const contextLines = [];
    if (context?.dietaryFilter) contextLines.push(`Beslenme filtresi: ${context.dietaryFilter}`);
    if (context?.cartRecipeNames?.length) {
      contextLines.push(`Sepetindeki tarifler: ${context.cartRecipeNames.join(", ")}`);
    }
    if (context?.dailyCalorieGoal) contextLines.push(`Günlük kalori hedefi: ${context.dailyCalorieGoal} kcal`);

    const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
    const response = await anthropic.messages.create({
      model: "claude-opus-5",
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
