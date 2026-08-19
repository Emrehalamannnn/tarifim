import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import recipes from "../data/recipes.json";
import { useAppStore, recipeIds } from "../store/useAppStore";
import SwipeCard from "./SwipeCard";
import EmptyState from "./EmptyState";
import AddedToCartOverlay from "./AddedToCartOverlay";

const recipesById = new Map(recipes.map((r) => [r.id, r]));
const VISIBLE_STACK = 3;

export default function SwipeDeck() {
  const navigate = useNavigate();
  const decisions = useAppStore((s) => s.decisions);
  const deckIds = useMemo(
    () => recipeIds.filter((id) => !decisions[id]),
    [decisions]
  );
  const dietaryFilter = useAppStore((s) => s.dietaryFilter);
  const like = useAppStore((s) => s.like);
  const pass = useAppStore((s) => s.pass);
  const undoLast = useAppStore((s) => s.undoLast);
  const decidedCount = useAppStore((s) => s.decided.length);
  const resetDeck = useAppStore((s) => s.resetDeck);
  const [cartAddedRecipe, setCartAddedRecipe] = useState(null);

  const filteredIds = dietaryFilter
    ? deckIds.filter((id) => recipesById.get(id)?.tags.includes(dietaryFilter))
    : deckIds;

  const visible = filteredIds.slice(0, VISIBLE_STACK).map((id) => recipesById.get(id));
  const topId = visible[0]?.id;

  function handleSwipe(direction) {
    if (!topId) return;
    if (direction === "right") {
      like(topId);
      setCartAddedRecipe(recipesById.get(topId));
    } else {
      pass(topId);
    }
  }

  if (visible.length === 0 && !cartAddedRecipe) {
    return (
      <EmptyState
        emoji="🍽️"
        title="Şimdilik bu kadar!"
        description="Bugünlük tüm tarifleri gördün. Sepetine eklediklerine Sepetim sekmesinden ulaşabilirsin."
        action={
          decidedCount > 0 ? (
            <button
              onClick={resetDeck}
              className="mt-2 rounded-full bg-[var(--color-paprika)] px-5 py-2 text-sm font-semibold text-white shadow-sm active:scale-95"
            >
              Destesi Yenile
            </button>
          ) : null
        }
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col px-4 pb-4 pt-2">
      <div className="relative flex-1">
        {visible.map((recipe, i) => (
          <SwipeCard
            key={recipe.id}
            recipe={recipe}
            active={i === 0}
            stackIndex={i}
            onSwipe={handleSwipe}
            onViewDetail={() => navigate(`/recipe/${recipe.id}`)}
          />
        ))}
      </div>

      <div className="mt-4 flex items-center justify-center gap-6">
        <button
          aria-label="Geç"
          onClick={() => handleSwipe("left")}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-surface)] text-2xl text-[var(--color-tomato)] shadow-md transition-transform active:scale-90"
        >
          ✕
        </button>
        <button
          aria-label="Son işlemi geri al"
          onClick={undoLast}
          disabled={decidedCount === 0}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--color-surface)] text-lg text-[var(--color-ink-soft)] shadow-md transition-transform active:scale-90 disabled:opacity-30"
        >
          ↺
        </button>
        <button
          aria-label="Beğen"
          onClick={() => handleSwipe("right")}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-surface)] text-2xl text-[var(--color-olive)] shadow-md transition-transform active:scale-90"
        >
          ♥
        </button>
      </div>

      {cartAddedRecipe && (
        <AddedToCartOverlay
          recipe={cartAddedRecipe}
          onClose={() => setCartAddedRecipe(null)}
          onSeePrices={() => {
            const id = cartAddedRecipe.id;
            setCartAddedRecipe(null);
            navigate(`/recipe/${id}`);
          }}
        />
      )}
    </div>
  );
}
