import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

const SEEN_KEY_PREFIX = "tarifim-seen-achievements:";

function readSeenIds(userId) {
  try {
    const raw = localStorage.getItem(SEEN_KEY_PREFIX + userId);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function writeSeenIds(userId, ids) {
  try {
    localStorage.setItem(SEEN_KEY_PREFIX + userId, JSON.stringify([...ids]));
  } catch {
    // localStorage unavailable/full — worst case an unlock toast repeats
    // once, not fatal.
  }
}

// Own-profile gamification: xp/level/progress, selected title, every
// unlocked + locked (with private progress) achievement, and a
// newly-unlocked queue for the unlock-toast UI. All data comes from the
// get_my_gamification() RPC (supabase/schema.sql) — never a raw table
// read — so xp/progress/locked-achievement details never leak client-side
// logic that could drift from what the server actually enforces.
//
// "Newly unlocked" is whatever's in unlockedAchievements that this browser
// hasn't shown a toast for yet, tracked per-user in localStorage so a page
// refresh never re-shows an already-acknowledged unlock (spec: "Do not
// repeatedly show the same unlock after refresh").
export function useGamification(userId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newlyUnlocked, setNewlyUnlocked] = useState([]);
  // Tracks "has at least one successful load completed", per userId — a ref
  // rather than deriving it from `data` because `refresh` (below) must read
  // its current value without depending on `data` itself (that would
  // recreate `refresh` — and re-subscribe the realtime effect that uses it
  // — on every single fetch).
  const hasLoadedRef = useRef(false);

  const applyResult = useCallback(
    (result) => {
      setData(result);
      if (!result || !userId) return;
      const seen = readSeenIds(userId);
      const fresh = (result.unlockedAchievements ?? []).filter((a) => !seen.has(a.id));
      if (fresh.length > 0) {
        setNewlyUnlocked((prev) => [...prev, ...fresh]);
        const nextSeen = new Set(seen);
        for (const a of fresh) nextSeen.add(a.id);
        writeSeenIds(userId, nextSeen);
      }
    },
    [userId]
  );

  const refresh = useCallback(
    async ({ silent } = {}) => {
      if (!isSupabaseConfigured || !userId) {
        setData(null);
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      const { data: result, error } = await supabase.rpc("get_my_gamification");
      if (error) {
        console.error("Failed to load gamification", error);
        setData(null);
      } else if (!hasLoadedRef.current) {
        // First-ever load: mark everything already unlocked as "seen"
        // without queuing toasts for it — only unlocks discovered from here
        // on (this call and any later one) should ever animate in.
        hasLoadedRef.current = true;
        const seen = readSeenIds(userId);
        for (const a of result.unlockedAchievements ?? []) seen.add(a.id);
        writeSeenIds(userId, seen);
        setData(result);
      } else {
        applyResult(result);
      }
      setLoading(false);
    },
    [userId, applyResult]
  );

  useEffect(() => {
    hasLoadedRef.current = false;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Realtime: the instant a trigger inserts a new row into user_achievements
  // for this user, refetch and diff — no polling anywhere.
  useEffect(() => {
    if (!isSupabaseConfigured || !userId) return;

    const channel = supabase
      .channel(`user_achievements_${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "user_achievements", filter: `user_id=eq.${userId}` },
        () => refresh({ silent: true })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function selectTitle(achievementId) {
    const prev = data;
    setData((d) => (d ? { ...d, selectedTitleId: achievementId } : d));
    const { error } = await supabase.rpc("select_profile_title", { p_achievement_id: achievementId });
    if (error) {
      console.error("Failed to select title", error);
      setData(prev);
      throw error;
    }
  }

  function acknowledgeUnlock(achievementId) {
    setNewlyUnlocked((prev) => prev.filter((a) => a.id !== achievementId));
  }

  const progressPercent = useMemo(() => {
    if (!data) return 0;
    const span = data.nextLevelXp - data.levelStartXp;
    if (span <= 0) return 100;
    return Math.max(0, Math.min(100, ((data.xp - data.levelStartXp) / span) * 100));
  }, [data]);

  const selectedTitle = useMemo(() => {
    if (!data?.selectedTitleId) return null;
    return data.unlockedAchievements.find((a) => a.id === data.selectedTitleId) ?? null;
  }, [data]);

  return {
    loading,
    xp: data?.xp ?? 0,
    level: data?.level ?? 1,
    rankName: data?.rankName ?? null,
    levelStartXp: data?.levelStartXp ?? 0,
    nextLevelXp: data?.nextLevelXp ?? 0,
    progressPercent,
    selectedTitle,
    unlockedAchievements: data?.unlockedAchievements ?? [],
    lockedAchievements: data?.lockedAchievements ?? [],
    achievementCount: data?.achievementCount ?? 0,
    totalAchievementCount: data?.totalAchievementCount ?? 0,
    newlyUnlocked,
    acknowledgeUnlock,
    selectTitle,
    refresh,
  };
}

// Batched, lightweight lookup of level + selected title across many authors
// at once — backs the subtle title line under a username on PostCard/feed
// surfaces. Deliberately not RPC-based like the hooks above: it's a single
// direct-table read across a whole visible post list, which is safe because
// user_gamification's column grant (schema.sql) already restricts
// anon/authenticated to (user_id, level, selected_title_achievement_id,
// updated_at) — xp is never selectable this way — and
// achievement_definitions' own RLS policy already allows reading any
// non-hidden definition, or a hidden one only once it's been unlocked by
// someone (exactly the state a valid selected_title_achievement_id is in).
export function useSelectedTitles(authorIds) {
  const [titles, setTitles] = useState({});

  const ids = useMemo(() => Array.from(new Set((authorIds ?? []).filter(Boolean))).sort(), [authorIds]);
  const key = ids.join(",");

  useEffect(() => {
    if (!isSupabaseConfigured || ids.length === 0) {
      setTitles({});
      return;
    }
    let cancelled = false;
    supabase
      .from("user_gamification")
      .select(
        "user_id, level, selected_title_achievement_id, achievement:achievement_definitions(key, title, tier, icon_key)"
      )
      .in("user_id", ids)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Failed to load selected titles", error);
          setTitles({});
          return;
        }
        const map = {};
        for (const row of data ?? []) {
          if (row.selected_title_achievement_id && row.achievement) {
            map[row.user_id] = { level: row.level, ...row.achievement };
          }
        }
        setTitles(map);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return titles;
}
