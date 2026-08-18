import { create } from "zustand";
import { persist } from "zustand/middleware";
import recipes from "../data/recipes.json";
import chains from "../data/chains.json";

export const recipeIds = recipes.map((r) => r.id);
const recipesById = new Map(recipes.map((r) => [r.id, r]));
const allChainIds = chains.map((c) => c.id);

const SEED_COMMUNITY_POSTS = [
  {
    id: "post_seed_1",
    author: "elifyemekte",
    photoUrl: "/images/recipes/recipe_024.webp",
    title: "Anneannemin Baklavası",
    description: "Bayramdan kalma son dilimler 😅 Tarifi tamamen anneannemden.",
    ingredientIds: ["ing_phyllo_dough", "ing_walnuts", "ing_butter", "ing_sugar", "ing_lemon"],
    createdAt: "2026-08-10T18:30:00.000Z",
    likes: 42,
    likedByMe: false,
  },
  {
    id: "post_seed_2",
    author: "mutfaktaahmet",
    photoUrl: "/images/recipes/recipe_009.webp",
    title: "Pazar Kuzu Tandırım",
    description: "4 saat kısık ateşte, kemikten et ayrılıyor. Afiyet olsun!",
    ingredientIds: ["ing_lamb_cubes", "ing_onion", "ing_garlic", "ing_cumin", "ing_olive_oil"],
    createdAt: "2026-08-14T12:00:00.000Z",
    likes: 27,
    likedByMe: false,
  },
  {
    id: "post_seed_3",
    author: "vegan_selin",
    photoUrl: "/images/recipes/recipe_016.webp",
    title: "Hızlı Humus Tarifim",
    description: "10 dakikada hazır, ekmek arasına da harika gidiyor.",
    ingredientIds: ["ing_chickpeas", "ing_tahini", "ing_lemon", "ing_garlic", "ing_olive_oil"],
    createdAt: "2026-08-16T09:15:00.000Z",
    likes: 15,
    likedByMe: false,
  },
];

export const useAppStore = create(
  persist(
    (set) => ({
      // ids already swiped in either direction, in swipe order
      decided: [],
      // recipe_id -> { liked, matched_at }
      decisions: {},
      dietaryFilter: null, // e.g. "vegetarian" | "vegan" | null
      city: "İstanbul",

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
            [recipeId]: state.mealCounts[recipeId] ?? recipesById.get(recipeId)?.servings ?? 1,
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
      setCity: (city) => set({ city }),

      // Mocked auth — there is no backend, so Apple/Google are simulated
      // sign-ins that create a local-only profile. See CLAUDE.md.
      user: null,
      login: (provider, profile) => set({ user: { provider, ...profile } }),
      logout: () => set({ user: null }),

      // Community feed — local-only, seeded with a few sample posts so the
      // feed isn't empty on first launch. Not shared between users/devices.
      communityPosts: SEED_COMMUNITY_POSTS,
      addCommunityPost: (post) =>
        set((state) => ({ communityPosts: [post, ...state.communityPosts] })),
      toggleLikeCommunityPost: (postId) =>
        set((state) => ({
          communityPosts: state.communityPosts.map((p) =>
            p.id === postId
              ? { ...p, likedByMe: !p.likedByMe, likes: p.likes + (p.likedByMe ? -1 : 1) }
              : p
          ),
        })),
      deleteCommunityPost: (postId) =>
        set((state) => ({
          communityPosts: state.communityPosts.filter((p) => p.id !== postId),
        })),
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
