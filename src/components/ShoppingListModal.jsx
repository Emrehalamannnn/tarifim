import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ingredients from "../data/ingredients.json";
import { useAppStore } from "../store/useAppStore";
import { buildShoppingList, formatQuantity, shoppingListToText } from "../lib/shoppingList";
import RecipeArt from "./RecipeArt";

const ingredientsById = new Map(ingredients.map((i) => [i.id, i]));

export default function ShoppingListModal({ open, onClose, cartRecipes }) {
  const mealCounts = useAppStore((s) => s.mealCounts);
  const setMealCount = useAppStore((s) => s.setMealCount);
  const [selectedIds, setSelectedIds] = useState(() => cartRecipes.map((r) => r.id));
  const [step, setStep] = useState("select");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedIds(cartRecipes.map((r) => r.id));
      setStep("select");
      setCopied(false);
    }
  }, [open, cartRecipes]);

  function toggleSelected(id) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  const selectedRecipes = useMemo(
    () => cartRecipes.filter((r) => selectedIds.includes(r.id)),
    [cartRecipes, selectedIds]
  );

  const shoppingList = useMemo(() => {
    if (step !== "list") return [];
    const entries = selectedRecipes.map((recipe) => ({
      recipe,
      mealCount: mealCounts[recipe.id] ?? recipe.servings,
    }));
    return buildShoppingList(entries, ingredientsById);
  }, [step, selectedRecipes, mealCounts]);

  async function handleCopy() {
    const text = shoppingListToText(shoppingList);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard API unavailable — fail silently, list is still on screen
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[55] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="flex max-h-[85vh] w-full max-w-sm flex-col overflow-hidden rounded-t-[28px] bg-[var(--color-surface)] shadow-2xl sm:rounded-[28px]"
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--color-cream-dark)] px-5 py-4">
              <h2 className="text-base font-bold text-[var(--color-ink)]">
                {step === "select" ? "Tariflerini Seç" : "Alışveriş Listen"}
              </h2>
              <button
                onClick={onClose}
                aria-label="Kapat"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-cream)] text-sm active:scale-90"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {step === "select" ? (
                cartRecipes.length === 0 ? (
                  <p className="py-8 text-center text-sm text-[var(--color-ink-soft)]">
                    Sepetinde henüz tarif yok.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2.5">
                    {cartRecipes.map((recipe) => {
                      const isSelected = selectedIds.includes(recipe.id);
                      const count = mealCounts[recipe.id] ?? recipe.servings;
                      return (
                        <li
                          key={recipe.id}
                          className={`flex items-center gap-3 rounded-2xl border-2 p-2 transition-colors ${
                            isSelected ? "border-[var(--color-olive)]" : "border-transparent"
                          }`}
                        >
                          <button
                            onClick={() => toggleSelected(recipe.id)}
                            className="flex flex-1 items-center gap-3 text-left"
                          >
                            <div
                              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 text-xs text-white ${
                                isSelected
                                  ? "border-[var(--color-olive)] bg-[var(--color-olive)]"
                                  : "border-[var(--color-cream-dark)]"
                              }`}
                            >
                              {isSelected && "✓"}
                            </div>
                            <RecipeArt recipe={recipe} className="h-11 w-11 shrink-0 rounded-lg" />
                            <span className="text-sm font-medium text-[var(--color-ink)]">
                              {recipe.name}
                            </span>
                          </button>
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              onClick={() => setMealCount(recipe.id, count - 1)}
                              disabled={count <= 1}
                              aria-label="Azalt"
                              className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-cream)] text-sm font-bold active:scale-90 disabled:opacity-30"
                            >
                              −
                            </button>
                            <span className="w-4 text-center text-sm font-bold text-[var(--color-ink)]">
                              {count}
                            </span>
                            <button
                              onClick={() => setMealCount(recipe.id, count + 1)}
                              aria-label="Artır"
                              className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--color-cream)] text-sm font-bold active:scale-90"
                            >
                              +
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )
              ) : (
                <>
                  {shoppingList.length === 0 ? (
                    <p className="py-8 text-center text-sm text-[var(--color-ink-soft)]">
                      Liste boş.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-1.5 text-sm text-[var(--color-ink)]">
                      {shoppingList.map(({ ingredient, grams }) => (
                        <li key={ingredient.id} className="flex justify-between gap-2">
                          <span>{ingredient.name}</span>
                          <span className="text-[var(--color-ink-soft)]">
                            {formatQuantity(ingredient, grams)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>

            <div className="flex gap-2.5 border-t border-[var(--color-cream-dark)] px-5 py-4">
              {step === "select" ? (
                <button
                  onClick={() => setStep("list")}
                  disabled={selectedIds.length === 0}
                  className="w-full rounded-full bg-[var(--color-paprika)] px-5 py-3 text-sm font-bold text-white shadow-sm active:scale-95 disabled:opacity-40"
                >
                  🛒 Alışveriş Listesini Oluştur
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setStep("select")}
                    className="rounded-full bg-[var(--color-cream)] px-4 py-3 text-sm font-semibold text-[var(--color-ink)] active:scale-95"
                  >
                    ← Geri
                  </button>
                  <button
                    onClick={handleCopy}
                    className="flex-1 rounded-full bg-[var(--color-olive)] px-5 py-3 text-sm font-bold text-white shadow-sm active:scale-95"
                  >
                    {copied ? "Kopyalandı ✓" : "Listeyi Kopyala"}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
