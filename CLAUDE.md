# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow

After applying any change to a tracked file — code, `supabase/schema.sql`, docs, this file itself —
commit it and `git push origin main` before ending the turn, without waiting to be asked. Don't batch
unrelated changes into one commit; each logical fix/feature gets its own commit+push. Skip this only
for changes the user explicitly says are exploratory/throwaway, or files that shouldn't be committed
(secrets, `.env`, build output).

## What this is

Tarifim — a Turkish-language recipe discovery app. Swipe right on a recipe to add it to your **cart** (deliberately *not* framed as a Tinder "match" anywhere in the UI or the code — see the terminology note below); the cart unlocks a price-comparison screen that prices the recipe's ingredient list across five Turkish grocery chains (Migros, CarrefourSA, A101, BİM, Şok) and highlights the cheapest one. On first launch, and any time after from Profile, the user picks which of those chains they actually shop at — the price comparison only shows their `preferredChainIds`.

**Terminology:** the swipe/decision mechanic is internally still `decisions[recipe_id].liked` / `like()` / `pass()` (renaming that would touch a lot of code for no user-visible benefit), but everything user-facing calls it a cart: the tab is "Sepetim" (`CartPage`), the post-swipe celebration is `AddedToCartOverlay` ("Sepete Eklendi!"), and `matchedRecipeIdsFrom` was renamed to `cartRecipeIdsFrom`. Don't reintroduce "match"/"eşleşme" wording in new UI copy.

The app is entirely in Turkish — recipe `description`/`steps` are Turkish text (not translations shown alongside English), and `recipe.tags` (English values like `"vegetarian"`, kept as English since they're also used as `dietaryFilter` match keys) are display-mapped through `src/lib/tags.js`'s `tagLabel()` rather than rendered raw. `recipe.name_en` still exists on the data model but is not rendered anywhere in the UI.

This is the MVP phase for pricing: **basket prices are still local mock JSON**, deliberately shaped like it came from an API so a real pricing source can be swapped in later without touching UI code. A small pilot enrichment layer (`src/data/product_catalog.json`) links a handful of ingredients to their *real* Migros product page + real calorie data. Accounts and the community feed, by contrast, **are** real.

**Read before touching pricing, nutrition, scraping, or product-catalog code:** `docs/DATA.md` — exactly what's real vs. mock (prices are 100% mock/algorithmic and cannot be scraped live; a 10-ingredient pilot has real Migros calorie data; recipe photos are real AI-generated images).

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

- `ingredients.json` — master ingredient list (87 entries). Each has a `base_unit` (`kg`, `l`, or `piece`) and, for countable produce/eggs, an `avg_piece_weight_g` used for unit conversion.
- `recipes.json` — 101 recipes. Each `ingredients[]` line references an `ingredient_id` with its own `quantity`/`unit` as used in that recipe (e.g. `"1 cup"`, `"2 clove"`) — these units do **not** have to match the ingredient's `base_unit`.
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

Also tracks: `hasOnboarded` (flips true once, from `OnboardingPage`); `preferredChainIds` (defaults to all chains from `chains.json`; `togglePreferredChain` refuses to drop the last one); `mealCounts: { [recipe_id]: number }` (how many meals/servings the user wants of a cart recipe — seeded to `recipe.servings` by `like()`, adjustable via `setMealCount`, shared by `AddedToCartOverlay`, `RecipeDetailPage`, `CartPage`, and `ShoppingListModal` so it's one number no matter where you change it). Auth and the community feed used to live here too (`user`/`login`/`logout`/`communityPosts`) but are now real, Supabase-backed, and deliberately kept out of this persisted store — see `src/hooks/useAuth.js`/`useCommunityFeed.js`/`useFollows.js` and "Real accounts & social backend" below.

**Zustand footgun to avoid:** never write a selector that builds a new array/object inline, e.g. `useAppStore((s) => s.someArray.filter(...))` or `useAppStore(someFnThatReturnsANewArray)`. React's `useSyncExternalStore` (which Zustand uses internally) re-invokes selectors on every render to check for changes; a selector that's never referentially stable makes it think the store changed on every single render, which hits "Maximum update depth exceeded" almost immediately. This already broke the app once (see git history). The pattern here: subscribe to the raw, stable state slice (`s.decisions`, `s.mealCounts`, etc. — these only get new references when `set()` actually changes them) and derive anything array/object-shaped with `useMemo` in the component.

### UI flow

Per-component behavior notes (swipe deck, cart, profile, social feed, comments, coach page, etc.) live in **`docs/UI_FLOW.md`** — read the entry for whatever screen/component you're touching. Two things worth knowing before you open it: `SwipeCard`'s drag/stack animation uses two separate motion values that must not be collapsed into one (Framer Motion footgun, already caused a bug once), and `RecipeDetailPage`'s cheapest-chain card is deliberately excluded from the ranked list below it to avoid double-listing.

### Real accounts & social backend (Supabase)

Auth and the community feed are backed by a real [Supabase](https://supabase.com) project (Postgres + Auth + Storage) — genuinely different from the rest of the app, which is local-only MVP mock data. Full setup steps, schema, RLS policies, official/seeded posts, and admin/moderation flags: **`docs/SUPABASE.md`** — read it before touching auth, posts, follows, comments, or admin/moderation code. One rule worth knowing up front: `supabase/schema.sql` is meant to be re-run safely (idempotent `create if not exists`/`alter table`), so prefer editing it in place and re-running over hand-editing tables in the dashboard.

### Premium & AI health coach

A `subscriptions` table gates premium access and **has no client-facing insert/update RLS policy at all** — deliberate, so a user can never grant themselves premium via the API; never add a write policy here without a trusted server context behind it. Full flow (CoachPage, the `ai-coach` Edge Function, StoreKit/RevenueCat plan): **`docs/PREMIUM.md`**.

## Working efficiently in this repo

`supabase/schema.sql` and the larger page components (`ProfilePage.jsx`, `SocialPage.jsx`, `CreatePostModal.jsx`) are big files that tend to get re-read several times over the course of one session. Once one of them is in context, don't re-`Read` it again unless it's actually changed since — grep/search for the specific table or function you need instead of a full re-read, and trust an `Edit` you just made rather than re-reading the file to confirm it landed.

## Conventions

- Everything user-facing is Turkish — recipe `name`/`description`/`steps`, all UI chrome. `recipe.name_en` exists on the data model but is intentionally not rendered. `recipe.tags` stay as English keys internally (they double as `dietaryFilter` values compared with `Array.includes`) but are always displayed through `tagLabel()` from `src/lib/tags.js` — extend `TAG_LABELS_TR` there, don't render `tag` raw.
- All money is formatted via `Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" })` (see `RecipeDetailPage.jsx`) — reuse that formatter rather than hand-rolling currency strings.
- Tailwind v4: custom design tokens (`--color-paprika`, `--color-olive`, etc.) are defined once in `src/index.css`'s `@theme` block and referenced either as Tailwind utilities (`text-[var(--color-paprika)]`) or inline `style` (needed for the per-chain dynamic colors in `ChainBadge`/price bars, since those come from data, not static classes).
