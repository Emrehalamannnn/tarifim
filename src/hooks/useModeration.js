import { useCallback, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

// User-to-user blocking + post reporting (user_blocks / post_reports in
// supabase/schema.sql) — the App Store Guideline 1.2 moderation surface.
// Feed/comment hooks call fetchBlockedIds directly so their post lists are
// filtered in the same refresh that loads them; UI components use
// useBlockedIds for the reactive block/unblock button state.

export async function fetchBlockedIds(currentUserId) {
  if (!isSupabaseConfigured || !currentUserId) return new Set();
  const { data, error } = await supabase
    .from("user_blocks")
    .select("blocked_id")
    .eq("blocker_id", currentUserId);
  if (error) {
    console.error("Failed to load blocked users", error);
    return new Set();
  }
  return new Set(data.map((row) => row.blocked_id));
}

export async function reportPost(currentUserId, postId, reason = null) {
  const { error } = await supabase
    .from("post_reports")
    .insert({ post_id: postId, reporter_id: currentUserId, reason });
  // 23505 = already reported by this user — treat as success, the report
  // is on file either way.
  if (error && error.code !== "23505") throw error;
}

// Full blocked-user list with profile info — backs SettingsPage's
// "Engellenen Kullanıcılar" section. Distinct from useBlockedIds (which only
// tracks a Set of ids for feed-filtering / single-user block-button state)
// because the management UI needs each blocked user's name/avatar/username.
export function useBlockedUsers(currentUserId) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !currentUserId) {
      setUsers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("user_blocks")
      .select("blocked:profiles!user_blocks_blocked_id_fkey(id, name, avatar_url, username)")
      .eq("blocker_id", currentUserId);
    if (error) {
      console.error("Failed to load blocked users", error);
      setUsers([]);
    } else {
      setUsers((data ?? []).map((r) => r.blocked));
    }
    setLoading(false);
  }, [currentUserId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Scoped to blocker_id = currentUserId (the signed-in user) and the
  // targeted blocked_id, matching the "users can unblock their own block"
  // RLS policy — this can never touch another user's block rows.
  async function unblock(targetUserId) {
    const { error } = await supabase
      .from("user_blocks")
      .delete()
      .eq("blocker_id", currentUserId)
      .eq("blocked_id", targetUserId);
    if (error) throw error;
    setUsers((prev) => prev.filter((u) => u.id !== targetUserId));
  }

  return { users, loading, unblock, refresh };
}

export function useBlockedIds(currentUserId) {
  const [blockedIds, setBlockedIds] = useState(() => new Set());

  const refresh = useCallback(async () => {
    setBlockedIds(await fetchBlockedIds(currentUserId));
  }, [currentUserId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function block(targetUserId) {
    const { error } = await supabase
      .from("user_blocks")
      .insert({ blocker_id: currentUserId, blocked_id: targetUserId });
    if (error && error.code !== "23505") throw error;
    await refresh();
  }

  async function unblock(targetUserId) {
    const { error } = await supabase
      .from("user_blocks")
      .delete()
      .eq("blocker_id", currentUserId)
      .eq("blocked_id", targetUserId);
    if (error) throw error;
    await refresh();
  }

  return { blockedIds, block, unblock, refresh };
}
