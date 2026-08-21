// Generates a Turkish recipe write-up for a post whose author left the
// optional "Tarif" field blank in CreatePostModal. Runs server-side so
// ANTHROPIC_API_KEY never reaches the browser — same secret ai-coach
// already uses. No premium gate here (unlike ai-coach): this backs a core
// posting flow every logged-in user can hit, not a paid feature, so it uses
// claude-sonnet-5 rather than opus to keep per-post cost down. The caller
// (useCommunityFeed's addPost) sets posts.recipe_is_ai_generated = true
// whenever it uses this function's output, so PostCard can disclose it.
//
// Deploy: supabase functions deploy generate-recipe --use-api
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.68";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_LIMIT_MAX_REQUESTS = 15;
const RATE_LIMIT_WINDOW_MINUTES = 10;

// Bounds total per-account Anthropic spend across a day — the 10-minute
// burst window above resets on its own, so without this a single account
// could otherwise call this endpoint every 10 minutes all day long. Doesn't
// stop someone from creating many accounts, but caps the damage any one of
// them can do (see the P1 note this was added for).
const DAILY_LIMIT_MAX_REQUESTS = 50;
const DAILY_LIMIT_WINDOW_MS = 86_400_000;

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_INGREDIENTS = 30;
const MAX_INGREDIENT_LENGTH = 60;
const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 30;

const SYSTEM_PROMPT = `Sen Tarifim uygulamasında bir kullanıcının paylaştığı yemek fotoğrafı için tarif metni yazan bir asistansın. Kullanıcı tarif başlığını, kısa açıklamasını ve kullandığı malzemeleri verdi; sen bunlardan pratik, ev mutfağına uygun, adım adım bir tarif yaz.

Kurallar:
- Sadece Türkçe yaz.
- Verilen malzemeleri kullan, gerekirse tuz/su/karabiber gibi temel mutfak malzemelerini de ekleyebilirsin ama listede olmayan ana malzeme ekleme.
- 4-7 arası kısa, numaralı adım yaz. Süre/ölçü belirtirken makul ev mutfağı değerleri kullan.
- Başlık, giriş cümlesi veya kapanış yorumu ekleme — sadece numaralı adımları döndür.
- Sadece düz metin döndür, markdown başlığı veya yıldız kullanma.`;

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
    const dayStart = new Date(Date.now() - DAILY_LIMIT_WINDOW_MS).toISOString();
    const [{ count }, { count: dailyCount }] = await Promise.all([
      admin
        .from("ai_rate_limits")
        .select("*", { count: "exact", head: true })
        .eq("identifier", user.id)
        .eq("action", "generate-recipe")
        .gte("created_at", windowStart),
      admin
        .from("ai_rate_limits")
        .select("*", { count: "exact", head: true })
        .eq("identifier", user.id)
        .eq("action", "generate-recipe")
        .gte("created_at", dayStart),
    ]);

    if ((count ?? 0) >= RATE_LIMIT_MAX_REQUESTS) {
      return json(
        { error: `Too many requests. Please try again in ${RATE_LIMIT_WINDOW_MINUTES} minutes.` },
        429
      );
    }
    if ((dailyCount ?? 0) >= DAILY_LIMIT_MAX_REQUESTS) {
      return json({ error: "Daily generation limit reached. Please try again tomorrow." }, 429);
    }

    await admin.from("ai_rate_limits").insert({ identifier: user.id, action: "generate-recipe" });

    const { title, description, ingredientNames, tags } = await req.json();
    if (typeof title !== "string" || !title.trim() || !Array.isArray(ingredientNames) || ingredientNames.length === 0) {
      return json({ error: "title and ingredientNames[] are required" }, 400);
    }
    if (title.length > MAX_TITLE_LENGTH) {
      return json({ error: `title exceeds max length of ${MAX_TITLE_LENGTH} characters` }, 400);
    }
    if (description !== undefined && description !== null) {
      if (typeof description !== "string" || description.length > MAX_DESCRIPTION_LENGTH) {
        return json({ error: `description exceeds max length of ${MAX_DESCRIPTION_LENGTH} characters` }, 400);
      }
    }
    if (ingredientNames.length > MAX_INGREDIENTS) {
      return json({ error: `ingredientNames exceeds max count of ${MAX_INGREDIENTS}` }, 400);
    }
    if (ingredientNames.some((n) => typeof n !== "string" || n.length > MAX_INGREDIENT_LENGTH)) {
      return json({ error: `each ingredient name must be a string up to ${MAX_INGREDIENT_LENGTH} characters` }, 400);
    }
    if (tags !== undefined && tags !== null) {
      if (!Array.isArray(tags) || tags.length > MAX_TAGS || tags.some((t) => typeof t !== "string" || t.length > MAX_TAG_LENGTH)) {
        return json({ error: `tags must be an array of up to ${MAX_TAGS} strings, each up to ${MAX_TAG_LENGTH} characters` }, 400);
      }
    }

    const promptLines = [`Tarif adı: ${title}`];
    if (description) promptLines.push(`Açıklama: ${description}`);
    promptLines.push(`Malzemeler: ${ingredientNames.join(", ")}`);
    if (Array.isArray(tags) && tags.length) promptLines.push(`Etiketler: ${tags.join(", ")}`);

    const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: promptLines.join("\n") }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const recipeText = textBlock?.text?.trim() ?? "";
    if (!recipeText) {
      return json({ error: "Recipe generation returned no text" }, 502);
    }

    return json({ recipeText });
  } catch (err) {
    console.error("generate-recipe error", err);
    return json({ error: "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
