import { useCallback, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

// Set of user ids the current user follows — backs SocialPage's "Takip
// Ettiklerim" feed filter tab. Mirrors the query shape in useFollows.js.
export function useFollowingIds(currentUserId) {
  const [followingIds, setFollowingIds] = useState(new Set());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !currentUserId) {
      setFollowingIds(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", currentUserId);
    setFollowingIds(new Set((data ?? []).map((r) => r.following_id)));
    setLoading(false);
  }, [currentUserId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { followingIds, loading, refresh };
}
