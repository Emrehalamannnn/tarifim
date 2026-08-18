import { convertToGrams } from "./units";

// Approximate total calories for a recipe as written (i.e. for
// recipe.servings portions), from ingredients.json's calories_per_100g.
// These are general nutrition-reference values, not per-product lab data —
// see CLAUDE.md "Real vs. mock data".
export function computeRecipeCalories(recipe, ingredientsById) {
  const totalCalories = recipe.ingredients.reduce((sum, line) => {
    const ingredient = ingredientsById.get(line.ingredient_id);
    if (!ingredient?.calories_per_100g) return sum;
    const grams = convertToGrams(ingredient, line.quantity, line.unit);
    return sum + (grams / 100) * ingredient.calories_per_100g;
  }, 0);

  return {
    totalCalories,
    caloriesPerServing: totalCalories / recipe.servings,
  };
}
