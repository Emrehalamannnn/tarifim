import { useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import recipes from "../data/recipes.json";
import ingredients from "../data/ingredients.json";
import prices from "../data/prices.json";
import chains from "../data/chains.json";
import productCatalog from "../data/product_catalog.json";
import { computeBasketTotals } from "../lib/pricing";
import { computeRecipeCalories } from "../lib/nutrition";
import { useAppStore } from "../store/useAppStore";
import RecipeArt from "../components/RecipeArt";
import ChainBadge from "../components/ChainBadge";
import PageFade from "../components/PageFade";
import { tagLabel } from "../lib/tags";

const recipesById = new Map(recipes.map((r) => [r.id, r]));
const ingredientsById = new Map(ingredients.map((i) => [i.id, i]));
const productByIngredientId = new Map(productCatalog.map((p) => [p.ingredient_id, p]));

const currency = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 2,
});

export default function RecipeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const recipe = recipesById.get(id);
  const decision = useAppStore((s) => s.decisions[id]);
  const like = useAppStore((s) => s.like);
  const pass = useAppStore((s) => s.pass);
  const preferredChainIds = useAppStore((s) => s.preferredChainIds);
  const mealCount = useAppStore((s) => s.mealCounts[id]) ?? recipe?.servings ?? 1;
  const setMealCount = useAppStore((s) => s.setMealCount);
  const isInCart = decision?.liked === true;

  const preferredChains = useMemo(
    () => chains.filter((c) => preferredChainIds.includes(c.id)),
    [preferredChainIds]
  );

  const servingsMultiplier = recipe ? mealCount / recipe.servings : 1;

  const totals = useMemo(() => {
    if (!recipe) return [];
    return computeBasketTotals(recipe, ingredientsById, prices, preferredChains, servingsMultiplier);
  }, [recipe, preferredChains, servingsMultiplier]);

  const { caloriesPerServing } = useMemo(() => {
    if (!recipe) return { caloriesPerServing: 0 };
    return computeRecipeCalories(recipe, ingredientsById);
  }, [recipe]);

  if (!recipe) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-[var(--color-ink-soft)]">Tarif bulunamadı.</p>
        <button onClick={() => navigate("/")} className="text-[var(--color-paprika)] underline">
          Ana sayfaya dön
        </button>
      </div>
    );
  }

  const cheapest = totals[0];
  const maxTotal = totals.reduce((m, t) => Math.max(m, t.total), 0) || 1;

  return (
    <PageFade className="flex flex-1 flex-col pb-6">
      <div className="relative">
        <RecipeArt recipe={recipe} className="h-48 w-full" />
        <button
          onClick={() => navigate(-1)}
          aria-label="Geri"
          className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-surface)]/90 text-lg shadow-sm"
        >
          ←
        </button>
      </div>

      <div className="flex flex-col gap-1 px-5 pt-4">
        <h1 className="text-xl font-bold text-[var(--color-ink)]">{recipe.name}</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{recipe.description}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--color-ink-soft)]">
          <span>⏱ {recipe.cook_time_minutes} dk</span>
          <span>🍽 {recipe.servings} kişilik</span>
          <span>🔥 ~{Math.round(caloriesPerServing)} kcal/porsiyon</span>
          {recipe.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-[var(--color-cream-dark)] px-2 py-0.5">
              {tagLabel(tag)}
            </span>
          ))}
        </div>
      </div>

      <section className="mt-5 px-5">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
          Malzemeler
        </h2>
        <ul className="flex flex-col gap-1.5 text-sm text-[var(--color-ink)]">
          {recipe.ingredients.map((line) => {
            const ingredient = ingredientsById.get(line.ingredient_id);
            const product = productByIngredientId.get(line.ingredient_id);
            return (
              <li key={line.ingredient_id} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  {ingredient?.name}
                  {product && (
                    <a
                      href={product.migros.product_url}
                      target="_blank"
                      rel="noreferrer"
                      title={`Gerçek ürün: ${product.migros.product_name} (Migros)`}
                      className="text-xs text-[var(--color-paprika)] underline decoration-dotted"
                    >
                      {product.calories_per_100g} kcal/100g ↗
                    </a>
                  )}
                </span>
                <span className="shrink-0 text-[var(--color-ink-soft)]">
                  {line.quantity} {line.unit}
                </span>
              </li>
            );
          })}
        </ul>
        {recipe.ingredients.some((l) => productByIngredientId.has(l.ingredient_id)) && (
          <p className="mt-2 text-[11px] text-[var(--color-ink-soft)]">
            ↗ Migros'taki gerçek ürüne ve kalori bilgisine bağlanır. Şu an sadece bazı malzemeler
            için mevcut (pilot veri).
          </p>
        )}
      </section>

      <section className="mt-5 px-5">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
          Hazırlanışı
        </h2>
        <ol className="flex flex-col gap-2 text-sm text-[var(--color-ink)]">
          {recipe.steps.map((step, i) => (
            <li key={i} className="flex gap-2">
              <span className="font-bold text-[var(--color-paprika)]">{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-6 px-5">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
          Fiyat Karşılaştırması
        </h2>

        {!isInCart ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--color-cream-dark)] bg-[var(--color-surface)]/60 p-6 text-center">
            <span className="text-3xl">🔒</span>
            <p className="text-sm text-[var(--color-ink-soft)]">
              Bu tarifi beğenirsen hangi marketten daha ucuza alacağını görebilirsin.
            </p>
            <div className="mt-1 flex gap-3">
              <button
                onClick={() => pass(id)}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-surface)] text-xl text-[var(--color-tomato)] shadow-md active:scale-90"
                aria-label="Geç"
              >
                ✕
              </button>
              <button
                onClick={() => like(id)}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-surface)] text-xl text-[var(--color-olive)] shadow-md active:scale-90"
                aria-label="Beğen"
              >
                ♥
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between rounded-2xl bg-[var(--color-surface)] px-4 py-3 shadow-sm">
              <div>
                <p className="text-xs font-semibold text-[var(--color-ink-soft)]">
                  Kaç öğün hazırlamak istiyorsun?
                </p>
                <p className="text-[11px] text-[var(--color-ink-soft)]">
                  ~{Math.round(caloriesPerServing * mealCount)} kcal toplam
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setMealCount(id, mealCount - 1)}
                  disabled={mealCount <= 1}
                  aria-label="Azalt"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-cream)] text-lg font-bold text-[var(--color-ink)] active:scale-90 disabled:opacity-30"
                >
                  −
                </button>
                <span className="w-5 text-center text-lg font-bold text-[var(--color-ink)]">
                  {mealCount}
                </span>
                <button
                  onClick={() => setMealCount(id, mealCount + 1)}
                  aria-label="Artır"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-cream)] text-lg font-bold text-[var(--color-ink)] active:scale-90"
                >
                  +
                </button>
              </div>
            </div>

            {cheapest && (
              <div className="mb-3 flex items-center justify-between rounded-2xl bg-[var(--color-olive)] px-4 py-3 text-white shadow-sm">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
                    En Uygun Market
                  </p>
                  <p className="text-lg font-bold">{cheapest.chain.name}</p>
                </div>
                <p className="text-xl font-black">{currency.format(cheapest.total)}</p>
              </div>
            )}

            {totals.length > 1 && (
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                Diğer Marketler
              </p>
            )}
            <div className="flex flex-col gap-2">
              {totals.slice(1).map((entry) => (
                <div key={entry.chain.id} className="rounded-xl bg-[var(--color-surface)] p-3 shadow-sm">
                  <div className="mb-1.5 flex items-center justify-between">
                    <ChainBadge chain={entry.chain} />
                    <div className="text-right">
                      <p className="text-sm font-bold text-[var(--color-ink)]">
                        {currency.format(entry.total)}
                      </p>
                      {entry.delta > 0.01 && (
                        <p className="text-[11px] text-[var(--color-tomato)]">
                          +{currency.format(entry.delta)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-cream-dark)]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(entry.total / maxTotal) * 100}%`,
                        backgroundColor: entry.chain.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </PageFade>
  );
}
