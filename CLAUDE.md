# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Tarifim — a Turkish-language recipe discovery app. Swipe right on a recipe to add it to your **cart** (deliberately *not* framed as a Tinder "match" anywhere in the UI or the code — see the terminology note below); the cart unlocks a price-comparison screen that prices the recipe's ingredient list across five Turkish grocery chains (Migros, CarrefourSA, A101, BİM, Şok) and highlights the cheapest one. On first launch, and any time after from Profile, the user picks which of those chains they actually shop at — the price comparison only shows their `preferredChainIds`.

**Terminology:** the swipe/decision mechanic is internally still `decisions[recipe_id].liked` / `like()` / `pass()` (renaming that would touch a lot of code for no user-visible benefit), but everything user-facing calls it a cart: the tab is "Sepetim" (`CartPage`), the post-swipe celebration is `AddedToCartOverlay` ("Sepete Eklendi!"), and `matchedRecipeIdsFrom` was renamed to `cartRecipeIdsFrom`. Don't reintroduce "match"/"eşleşme" wording in new UI copy.

The app is entirely in Turkish — recipe `description`/`steps` are Turkish text (not translations shown alongside English), and `recipe.tags` (English values like `"vegetarian"`, kept as English since they're also used as `dietaryFilter` match keys) are display-mapped through `src/lib/tags.js`'s `tagLabel()` rather than rendered raw. `recipe.name_en` still exists on the data model but is not rendered anywhere in the UI.

This is the MVP phase: **basket prices are still local mock JSON, no backend, no auth.** The data model is deliberately shaped like it came from an API so a real pricing source can be swapped in later without touching UI code. A small pilot enrichment layer (`src/data/product_catalog.json`) links a handful of ingredients to their *real* Migros product page + real calorie data — see "Real vs. mock data" below before assuming any number in this app is live.

### Real vs. mock data — read this before scraping more

Live, per-store **prices** for these chains are not obtainable by fetching HTML: Migros/CarrefourSA/A101/Şok render price client-side (confirmed by fetching real Migros product pages — name and nutrition facts come through, price never does), price-comparison aggregators (e.g. Akakçe) block scraping (403), and **BİM has no online product catalog at all** — it's a cash-and-carry discount chain, prices only ever exist in a weekly print/PDF flyer. `prices.json` remains the algorithmic mock from `generate-prices.mjs` for all five chains.

What *is* real: `product_catalog.json` has 10 pilot ingredients (`ing_red_lentils`, `ing_rice`, `ing_olive_oil`, `ing_egg`, `ing_milk`, `ing_yogurt`, `ing_ground_beef`, `ing_chicken_breast`, `ing_tomato`, `ing_onion`) each with a real Migros product name + working product URL, and `calories_per_100g` — either read directly off that product's nutrition label (`calorie_source: "migros_product_page"`) or, for loose/fresh items with no label (meat cuts, produce), a standard nutrition-reference value (`calorie_source: "general_reference"`). `RecipeDetailPage` shows a "`kcal/100g ↗`" link next to any ingredient that has a catalog entry, linking to the real Migros product. Extending this to the other 77 ingredients means repeating the WebSearch→WebFetch pattern used to build the pilot — expect a similar hit rate (packaged goods have parseable nutrition tables, loose/fresh items generally don't).

Getting *real prices* would require driving an actual browser (Claude in Chrome or similar) through each chain's site rather than fetching static HTML, and would still return nothing for BİM.

Separately, **every** ingredient (all 57, not just the pilot 10) has a `calories_per_100g` field directly on `ingredients.json` — these are standard nutrition-reference values (not scraped), used by `computeRecipeCalories` to give every recipe a total-calorie estimate regardless of pilot coverage. They're deliberately not forced to match `product_catalog.json`'s pilot numbers where the two represent different real products (e.g. `ing_yogurt` is 61 kcal/100g, generic plain yogurt — the pilot's Migros link is for süzme/strained yogurt at 105 kcal/100g, a genuinely different product some recipes don't use).

**Recipe photos are real**, generated via the Higgsfield MCP tools (`recraft_v4_1` model, `model_type: "standard"`, one prompt per recipe) and stored as compressed WebP at `public/images/recipes/recipe_0NN.webp` (resized + re-encoded with `sharp` after download — originals were ~1.8MB PNGs, now ~40-90KB each). `recipes.json`'s `image_url` points at these; `RecipeArt` renders the `<img>` when `image_url` is set, falling back to the gradient+emoji placeholder otherwise (still the path for any future recipe added without art).

## Commands

```bash
npm run dev              # start Vite dev server
npm run build             # production build to dist/
npm run preview           # preview the production build
npm run lint               # oxlint over the project
npm run generate:prices   # regenerate src/data/prices.json from scripts/generate-prices.mjs
```

There is no test suite in this MVP.

## Architecture

**Stack:** React 19 + Vite + Tailwind CSS v4 (via `@tailwindcss/vite`, no `tailwind.config.js` — theme tokens live in `src/index.css` under `@theme`) + `react-router-dom` (HashRouter) + Zustand (persisted to `localStorage`) + Framer Motion (swipe gesture).

**Routing** (`src/App.jsx`): `/onboarding` plus routes gated behind it — `/` (swipe deck), `/cart`, `/recipe/:id`, `/social`, `/profile` — wrapped in a `RequireOnboarding` guard that redirects to `/onboarding` until `hasOnboarded` is true, with a persistent 4-tab `BottomNav` (Keşfet / Sepetim / Topluluk / Profil, hidden pre-onboarding via `BottomNavGate`). `HashRouter` is used deliberately since this ships as a static frontend with no server-side routing.

### Data layer (`src/data/`)

Static JSON files, cross-referenced by id:

- `ingredients.json` — master ingredient list (87 entries; 30 were added ahead of new recipes and aren't yet referenced by any recipe). Each has a `base_unit` (`kg`, `l`, or `piece`) and, for countable produce/eggs, an `avg_piece_weight_g` used for unit conversion.
- `recipes.json` — 25 recipes. Each `ingredients[]` line references an `ingredient_id` with its own `quantity`/`unit` as used in that recipe (e.g. `"1 cup"`, `"2 clove"`) — these units do **not** have to match the ingredient's `base_unit`.
- `chains.json` — the 5 chains with a display color/text pair, used for badges and price bars (no real logos, per product requirement). This is the single source of truth for which chains exist — `useAppStore`'s default `preferredChainIds`, the onboarding screen, and the Profile chain picker all derive from it, so adding/removing a chain here is enough (no other file hardcodes the chain list).
- `prices.json` — every ingredient × every chain (435 rows), generated (not hand-written) by `scripts/generate-prices.mjs`.
- `product_catalog.json` — pilot real-data layer, see "Real vs. mock data" above.

**Price generation:** `scripts/generate-prices.mjs` holds a hand-picked `BASE_PRICE_TRY` per ingredient and a `CHAIN_MULTIPLIER` per chain (BİM/Şok < 1, Migros/CarrefourSA > 1, matching the product's requested market positioning), then applies a seeded-PRNG noise term (mulberry32, keyed by `ingredient_id:chain_id` so output is reproducible) and writes `prices.json`. Re-run `npm run generate:prices` after adding/editing ingredients — it will throw if `BASE_PRICE_TRY` is missing an entry for any ingredient.

### Pricing & nutrition logic (`src/lib/`)

- `units.js` — `convertToBaseQuantity(ingredient, quantity, unit)` converts a recipe line's quantity/unit into the ingredient's `base_unit` quantity (kg/l/piece), via rough `UNIT_TO_GRAMS`/`UNIT_TO_ML` lookup tables and `avg_piece_weight_g` for piece↔weight conversion. `convertToGrams(ingredient, quantity, unit)` does the same but always returns grams regardless of `base_unit` — used wherever a real weight is needed (calorie math) rather than a basket-pricing unit. Both are intentionally approximate (mock-data MVP, not nutrition-grade).
- `pricing.js` — `computeBasketTotals(recipe, ingredientsById, prices, chains, servingsMultiplier = 1)` sums per-chain basket cost across a recipe's ingredients and returns chains sorted cheapest-first, each with a `delta` vs. the cheapest and per-ingredient `lineItems`. `servingsMultiplier` scales every line's quantity linearly — it's how the "how many meals do you want" stepper (see below) reprices the basket for a batch bigger or smaller than the recipe as written.
- `nutrition.js` — `computeRecipeCalories(recipe, ingredientsById)` sums `calories_per_100g × grams` across a recipe's ingredients (via `convertToGrams`) and returns `{ totalCalories, caloriesPerServing }` for the recipe as written (i.e. for `recipe.servings` portions).
- `shoppingList.js` — `buildShoppingList(selectedEntries, ingredientsById)` (where `selectedEntries` is `[{ recipe, mealCount }]`) merges ingredient quantities across multiple recipes — each scaled by its own `mealCount / recipe.servings` — into one grouped, grams-based list. `formatQuantity(ingredient, grams)` converts back to a readable unit per the ingredient's `base_unit` (kg/g, l/ml, or "N adet" for piece-based ingredients). `shoppingListToText(list)` renders it as copy-pasteable plain text. This is what powers `ShoppingListModal`'s combined list.

### State (`src/store/useAppStore.js`)

Single Zustand store, persisted under the `tarifim-store` localStorage key (this **is** the app's only persistence layer — there is no backend, so nothing here is shared across devices or users). Tracks swipe decisions as `decisions: { [recipe_id]: { liked, matched_at } }` plus a `decided` array (swipe order, enables `undoLast`). `cartRecipeIdsFrom(decisions)` derives the cart list, sorted most-recently-added-first — it's a **pure function**, not a store selector; call it via `useMemo(() => cartRecipeIdsFrom(decisions), [decisions])` in a component. `clearCart()` un-likes every liked recipe (and drops their `mealCounts`) without touching recipes the user already passed on — that's the "Sepeti Boşalt" action, confirmed via `ConfirmDialog` before it runs.

Also tracks: `hasOnboarded` (flips true once, from `OnboardingPage`); `preferredChainIds` (defaults to all chains from `chains.json`; `togglePreferredChain` refuses to drop the last one); `mealCounts: { [recipe_id]: number }` (how many meals/servings the user wants of a cart recipe — seeded to `recipe.servings` by `like()`, adjustable via `setMealCount`, shared by `AddedToCartOverlay`, `RecipeDetailPage`, `CartPage`, and `ShoppingListModal` so it's one number no matter where you change it); `user` + `login(provider, profile)` + `logout()` (mocked auth, see below); `communityPosts` + `addCommunityPost`/`toggleLikeCommunityPost`/`deleteCommunityPost` (the social feed, see below).

**Zustand footgun to avoid:** never write a selector that builds a new array/object inline, e.g. `useAppStore((s) => s.someArray.filter(...))` or `useAppStore(someFnThatReturnsANewArray)`. React's `useSyncExternalStore` (which Zustand uses internally) re-invokes selectors on every render to check for changes; a selector that's never referentially stable makes it think the store changed on every single render, which hits "Maximum update depth exceeded" almost immediately. This already broke the app once (see git history). The pattern here: subscribe to the raw, stable state slice (`s.decisions`, `s.mealCounts`, etc. — these only get new references when `set()` actually changes them) and derive anything array/object-shaped with `useMemo` in the component.

### UI flow

- `OnboardingPage` (`src/pages/`) — first-launch-only chain picker (multi-select chips over `chains.json`), calls `completeOnboarding(chainIds)` and routes to `/`. `ProfilePage` has the same picker (`togglePreferredChain`) for changing it later.
- `SwipeDeck`/`SwipeCard` (`src/components/`) render a draggable card stack via Framer Motion. Swipe right → `like()` + shows `AddedToCartOverlay`, left → `pass()`, up → navigate to `/recipe/:id` without deciding. `SwipeCard` uses two separate motion values for its `y` axis — `dragY` (inner layer, bound to the drag gesture) and the outer wrapper's `animate={{ y: stackIndex * 12 }}` (stack offset) — don't collapse these back into one `y` value, Framer Motion can't cleanly animate the same motion value from both a gesture and an `animate` prop at once.
- `AddedToCartOverlay` (`src/components/`) — the celebration shown right after a right-swipe: a seeded confetti burst (deterministic per `recipe.id`, so it doesn't re-randomize on re-render), calories per serving, the meal-count stepper (`mealCounts[recipe.id]`, via `setMealCount`), and a live cheapest-chain price preview that reprices as the count changes. The primary button ("✓ Sepete Eklendi, Devam Et") is the confirm-and-continue action; "Fiyatları Karşılaştır" routes to `/recipe/:id` instead.
- `RecipeDetailPage` (`src/pages/`) is shared by two flows: reached via swipe-up (preview, not yet in cart) and via `CartPage` or `AddedToCartOverlay` (already in cart). It checks `decisions[id]?.liked` (as `isInCart`) — if not, it shows a locked teaser with inline like/pass buttons instead of the price table; once in cart, it shows the same meal-count stepper as the overlay (kept in sync via the shared `mealCounts` store field), then the `computeBasketTotals` breakdown filtered to `preferredChainIds` and scaled by the chosen meal count. **The cheapest chain is shown once** — as the "En Uygun Market" summary card — and excluded from the ranked list below it (`totals.slice(1)`, under an "Diğer Marketler" heading) to avoid the duplicate-listing bug that existed earlier. Ingredient lines link to real calorie data for any ingredient present in `product_catalog.json`.
- `CartPage` (`src/pages/`) lists cart recipes (`CartRow`: photo, per-serving-count calories, meal-count stepper, an expand/collapse toggle revealing the recipe's ingredient list, and a per-row remove button). Header has a "Sepeti Boşalt" button gated behind `ConfirmDialog`. A `sticky bottom-3` button (this works because `CartPage`'s `PageFade` root sits inside `App.jsx`'s `overflow-y-auto` scroll container, whose box height already stops exactly above `BottomNav` — sticky positioning resolves against that scrolling ancestor, so `bottom-3` lands the button just above the nav bar with no manual offset math needed) opens `ShoppingListModal`.
- `ShoppingListModal` (`src/components/`) — two-step popup: step 1 lets you check/uncheck which cart recipes to include and adjust each one's meal count (shared `mealCounts` again); step 2 (reached via the "🛒 Alışveriş Listesini Oluştur" confirm button) shows the combined list from `buildShoppingList` with a "Listeyi Kopyala" button (`navigator.clipboard.writeText`, brief "Kopyalandı ✓" feedback).
- `ProfilePage` (`src/pages/`) — `LoginPanel` (Apple/Google/Email buttons) when logged out, a profile card (initials avatar, name/email, provider, mocked follower/following counts via `mockSocialStats`, logout) when logged in, then the existing preference sections (chains, dietary filter, city, deck reset).
- `SocialPage` (`src/pages/`) — a feed of `communityPosts` (seeded with 3 sample posts on first load). Logged-in users get a "+ Tarif Paylaş" button opening `CreatePostModal` (photo upload → resized/re-encoded to a JPEG data URL client-side via canvas, title, description, and a **required** multi-select of every ingredient used, grouped by category) — logged-out users see a "Paylaşmak için giriş yap" link to `/profile` instead. Posts show a heart-toggle like count; only posts the current session created (`ownedByMe: true`) get a delete button.
- `RecipeArt` renders the recipe's real photo (`recipe.image_url`, all 25 recipes have one) or, if absent, a deterministic gradient + emoji block hashed from `recipe.id`. Also used at small sizes for cart rows and shopping-list checkboxes.
- `PageFade` (`src/components/`) — every page's root is wrapped in this (`initial={opacity:0,y:10} → animate={opacity:1,y:0}`), so navigating between screens has a quick, consistent entrance instead of a hard cut.
- `ConfirmDialog` (`src/components/`) — generic "are you sure" bottom-sheet/modal (title, description, confirm/cancel). Used by `CartPage`'s "Sepeti Boşalt"; reach for it before adding another one-off confirm UI.

### Mocked auth & social features — read before treating any of this as real

There is no backend. **Login is simulated**: "Apple ile Giriş Yap" and "Google ile Giriş Yap" instantly create a local mock profile (fixed placeholder name/email) with no real OAuth handshake — there's nowhere to redirect to and no client ID/secret configured, because there is no server to exchange a token with. "E-posta ile Giriş Yap" is a real local form (name + email) but has no password, because nothing verifies one. All of it lives only in `useAppStore`'s persisted `user` field on this device; a `LoginPanel` caption says as much in-app ("Bu bir demo girişidir").

**Followers/following are fake**: `mockSocialStats(seed)` derives a stable-looking but entirely made-up follower/following count from a hash of the user's name+email. There is no social graph.

**The community feed is local-only**: `communityPosts` (including the 3 seed posts) lives in the same persisted store — nothing posted here is visible to anyone else, on any other device or browser. Photos are stored as base64 JPEG data URLs (resized to a max 800px dimension, ~0.78 quality) directly inside `communityPosts`, which means they count against localStorage's per-origin quota (typically 5–10MB) — fine for a handful of demo posts, not a real media pipeline.

If any of this needs to become real, it needs an actual backend (auth provider config + token exchange + a database/API for posts and follows) — none of which exists yet.

## Conventions

- Everything user-facing is Turkish — recipe `name`/`description`/`steps`, all UI chrome. `recipe.name_en` exists on the data model but is intentionally not rendered. `recipe.tags` stay as English keys internally (they double as `dietaryFilter` values compared with `Array.includes`) but are always displayed through `tagLabel()` from `src/lib/tags.js` — extend `TAG_LABELS_TR` there, don't render `tag` raw.
- All money is formatted via `Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" })` (see `RecipeDetailPage.jsx`) — reuse that formatter rather than hand-rolling currency strings.
- Tailwind v4: custom design tokens (`--color-paprika`, `--color-olive`, etc.) are defined once in `src/index.css`'s `@theme` block and referenced either as Tailwind utilities (`text-[var(--color-paprika)]`) or inline `style` (needed for the per-chain dynamic colors in `ChainBadge`/price bars, since those come from data, not static classes).
