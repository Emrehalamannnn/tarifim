import { useCallback, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

// Real follower/following counts + follow/unfollow, backed by the `follows`
// table (supabase/schema.sql). Replaces src/lib/mockSocial.js's
// mockSocialStats, which had no actual social graph behind it.
export function useFollowStats(profileId) {
  const [followers, setFollowers] = useState(0);
  const [following, setFollowing] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !profileId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [followersRes, followingRes] = await Promise.all([
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", profileId),
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", profileId),
    ]);
    setFollowers(followersRes.count ?? 0);
    setFollowing(followingRes.count ?? 0);
    setLoading(false);
  }, [profileId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { followers, following, loading, refresh };
}

export function useIsFollowing(currentUserId, targetUserId) {
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !currentUserId || !targetUserId || currentUserId === targetUserId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("follows")
      .select("follower_id")
      .eq("follower_id", currentUserId)
      .eq("following_id", targetUserId)
      .maybeSingle();
    setIsFollowing(Boolean(data));
    setLoading(false);
  }, [currentUserId, targetUserId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function toggleFollow() {
    setIsFollowing((prev) => !prev);
    const { error } = isFollowing
      ? await supabase
          .from("follows")
          .delete()
          .eq("follower_id", currentUserId)
          .eq("following_id", targetUserId)
      : await supabase.from("follows").insert({ follower_id: currentUserId, following_id: targetUserId });
    if (error) {
      console.error("Failed to toggle follow", error);
      setIsFollowing((prev) => !prev);
    }
  }

  return { isFollowing, loading, toggleFollow };
}
