import { useCallback, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

// A single profile's public info by id — backs UserProfilePage. profiles is
// publicly readable (schema.sql), so this works for any user, not just the
// signed-in one.
export function useProfile(userId) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !userId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, avatar_url, is_owner, is_verified, is_private")
      .eq("id", userId)
      .single();
    if (error) {
      console.error("Failed to load profile", error);
      setProfile(null);
    } else {
      setProfile(data);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { profile, loading, refresh };
}

// Total likes across every post a user has authored — the "toplam beğeni"
// stat on their public profile. post_likes is publicly readable.
export function useProfileLikeTotal(userId) {
  const [likeTotal, setLikeTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured || !userId) {
      setLikeTotal(0);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from("posts")
      .select("post_likes(count)")
      .eq("author_id", userId)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Failed to load like total", error);
          setLikeTotal(0);
        } else {
          setLikeTotal(data.reduce((sum, p) => sum + (p.post_likes[0]?.count ?? 0), 0));
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { likeTotal, loading };
}
