import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import recipes from "../data/recipes.json";
import ingredients from "../data/ingredients.json";
import { useAppStore, cartRecipeIdsFrom } from "../store/useAppStore";
import { computeRecipeCalories } from "../lib/nutrition";
import RecipeArt from "../components/RecipeArt";
import EmptyState from "../components/EmptyState";
import PageFade from "../components/PageFade";
import ConfirmDialog from "../components/ConfirmDialog";
import ShoppingListModal from "../components/ShoppingListModal";

const recipesById = new Map(recipes.map((r) => [r.id, r]));
const ingredientsById = new Map(ingredients.map((i) => [i.id, i]));

function CartRow({ recipe }) {
  const [expanded, setExpanded] = useState(false);
  const mealCount = useAppStore((s) => s.mealCounts[recipe.id]) ?? recipe.servings;
  const setMealCount = useAppStore((s) => s.setMealCount);
  const pass = useAppStore((s) => s.pass);

  const { caloriesPerServing } = useMemo(
    () => computeRecipeCalories(recipe, ingredientsById),
    [recipe]
  );

  return (
    <li className="overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-sm">
      <div className="flex items-center gap-3 p-3">
        <Link to={`/recipe/${recipe.id}`} className="shrink-0">
          <RecipeArt recipe={recipe} className="h-16 w-16 rounded-xl" />
        </Link>
        <div className="min-w-0 flex-1">
          <Link to={`/recipe/${recipe.id}`}>
            <h3 className="truncate text-sm font-semibold text-[var(--color-ink)]">
              {recipe.name}
            </h3>
          </Link>
          <p className="text-xs text-[var(--color-ink-soft)]">
            🔥 ~{Math.round(caloriesPerServing * mealCount)} kcal toplam
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <button
              onClick={() => setMealCount(recipe.id, mealCount - 1)}
              disabled={mealCount <= 1}
              aria-label="Azalt"
              className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-cream)] text-sm font-bold active:scale-90 disabled:opacity-30"
            >
              −
            </button>
            <span className="w-5 text-center text-sm font-bold text-[var(--color-ink)]">
              {mealCount}
            </span>
            <button
              onClick={() => setMealCount(recipe.id, mealCount + 1)}
              aria-label="Artır"
              className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-cream)] text-sm font-bold active:scale-90"
            >
              +
            </button>
            <span className="text-[11px] text-[var(--color-ink-soft)]">öğün</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <button
            onClick={() => pass(recipe.id)}
            aria-label="Sepetten çıkar"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-cream)] text-xs text-[var(--color-tomato)] active:scale-90"
          >
            ✕
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-label="Malzemeleri göster"
            className={`text-xs text-[var(--color-ink-soft)] transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            ▾
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[var(--color-cream-dark)] bg-[var(--color-cream)] px-4 py-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
            Malzemeler
          </p>
          <ul className="flex flex-col gap-1 text-xs text-[var(--color-ink-soft)]">
            {recipe.ingredients.map((line) => (
              <li key={line.ingredient_id} className="flex justify-between gap-2">
                <span>{ingredientsById.get(line.ingredient_id)?.name}</span>
                <span>
                  {line.quantity} {line.unit}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

export default function CartPage() {
  const decisions = useAppStore((s) => s.decisions);
  const clearCart = useAppStore((s) => s.clearCart);
  const cartIds = useMemo(() => cartRecipeIdsFrom(decisions), [decisions]);
  const cartRecipes = useMemo(
    () => cartIds.map((id) => recipesById.get(id)).filter(Boolean),
    [cartIds]
  );
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [shoppingListOpen, setShoppingListOpen] = useState(false);

  return (
    <PageFade>
      <header className="flex items-start justify-between px-5 pb-2 pt-5">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-ink)]">Sepetim</h1>
          <p className="text-xs text-[var(--color-ink-soft)]">
            {cartRecipes.length} tarif sepetinde.
          </p>
        </div>
        {cartRecipes.length > 0 && (
          <button
            onClick={() => setConfirmClearOpen(true)}
            className="rounded-full bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--color-tomato)] shadow-sm active:scale-95"
          >
            Sepeti Boşalt
          </button>
        )}
      </header>

      {cartRecipes.length === 0 ? (
        <EmptyState
          emoji="🛒"
          title="Sepetin boş"
          description="Keşfet sekmesinde tarifleri sağa kaydırarak sepetine ekle."
          action={
            <Link
              to="/"
              className="mt-2 rounded-full bg-[var(--color-paprika)] px-5 py-2 text-sm font-semibold text-white shadow-sm active:scale-95"
            >
              Tarifleri Keşfet
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3 px-4 pb-4">
          {cartRecipes.map((recipe) => (
            <CartRow key={recipe.id} recipe={recipe} />
          ))}
        </ul>
      )}

      {cartRecipes.length > 0 && (
        <div className="sticky bottom-3 z-40 flex justify-center px-4 pt-2">
          <button
            onClick={() => setShoppingListOpen(true)}
            className="flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-6 py-3.5 text-sm font-bold text-white shadow-xl active:scale-95"
          >
            🛒 Alışveriş Listesi Oluştur
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmClearOpen}
        title="Sepeti boşaltmak istediğine emin misin?"
        description="Sepetindeki tüm tarifler kaldırılacak. Bu işlem geri alınamaz."
        confirmLabel="Sepeti Boşalt"
        onCancel={() => setConfirmClearOpen(false)}
        onConfirm={() => {
          clearCart();
          setConfirmClearOpen(false);
        }}
      />

      <ShoppingListModal
        open={shoppingListOpen}
        onClose={() => setShoppingListOpen(false)}
        cartRecipes={cartRecipes}
      />
    </PageFade>
  );
}
