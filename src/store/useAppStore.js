import { create } from "zustand";
import { persist } from "zustand/middleware";
import recipes from "../data/recipes.json";
import chains from "../data/chains.json";

export const recipeIds = recipes.map((r) => r.id);
const allChainIds = chains.map((c) => c.id);

// Auth (`user`) and the community feed (`communityPosts` + likes/follows)
// used to be mocked fields here. They're now real, backed by Supabase —
// see src/hooks/useAuth.js, useCommunityFeed.js, useFollows.js. They stay
// out of this persisted store deliberately: Supabase already persists its
// own session token, and duplicating server-owned data into localStorage
// would just invite the two copies to drift.
export const useAppStore = create(
  persist(
    (set) => ({
      // ids already swiped in either direction, in swipe order
      decided: [],
      // recipe_id -> { liked, matched_at }
      decisions: {},
      dietaryFilter: null, // e.g. "vegetarian" | "vegan" | null
      theme: "system", // "system" | "light" | "dark" — see useThemeSync
      setTheme: (theme) => set({ theme }),

      // set on the first-launch onboarding screen; editable later from Profile
      hasOnboarded: false,
      preferredChainIds: allChainIds,

      // recipe_id -> desired meal count, seeded from recipe.servings on cart-add
      mealCounts: {},
      setMealCount: (recipeId, count) =>
        set((state) => ({
          mealCounts: { ...state.mealCounts, [recipeId]: Math.max(1, count) },
        })),

      completeOnboarding: (chainIds) =>
        set({
          hasOnboarded: true,
          preferredChainIds: chainIds.length > 0 ? chainIds : allChainIds,
        }),

      togglePreferredChain: (chainId) =>
        set((state) => {
          const isSelected = state.preferredChainIds.includes(chainId);
          if (isSelected && state.preferredChainIds.length === 1) return state; // keep at least one
          return {
            preferredChainIds: isSelected
              ? state.preferredChainIds.filter((id) => id !== chainId)
              : [...state.preferredChainIds, chainId],
          };
        }),

      like: (recipeId) =>
        set((state) => ({
          decided: [...state.decided, recipeId],
          decisions: {
            ...state.decisions,
            [recipeId]: { liked: true, matched_at: new Date().toISOString() },
          },
          mealCounts: {
            ...state.mealCounts,
            [recipeId]: state.mealCounts[recipeId] ?? 1,
          },
        })),

      pass: (recipeId) =>
        set((state) => ({
          decided: [...state.decided, recipeId],
          decisions: {
            ...state.decisions,
            [recipeId]: { liked: false, matched_at: new Date().toISOString() },
          },
        })),

      undoLast: () =>
        set((state) => {
          if (state.decided.length === 0) return state;
          const lastId = state.decided[state.decided.length - 1];
          const { [lastId]: _removed, ...rest } = state.decisions;
          return { decided: state.decided.slice(0, -1), decisions: rest };
        }),

      resetDeck: () => set({ decided: [], decisions: {} }),

      // Empties the cart (un-likes every liked recipe) without touching
      // recipes the user already passed on.
      clearCart: () =>
        set((state) => {
          const decisions = { ...state.decisions };
          const mealCounts = { ...state.mealCounts };
          for (const [recipeId, decision] of Object.entries(state.decisions)) {
            if (decision.liked) {
              delete decisions[recipeId];
              delete mealCounts[recipeId];
            }
          }
          const decided = state.decided.filter((id) => decisions[id]);
          return { decisions, mealCounts, decided };
        }),

      setDietaryFilter: (filter) => set({ dietaryFilter: filter }),
    }),
    { name: "tarifim-store" }
  )
);

// Pure derivation, not a store selector — call it from a component via
// useMemo(() => cartRecipeIdsFrom(decisions), [decisions]). Calling it
// directly as a zustand selector would return a new array on every render
// and trigger an infinite update loop (useSyncExternalStore keeps seeing a
// "changed" snapshot).
export function cartRecipeIdsFrom(decisions) {
  return Object.entries(decisions)
    .filter(([, d]) => d.liked)
    .sort((a, b) => new Date(b[1].matched_at) - new Date(a[1].matched_at))
    .map(([id]) => id);
}
