// Rarity metadata for achievement badges — pairs with the --tier-* custom
// properties in src/index.css (which already carry the light/dark split,
// same pattern as --color-x). Centralized here so AchievementBadge and any
// other surface that needs a tier's label/gradient/glow never duplicates
// these strings.

export const TIER_ORDER = ["bronze", "silver", "gold", "platinum", "legendary"];

export const TIER_LABELS_TR = {
  bronze: "Bronz",
  silver: "Gümüş",
  gold: "Altın",
  platinum: "Platin",
  legendary: "Efsanevi",
};

const TIER_GRADIENTS = {
  bronze: "linear-gradient(135deg, var(--tier-bronze-1), var(--tier-bronze-2))",
  silver: "linear-gradient(135deg, var(--tier-silver-1), var(--tier-silver-2))",
  gold: "linear-gradient(135deg, var(--tier-gold-1), var(--tier-gold-2))",
  platinum: "linear-gradient(135deg, var(--tier-platinum-1), var(--tier-platinum-2))",
  legendary:
    "linear-gradient(135deg, var(--tier-legendary-1), var(--tier-legendary-2), var(--tier-legendary-3))",
};

const TIER_GLOW = {
  bronze: "var(--tier-bronze-glow)",
  silver: "var(--tier-silver-glow)",
  gold: "var(--tier-gold-glow)",
  platinum: "var(--tier-platinum-glow)",
  legendary: "var(--tier-legendary-glow)",
};

export function tierLabel(tier) {
  return TIER_LABELS_TR[tier] ?? tier;
}

export function tierGradient(tier) {
  return TIER_GRADIENTS[tier] ?? TIER_GRADIENTS.bronze;
}

export function tierGlow(tier) {
  return TIER_GLOW[tier] ?? TIER_GLOW.bronze;
}

// Category -> filter-chip bucket, for the "Tümü / Tarifler / Protein /
// Topluluk / Sosyal / Beslenme / Özel" gallery filters. Achievement
// categories themselves stay fine-grained (see schema.sql's seed data) —
// this is purely a UI grouping on top.
const CATEGORY_GROUPS = {
  recipes: "recipes",
  protein: "nutrition",
  vegetarian: "nutrition",
  vegan: "nutrition",
  breakfast: "nutrition",
  dessert: "nutrition",
  nutrition_combo: "nutrition",
  likes_total: "community",
  likes_single: "community",
  comments_received: "community",
  comments_written: "community",
  saves_received: "community",
  saved_count: "community",
  followers: "social",
  following: "social",
  variety: "special",
  consistency: "special",
  xp: "special",
  combo: "special",
  prestige: "special",
  hidden: "special",
};

export const FILTER_GROUPS = [
  { key: "all", label: "Tümü" },
  { key: "recipes", label: "Tarifler" },
  { key: "nutrition", label: "Beslenme" },
  { key: "community", label: "Topluluk" },
  { key: "social", label: "Sosyal" },
  { key: "special", label: "Özel" },
];

export function filterGroupFor(category) {
  return CATEGORY_GROUPS[category] ?? "special";
}
