import { convertToGrams } from "./units";

const DEFAULT_PIECE_WEIGHT_G = 100;

// Combines ingredient quantities across multiple recipes (each scaled by its
// own desired meal count) into one grouped list, in grams regardless of the
// ingredient's base_unit — formatQuantity converts back to a readable unit.
export function buildShoppingList(selectedEntries, ingredientsById) {
  const gramsByIngredientId = new Map();

  for (const { recipe, mealCount } of selectedEntries) {
    const multiplier = mealCount / recipe.servings;
    for (const line of recipe.ingredients) {
      const ingredient = ingredientsById.get(line.ingredient_id);
      if (!ingredient) continue;
      const grams = convertToGrams(ingredient, line.quantity, line.unit) * multiplier;
      gramsByIngredientId.set(
        line.ingredient_id,
        (gramsByIngredientId.get(line.ingredient_id) ?? 0) + grams
      );
    }
  }

  return Array.from(gramsByIngredientId.entries())
    .map(([ingredientId, grams]) => ({
      ingredient: ingredientsById.get(ingredientId),
      grams,
    }))
    .filter((entry) => entry.ingredient)
    .sort((a, b) => a.ingredient.name.localeCompare(b.ingredient.name, "tr"));
}

export function formatQuantity(ingredient, grams) {
  if (ingredient.base_unit === "piece") {
    const pieceWeight = ingredient.avg_piece_weight_g || DEFAULT_PIECE_WEIGHT_G;
    const count = Math.max(1, Math.round(grams / pieceWeight));
    return `${count} adet`;
  }
  if (ingredient.base_unit === "l") {
    return grams >= 1000 ? `${(grams / 1000).toFixed(2)} l` : `${Math.round(grams)} ml`;
  }
  return grams >= 1000 ? `${(grams / 1000).toFixed(2)} kg` : `${Math.round(grams)} g`;
}

export function shoppingListToText(list) {
  const lines = list.map(
    ({ ingredient, grams }) => `- ${ingredient.name}: ${formatQuantity(ingredient, grams)}`
  );
  return ["Alışveriş Listem 🛒", ...lines].join("\n");
}
