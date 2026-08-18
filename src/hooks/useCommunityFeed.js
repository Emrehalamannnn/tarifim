import { useCallback, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

// Replaces useAppStore's local-only `communityPosts` array. Posts, likes,
// and photos now live in Supabase (posts + post_likes tables, post-photos
// storage bucket) — see supabase/schema.sql.
export function useCommunityFeed(currentUserId) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setPosts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // Nested select pulls the author's name and every like's user_id in one
    // round trip (post_likes is small per post, and RLS allows public
    // select on it) — fine at this app's scale, avoids a separate
    // count/exists query per post.
    const { data, error } = await supabase
      .from("posts")
      .select("*, author:profiles!posts_author_id_fkey(name), post_likes(user_id)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load community posts", error);
      setPosts([]);
      setLoading(false);
      return;
    }

    setPosts(
      data.map((post) => ({
        id: post.id,
        author: post.author?.name ?? "Bilinmeyen",
        authorId: post.author_id,
        photoUrl: post.photo_url,
        title: post.title,
        description: post.description,
        ingredientIds: post.ingredient_ids,
        createdAt: post.created_at,
        likes: post.post_likes.length,
        likedByMe: currentUserId ? post.post_likes.some((l) => l.user_id === currentUserId) : false,
        ownedByMe: post.author_id === currentUserId,
      }))
    );
    setLoading(false);
  }, [currentUserId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addPost({ photoFile, title, description, ingredientIds }) {
    const path = `${currentUserId}/${Date.now()}-${photoFile.name}`;
    const { error: uploadError } = await supabase.storage
      .from("post-photos")
      .upload(path, photoFile);
    if (uploadError) throw uploadError;

    const {
      data: { publicUrl },
    } = supabase.storage.from("post-photos").getPublicUrl(path);

    const { error: insertError } = await supabase.from("posts").insert({
      author_id: currentUserId,
      photo_url: publicUrl,
      title,
      description,
      ingredient_ids: ingredientIds,
    });
    if (insertError) throw insertError;

    await refresh();
  }

  async function toggleLike(postId, currentlyLiked) {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, likedByMe: !currentlyLiked, likes: p.likes + (currentlyLiked ? -1 : 1) }
          : p
      )
    );
    const query = supabase.from("post_likes");
    const { error } = currentlyLiked
      ? await query.delete().eq("post_id", postId).eq("user_id", currentUserId)
      : await query.insert({ post_id: postId, user_id: currentUserId });
    if (error) {
      console.error("Failed to toggle like", error);
      await refresh();
    }
  }

  async function deletePost(postId) {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    const { error } = await supabase.from("posts").delete().eq("id", postId);
    if (error) {
      console.error("Failed to delete post", error);
      await refresh();
    }
  }

  return { posts, loading, addPost, toggleLike, deletePost, refresh };
}
