// Approximate unit conversion for MVP mock data. Precision doesn't matter —
// it just needs to put every recipe quantity on the same footing as the
// ingredient's base_unit (kg / l / piece) so basket totals are comparable.
const UNIT_TO_GRAMS = {
  g: 1,
  kg: 1000,
  cup: 200,
  tbsp: 15,
  tsp: 5,
  bunch: 50,
  clove: 5,
  pinch: 0.5,
  slice: 30,
};

const UNIT_TO_ML = {
  ml: 1,
  l: 1000,
  cup: 240,
  tbsp: 15,
  tsp: 5,
};

const DEFAULT_PIECE_WEIGHT_G = 100;

function toGrams(quantity, unit) {
  if (unit in UNIT_TO_GRAMS) return quantity * UNIT_TO_GRAMS[unit];
  if (unit in UNIT_TO_ML) return quantity * UNIT_TO_ML[unit]; // 1ml ~= 1g fallback
  return quantity;
}

function toMl(quantity, unit) {
  if (unit in UNIT_TO_ML) return quantity * UNIT_TO_ML[unit];
  if (unit in UNIT_TO_GRAMS) return quantity * UNIT_TO_GRAMS[unit]; // 1g ~= 1ml fallback
  return quantity;
}

// Converts a recipe ingredient quantity (given in `unit`) into the
// ingredient's base_unit quantity (kg, l, or piece count).
export function convertToBaseQuantity(ingredient, quantity, unit) {
  const { base_unit, avg_piece_weight_g } = ingredient;
  const pieceWeight = avg_piece_weight_g || DEFAULT_PIECE_WEIGHT_G;

  if (unit === "piece") {
    if (base_unit === "piece") return quantity;
    const grams = quantity * pieceWeight;
    return grams / 1000; // works for both kg and l (1g ~= 1ml)
  }

  if (base_unit === "piece") {
    const grams = toGrams(quantity, unit);
    return grams / pieceWeight;
  }

  if (base_unit === "kg") return toGrams(quantity, unit) / 1000;
  if (base_unit === "l") return toMl(quantity, unit) / 1000;

  return quantity;
}

// Converts a recipe ingredient quantity into grams, regardless of the
// ingredient's own base_unit — used for calorie math, which always wants a
// weight. "piece" ingredients use avg_piece_weight_g; liquids are treated as
// 1ml ≈ 1g, which is close enough for oils/milk/water at MVP precision.
export function convertToGrams(ingredient, quantity, unit) {
  const pieceWeight = ingredient.avg_piece_weight_g || DEFAULT_PIECE_WEIGHT_G;
  return unit === "piece" ? quantity * pieceWeight : toGrams(quantity, unit);
}
