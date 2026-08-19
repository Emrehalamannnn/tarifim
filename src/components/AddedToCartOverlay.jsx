import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ingredients from "../data/ingredients.json";
import prices from "../data/prices.json";
import chains from "../data/chains.json";
import { computeRecipeCalories } from "../lib/nutrition";
import { computeBasketTotals } from "../lib/pricing";
import { useAppStore } from "../store/useAppStore";
import RecipeArt from "./RecipeArt";
import ChainBadge from "./ChainBadge";

const ingredientsById = new Map(ingredients.map((i) => [i.id, i]));

const currency = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 2,
});

const PARTICLE_EMOJI = ["🎉", "✨", "🛒", "🥳", "⭐️"];

function Confetti({ seed }) {
  const particles = useMemo(() => {
    let s = 0;
    for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) | 0;
    const rand = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
    return Array.from({ length: 16 }, (_, i) => {
      const angle = (Math.PI * 2 * i) / 16 + rand() * 0.3;
      const distance = 90 + rand() * 90;
      return {
        id: i,
        emoji: PARTICLE_EMOJI[Math.floor(rand() * PARTICLE_EMOJI.length)],
        dx: Math.cos(angle) * distance,
        dy: Math.sin(angle) * distance,
        delay: rand() * 0.15,
      };
    });
  }, [seed]);

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
      {particles.map((p) => (
        <motion.span
          key={p.id}
          className="absolute text-2xl"
          initial={{ opacity: 1, scale: 0, x: 0, y: 0 }}
          animate={{ opacity: 0, scale: 1, x: p.dx, y: p.dy }}
          transition={{ duration: 0.9, delay: p.delay, ease: "easeOut" }}
        >
          {p.emoji}
        </motion.span>
      ))}
    </div>
  );
}

export default function AddedToCartOverlay({ recipe, onClose, onSeePrices }) {
  const mealCount = useAppStore((s) => s.mealCounts[recipe.id]) ?? recipe.servings;
  const setMealCount = useAppStore((s) => s.setMealCount);
  const preferredChainIds = useAppStore((s) => s.preferredChainIds);

  const { caloriesPerServing } = useMemo(
    () => computeRecipeCalories(recipe, ingredientsById),
    [recipe]
  );

  const preferredChains = useMemo(
    () => chains.filter((c) => preferredChainIds.includes(c.id)),
    [preferredChainIds]
  );

  const servingsMultiplier = mealCount / recipe.servings;
  const totals = useMemo(
    () => computeBasketTotals(recipe, ingredientsById, prices, preferredChains, servingsMultiplier),
    [recipe, preferredChains, servingsMultiplier]
  );
  const cheapest = totals[0];
  const totalCaloriesForMeals = caloriesPerServing * mealCount;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-5 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="relative w-full max-w-sm overflow-hidden rounded-[28px] bg-[var(--color-surface)] shadow-2xl"
          initial={{ opacity: 0, scale: 0.8, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.85, y: 20 }}
          transition={{ type: "spring", stiffness: 340, damping: 26 }}
          onClick={(e) => e.stopPropagation()}
        >
          <Confetti seed={recipe.id} />

          <RecipeArt recipe={recipe} className="h-32 w-full" />

          <div className="flex flex-col items-center gap-1 px-6 pt-4 text-center">
            <p className="text-sm font-black uppercase tracking-wide text-[var(--color-olive)]">
              Sepete Eklendi! 🛒
            </p>
            <h2 className="text-xl font-bold text-[var(--color-ink)]">{recipe.name}</h2>
            <p className="text-xs text-[var(--color-ink-soft)]">
              Porsiyon başı ~{Math.round(caloriesPerServing)} kcal (yaklaşık)
            </p>
          </div>

          <div className="mx-6 mt-4 flex items-center justify-between rounded-2xl bg-[var(--color-cream)] px-4 py-3">
            <div>
              <p className="text-xs font-semibold text-[var(--color-ink-soft)]">
                Kaç öğün hazırlamak istiyorsun?
              </p>
              <p className="text-[11px] text-[var(--color-ink-soft)]">
                ~{Math.round(totalCaloriesForMeals)} kcal toplam
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMealCount(recipe.id, mealCount - 1)}
                disabled={mealCount <= 1}
                aria-label="Azalt"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-surface)] text-lg font-bold text-[var(--color-ink)] shadow-sm active:scale-90 disabled:opacity-30"
              >
                −
              </button>
              <span className="w-5 text-center text-lg font-bold text-[var(--color-ink)]">
                {mealCount}
              </span>
              <button
                onClick={() => setMealCount(recipe.id, mealCount + 1)}
                aria-label="Artır"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-surface)] text-lg font-bold text-[var(--color-ink)] shadow-sm active:scale-90"
              >
                +
              </button>
            </div>
          </div>

          {cheapest && (
            <div className="mx-6 mt-3 flex items-center justify-between rounded-2xl bg-[var(--color-olive)] px-4 py-2.5 text-white">
              <div className="flex items-center gap-2">
                <span className="text-xs opacity-80">En uygun</span>
                <ChainBadge chain={cheapest.chain} />
              </div>
              <span className="text-sm font-bold">{currency.format(cheapest.total)}</span>
            </div>
          )}

          <div className="flex flex-col gap-2 px-6 pb-6 pt-4">
            <button
              onClick={onClose}
              className="rounded-full bg-[var(--color-paprika)] px-5 py-3 text-sm font-bold text-white shadow-sm active:scale-95"
            >
              ✓ Sepete Eklendi, Devam Et
            </button>
            <button
              onClick={onSeePrices}
              className="rounded-full px-5 py-2 text-sm font-medium text-[var(--color-ink-soft)] active:scale-95"
            >
              Fiyatları Karşılaştır
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
