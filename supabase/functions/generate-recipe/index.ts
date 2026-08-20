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

    const { title, description, ingredientNames, tags } = await req.json();
    if (!title || !Array.isArray(ingredientNames) || ingredientNames.length === 0) {
      return json({ error: "title and ingredientNames[] are required" }, 400);
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
