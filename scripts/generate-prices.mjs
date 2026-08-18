// Deterministically generates src/data/prices.json (mock data) from a base
// price per ingredient plus a per-chain market-position multiplier and a
// seeded noise term. Re-run with `npm run generate:prices` after editing
// ingredients.json or the BASE_PRICE_TRY map below.
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ingredients = JSON.parse(
  readFileSync(path.join(__dirname, "../src/data/ingredients.json"), "utf-8")
);
const chains = JSON.parse(
  readFileSync(path.join(__dirname, "../src/data/chains.json"), "utf-8")
);

// Mock base price per ingredient, in TRY per base_unit (kg / l / piece).
const BASE_PRICE_TRY = {
  ing_red_lentils: 55,
  ing_green_lentils: 60,
  ing_chickpeas: 50,
  ing_white_beans: 65,
  ing_bulgur: 35,
  ing_rice: 45,
  ing_flour: 25,
  ing_pasta: 30,
  ing_semolina: 30,
  ing_phyllo_dough: 70,
  ing_onion: 20,
  ing_carrot: 18,
  ing_potato: 20,
  ing_tomato: 28,
  ing_green_pepper: 30,
  ing_bell_pepper_red: 40,
  ing_garlic: 120,
  ing_eggplant: 32,
  ing_zucchini: 25,
  ing_spinach: 35,
  ing_cucumber: 22,
  ing_lettuce: 30,
  ing_parsley: 40,
  ing_mint: 60,
  ing_dill: 50,
  ing_lemon: 35,
  ing_apple: 30,
  ing_banana: 45,
  ing_walnuts: 320,
  ing_pine_nuts: 900,
  ing_butter: 260,
  ing_olive_oil: 220,
  ing_sunflower_oil: 90,
  ing_salt: 10,
  ing_black_pepper: 400,
  ing_red_pepper_flakes: 180,
  ing_cumin: 250,
  ing_cinnamon: 300,
  ing_paprika: 200,
  ing_sugar: 28,
  ing_vanilla: 8,
  ing_baking_powder: 90,
  ing_yeast: 150,
  ing_honey: 350,
  ing_pekmez: 150,
  ing_tahini: 220,
  ing_tomato_paste: 90,
  ing_egg: 3.5,
  ing_milk: 32,
  ing_yogurt: 60,
  ing_white_cheese: 280,
  ing_kasar_cheese: 380,
  ing_ground_beef: 480,
  ing_chicken_breast: 180,
  ing_chicken_thigh: 150,
  ing_lamb_cubes: 650,
  ing_sucuk: 380,
  ing_tarhana: 90,
  ing_broccoli: 45,
  ing_pumpkin: 25,
  ing_mushroom: 90,
  ing_vermicelli: 35,
  ing_purslane: 45,
  ing_arugula: 60,
  ing_fish_fillet: 450,
  ing_shrimp: 700,
  ing_okra: 120,
  ing_grape_leaves: 180,
  ing_beef_cubes: 550,
  ing_bread: 25,
  ing_burger_bun: 8,
  ing_cabbage: 15,
  ing_mozzarella: 320,
  ing_ketchup: 70,
  ing_mayonnaise: 90,
  ing_pepper_paste: 85,
  ing_oats: 45,
  ing_coffee: 900,
  ing_salep: 2500,
  ing_turnip_juice: 25,
  ing_cocoa_powder: 250,
  ing_dark_chocolate: 450,
  ing_cream: 110,
  ing_cream_cheese: 250,
  ing_digestive_biscuit: 110,
  ing_orange: 25,
  ing_strawberry: 90,
};

// Market positioning: BİM/Şok trend cheaper, Migros/CarrefourSA trend pricier.
const CHAIN_MULTIPLIER = {
  migros: 1.1,
  carrefoursa: 1.07,
  a101: 0.99,
  bim: 0.88,
  sok: 0.91,
};

// Seeded PRNG (mulberry32) so the mock catalog is reproducible across runs.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h;
}

const prices = [];
for (const ingredient of ingredients) {
  const base = BASE_PRICE_TRY[ingredient.id];
  if (base === undefined) {
    throw new Error(`Missing base price for ${ingredient.id}`);
  }
  for (const chain of chains) {
    const rng = mulberry32(hashString(`${ingredient.id}:${chain.id}`));
    const noise = 0.95 + rng() * 0.1; // +/-5% ingredient-level noise
    const price = base * CHAIN_MULTIPLIER[chain.id] * noise;
    prices.push({
      ingredient_id: ingredient.id,
      chain: chain.id,
      price_try: Math.round(price * 100) / 100,
      unit: ingredient.base_unit,
      package_size: 1,
    });
  }
}

writeFileSync(
  path.join(__dirname, "../src/data/prices.json"),
  JSON.stringify(prices, null, 2) + "\n"
);

console.log(`Generated ${prices.length} price entries.`);
