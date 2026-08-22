import { useCallback, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { useGamification } from "./useGamification";

// Achievements/gamification view for ANY profile — self or someone else.
// For the signed-in user's own id this delegates entirely to
// useGamification (the full owner shape: locked achievements + private
// progress, realtime unlock queue). For anyone else it calls
// get_public_gamification, which the server deliberately narrows to
// level/rank/selected title/unlocked achievements only — no locked list,
// no progress, no xp (see supabase/schema.sql). Both cases are normalized
// to one shape so gallery UI never has to branch on "is this me".
export function useAchievements(profileId, currentUserId) {
  const isSelf = Boolean(profileId) && profileId === currentUserId;
  const own = useGamification(isSelf ? profileId : null);

  const [publicData, setPublicData] = useState(null);
  const [publicLoading, setPublicLoading] = useState(true);

  const refreshPublic = useCallback(async () => {
    if (!isSupabaseConfigured || !profileId || isSelf) {
      setPublicLoading(false);
      return;
    }
    setPublicLoading(true);
    const { data, error } = await supabase.rpc("get_public_gamification", { p_user_id: profileId });
    if (error) {
      console.error("Failed to load public gamification", error);
      setPublicData(null);
    } else {
      setPublicData(data);
    }
    setPublicLoading(false);
  }, [profileId, isSelf]);

  useEffect(() => {
    refreshPublic();
  }, [refreshPublic]);

  if (isSelf) {
    return {
      isSelf: true,
      loading: own.loading,
      level: own.level,
      rankName: own.rankName,
      xp: own.xp,
      progressPercent: own.progressPercent,
      levelStartXp: own.levelStartXp,
      nextLevelXp: own.nextLevelXp,
      selectedTitle: own.selectedTitle,
      unlockedAchievements: own.unlockedAchievements,
      lockedAchievements: own.lockedAchievements,
      achievementCount: own.achievementCount,
      totalAchievementCount: own.totalAchievementCount,
      selectTitle: own.selectTitle,
      newlyUnlocked: own.newlyUnlocked,
      acknowledgeUnlock: own.acknowledgeUnlock,
      refresh: own.refresh,
    };
  }

  const selectedTitle =
    publicData?.unlockedAchievements?.find((a) => a.id === publicData?.selectedTitleId) ?? null;

  return {
    isSelf: false,
    loading: publicLoading,
    level: publicData?.level ?? null,
    rankName: publicData?.rankName ?? null,
    xp: null,
    progressPercent: null,
    levelStartXp: null,
    nextLevelXp: null,
    selectedTitle,
    unlockedAchievements: publicData?.unlockedAchievements ?? [],
    lockedAchievements: [],
    achievementCount: publicData?.achievementCount ?? 0,
    totalAchievementCount: null,
    selectTitle: null,
    newlyUnlocked: [],
    acknowledgeUnlock: () => {},
    refresh: refreshPublic,
  };
}
