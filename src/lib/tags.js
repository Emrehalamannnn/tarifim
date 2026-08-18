// recipe.tags values stay in English internally (they're also the
// dietaryFilter values compared with Array.includes) — this only maps them
// to Turkish for display.
const TAG_LABELS_TR = {
  vegetarian: "Vejetaryen",
  vegan: "Vegan",
  soup: "Çorba",
  "budget-friendly": "Ekonomik",
  main: "Ana Yemek",
  salad: "Salata",
  meze: "Meze",
  breakfast: "Kahvaltı",
  dessert: "Tatlı",
  "high-protein": "Yüksek Proteinli",
};

export function tagLabel(tag) {
  return TAG_LABELS_TR[tag] ?? tag;
}

export const ALL_TAGS = Object.keys(TAG_LABELS_TR);
