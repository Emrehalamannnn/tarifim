import { useMemo } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import RecipeArt from "./RecipeArt";
import { tagLabel } from "../lib/tags";
import ingredients from "../data/ingredients.json";
import { computeRecipeCalories } from "../lib/nutrition";

const SWIPE_THRESHOLD = 110;
const VIEW_UP_THRESHOLD = 90;
const ingredientsById = new Map(ingredients.map((i) => [i.id, i]));

export default function SwipeCard({ recipe, active, stackIndex, onSwipe, onViewDetail }) {
  const previewIngredients = recipe.ingredients.slice(0, 5);
  const extraCount = recipe.ingredients.length - previewIngredients.length;
  const caloriesPerServing = useMemo(
    () => Math.round(computeRecipeCalories(recipe, ingredientsById).caloriesPerServing),
    [recipe]
  );
  const x = useMotionValue(0);
  const dragY = useMotionValue(0);
  const rotate = useTransform(x, [-220, 220], [-14, 14]);
  const likeOpacity = useTransform(x, [20, 120], [0, 1]);
  const passOpacity = useTransform(x, [-120, -20], [1, 0]);

  function handleDragEnd(_, info) {
    const punchX = info.offset.x + info.velocity.x * 0.15;

    if (Math.abs(punchX) > SWIPE_THRESHOLD) {
      const direction = punchX > 0 ? "right" : "left";
      animate(x, direction === "right" ? 640 : -640, {
        type: "spring",
        stiffness: 260,
        damping: 24,
      });
      window.setTimeout(() => onSwipe(direction), 180);
      return;
    }

    if (info.offset.y < -VIEW_UP_THRESHOLD && Math.abs(info.offset.x) < 60) {
      animate(x, 0, { type: "spring", stiffness: 400, damping: 30 });
      animate(dragY, 0, { type: "spring", stiffness: 400, damping: 30 });
      onViewDetail();
      return;
    }

    animate(x, 0, { type: "spring", stiffness: 400, damping: 30 });
    animate(dragY, 0, { type: "spring", stiffness: 400, damping: 30 });
  }

  return (
    <motion.div
      className="absolute inset-0"
      style={{ zIndex: 20 - stackIndex }}
      animate={{ scale: 1 - stackIndex * 0.045, y: stackIndex * 12 }}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
    >
      <motion.div
        className="h-full w-full"
        style={{ x, y: dragY, rotate }}
        drag={active}
        dragElastic={0.9}
        onDragEnd={active ? handleDragEnd : undefined}
      >
        <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[28px] bg-[var(--color-surface)] shadow-[0_20px_40px_-12px_rgba(43,29,18,0.35)]">
          <RecipeArt recipe={recipe} className="h-[52%] w-full" />
          <div className="flex flex-1 flex-col gap-2 p-5">
            <div>
              <h2 className="text-xl font-bold text-[var(--color-ink)]">{recipe.name}</h2>
            </div>
            <p className="line-clamp-2 text-sm text-[var(--color-ink-soft)]">{recipe.description}</p>

            <div className="mt-1">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                Malzemeler
              </p>
              <div className="flex flex-wrap gap-1.5">
                {previewIngredients.map((line) => (
                  <span
                    key={line.ingredient_id}
                    className="rounded-full bg-[var(--color-cream)] px-2.5 py-1 text-xs text-[var(--color-ink-soft)]"
                  >
                    {ingredientsById.get(line.ingredient_id)?.name ?? line.ingredient_id}
                  </span>
                ))}
                {extraCount > 0 && (
                  <span className="rounded-full bg-[var(--color-cream)] px-2.5 py-1 text-xs text-[var(--color-ink-soft)]">
                    +{extraCount} tane daha
                  </span>
                )}
              </div>
            </div>

            <div className="mt-auto flex flex-wrap items-center gap-2 pt-1 text-xs text-[var(--color-ink-soft)]">
              <span>⏱ {recipe.cook_time_minutes} dk</span>
              <span>🍽 {recipe.servings} kişilik</span>
              <span>🔥 {caloriesPerServing} kcal</span>
              {recipe.tags.slice(0, 2).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-[var(--color-cream-dark)] px-2 py-0.5"
                >
                  {tagLabel(tag)}
                </span>
              ))}
            </div>
          </div>

          {active && (
            <>
              <motion.div
                style={{ opacity: likeOpacity }}
                className="absolute left-4 top-4 -rotate-12 rounded-lg border-4 border-[var(--color-olive)] px-3 py-1 text-lg font-black tracking-wide text-[var(--color-olive)]"
              >
                BEĞENDİM
              </motion.div>
              <motion.div
                style={{ opacity: passOpacity }}
                className="absolute right-4 top-4 rotate-12 rounded-lg border-4 border-[var(--color-tomato)] px-3 py-1 text-lg font-black tracking-wide text-[var(--color-tomato)]"
              >
                GEÇ
              </motion.div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
