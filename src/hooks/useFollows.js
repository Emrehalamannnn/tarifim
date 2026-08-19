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
      supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("following_id", profileId)
        .eq("status", "accepted"),
      supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("follower_id", profileId)
        .eq("status", "accepted"),
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

// status: 'none' | 'pending' | 'accepted'. targetIsPrivate is only used to
// guess the right status on an optimistic insert — the server's
// enforce_follow_request_status trigger recomputes it authoritatively
// regardless, so a stale/wrong guess here can't cause a bad write, only a
// one-frame UI mismatch until the next refresh.
export function useIsFollowing(currentUserId, targetUserId, targetIsPrivate) {
  const [status, setStatus] = useState("none");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !currentUserId || !targetUserId || currentUserId === targetUserId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("follows")
      .select("status")
      .eq("follower_id", currentUserId)
      .eq("following_id", targetUserId)
      .maybeSingle();
    setStatus(data?.status ?? "none");
    setLoading(false);
  }, [currentUserId, targetUserId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function toggleFollow() {
    if (status === "none") {
      const nextStatus = targetIsPrivate ? "pending" : "accepted";
      setStatus(nextStatus);
      const { error } = await supabase
        .from("follows")
        .insert({ follower_id: currentUserId, following_id: targetUserId, status: nextStatus });
      if (error) {
        console.error("Failed to follow", error);
        setStatus("none");
      }
    } else {
      // Covers both "cancel a pending request" and "unfollow" — both are
      // just deleting my own outgoing row.
      const prev = status;
      setStatus("none");
      const { error } = await supabase
        .from("follows")
        .delete()
        .eq("follower_id", currentUserId)
        .eq("following_id", targetUserId);
      if (error) {
        console.error("Failed to unfollow/cancel request", error);
        setStatus(prev);
      }
    }
  }

  return { status, loading, toggleFollow };
}

// Followers or following list for a profile, with basic profile info for
// each row — backs FollowListModal. Only 'accepted' relationships (a
// private profile's pending requests aren't a "follower" yet).
export function useFollowList(profileId, type) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !profileId) {
      setList([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const filterColumn = type === "followers" ? "following_id" : "follower_id";
    const fkName = type === "followers" ? "follows_follower_id_fkey" : "follows_following_id_fkey";
    const { data, error } = await supabase
      .from("follows")
      .select(`profile:profiles!${fkName}(id, name, avatar_url, is_verified, is_owner, is_private)`)
      .eq(filterColumn, profileId)
      .eq("status", "accepted");
    if (error) {
      console.error("Failed to load follow list", error);
      setList([]);
    } else {
      setList((data ?? []).map((r) => r.profile));
    }
    setLoading(false);
  }, [profileId, type]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { list, loading, refresh };
}

// Pending incoming follow requests for a private account's owner — backs
// SettingsPage's "Takip İstekleri" section. Writes go through the
// respond_to_follow_request RPC (see schema.sql) rather than a raw
// update/delete, since accepting crosses into another user's row.
export function useFollowRequests(userId) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !userId) {
      setRequests([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("follows")
      .select("follower:profiles!follows_follower_id_fkey(id, name, avatar_url)")
      .eq("following_id", userId)
      .eq("status", "pending");
    if (error) {
      console.error("Failed to load follow requests", error);
      setRequests([]);
    } else {
      setRequests((data ?? []).map((r) => r.follower));
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function approve(followerId) {
    setRequests((prev) => prev.filter((r) => r.id !== followerId));
    const { error } = await supabase.rpc("respond_to_follow_request", { follower_id: followerId, accept: true });
    if (error) {
      console.error("Failed to approve follow request", error);
      await refresh();
    }
  }

  async function reject(followerId) {
    setRequests((prev) => prev.filter((r) => r.id !== followerId));
    const { error } = await supabase.rpc("respond_to_follow_request", { follower_id: followerId, accept: false });
    if (error) {
      console.error("Failed to reject follow request", error);
      await refresh();
    }
  }

  return { requests, loading, approve, reject, refresh };
}
