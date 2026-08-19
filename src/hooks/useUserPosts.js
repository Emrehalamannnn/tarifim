import { useCallback, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

// Posts a given user has authored — backs ProfilePage's "Paylaşımlarım" grid
// and UserProfilePage's public posts grid. posts.select is publicly
// readable, so this works for any author_id, not just the signed-in user.
export function useUserPosts(authorId) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !authorId) {
      setPosts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("posts")
      .select("id, photo_url, video_url, title")
      .eq("author_id", authorId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load user posts", error);
      setPosts([]);
    } else {
      setPosts(
        data.map((p) => ({ id: p.id, photoUrl: p.photo_url, videoUrl: p.video_url, title: p.title }))
      );
    }
    setLoading(false);
  }, [authorId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { posts, loading, refresh };
}
