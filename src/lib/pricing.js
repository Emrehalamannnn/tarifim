import { convertToBaseQuantity } from "./units";

// Computes, per chain, the total basket cost of cooking one recipe, sorted
// cheapest-first with each chain's delta versus the cheapest ("En Uygun").
// `servingsMultiplier` scales every ingredient quantity linearly — pass
// desiredMeals / recipe.servings to price a batch bigger or smaller than the
// recipe as written (1 = recipe as written).
export function computeBasketTotals(recipe, ingredientsById, prices, chains, servingsMultiplier = 1) {
  const pricesByIngredientAndChain = new Map();
  for (const entry of prices) {
    pricesByIngredientAndChain.set(`${entry.ingredient_id}:${entry.chain}`, entry);
  }

  const totals = chains.map((chain) => {
    const lineItems = recipe.ingredients.map((line) => {
      const ingredient = ingredientsById.get(line.ingredient_id);
      const priceEntry = pricesByIngredientAndChain.get(`${line.ingredient_id}:${chain.id}`);
      const baseQuantity =
        convertToBaseQuantity(ingredient, line.quantity, line.unit) * servingsMultiplier;
      const unitPrice = priceEntry ? priceEntry.price_try / priceEntry.package_size : 0;
      const cost = baseQuantity * unitPrice;
      return {
        ingredient_id: line.ingredient_id,
        name: ingredient?.name ?? line.ingredient_id,
        quantity: line.quantity,
        unit: line.unit,
        cost,
      };
    });

    const total = lineItems.reduce((sum, item) => sum + item.cost, 0);
    return { chain, total, lineItems };
  });

  totals.sort((a, b) => a.total - b.total);
  const cheapest = totals[0]?.total ?? 0;
  return totals.map((entry) => ({ ...entry, delta: entry.total - cheapest }));
}
