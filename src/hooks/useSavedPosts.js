import { useCallback, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

// Posts the current user has bookmarked (post_saves is owner-only readable,
// see supabase/schema.sql) — backs ProfilePage's "Kaydedilenler" section.
export function useSavedPosts(userId) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !userId) {
      setPosts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("post_saves")
      .select("created_at, post:posts(*, author:profiles!posts_author_id_fkey(name))")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load saved posts", error);
      setPosts([]);
    } else {
      setPosts(
        data
          .filter((row) => row.post)
          .map((row) => ({
            id: row.post.id,
            author: row.post.author_id ? row.post.author?.name ?? "Bilinmeyen" : "Tarifim Mutfağı",
            authorId: row.post.author_id,
            isOfficial: row.post.author_id === null,
            recipeId: row.post.recipe_id,
            photoUrl: row.post.photo_url,
            title: row.post.title,
            savedAt: row.created_at,
          }))
      );
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { posts, loading, refresh };
}
