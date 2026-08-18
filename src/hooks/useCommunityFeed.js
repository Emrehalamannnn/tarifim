import { useCallback, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

const OFFICIAL_AUTHOR_NAME = "Tarifim Mutfağı";

// Replaces useAppStore's local-only `communityPosts` array. Posts, likes,
// comments, and photos now live in Supabase (posts/post_likes/post_comments
// tables, post-photos storage bucket) — see supabase/schema.sql. Posts with
// author_id = null are "official" ones seeded from the recipe catalog
// (supabase/seed_recipe_posts.sql), shown as authored by Tarifim Mutfağı.
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
    // Nested select pulls the author's name, every like's user_id, a
    // comment count, and (thanks to post_saves' owner-only RLS policy)
    // only the current user's own save row, all in one round trip.
    // post_likes is small per post and publicly readable — fine at this
    // app's scale, avoids a separate count/exists query per post.
    const { data, error } = await supabase
      .from("posts")
      .select(
        "*, author:profiles!posts_author_id_fkey(name, is_verified, is_owner), post_likes(user_id), post_comments(count), post_saves(user_id)"
      )
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
        author: post.author_id ? post.author?.name ?? "Bilinmeyen" : OFFICIAL_AUTHOR_NAME,
        authorId: post.author_id,
        authorIsVerified: post.author?.is_verified ?? false,
        authorIsOwner: post.author?.is_owner ?? false,
        isOfficial: post.author_id === null,
        recipeId: post.recipe_id,
        tags: post.tags ?? [],
        photoUrl: post.photo_url,
        title: post.title,
        description: post.description,
        ingredientIds: post.ingredient_ids,
        createdAt: post.created_at,
        likes: post.post_likes.length,
        likedByMe: currentUserId ? post.post_likes.some((l) => l.user_id === currentUserId) : false,
        commentCount: post.post_comments[0]?.count ?? 0,
        savedByMe: currentUserId ? post.post_saves.length > 0 : false,
        ownedByMe: currentUserId !== null && post.author_id === currentUserId,
      }))
    );
    setLoading(false);
  }, [currentUserId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addPost({ photoFile, title, description, ingredientIds, tags = [] }) {
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
      tags,
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

  async function toggleSave(postId, currentlySaved) {
    setPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, savedByMe: !currentlySaved } : p))
    );
    const query = supabase.from("post_saves");
    const { error } = currentlySaved
      ? await query.delete().eq("post_id", postId).eq("user_id", currentUserId)
      : await query.insert({ post_id: postId, user_id: currentUserId });
    if (error) {
      console.error("Failed to toggle save", error);
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

  return { posts, loading, addPost, toggleLike, toggleSave, deletePost, refresh };
}
