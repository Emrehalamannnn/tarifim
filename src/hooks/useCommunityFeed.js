import { useCallback, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import ingredients from "../data/ingredients.json";

const OFFICIAL_AUTHOR_NAME = "Tarifim Mutfağı";
const ingredientsById = new Map(ingredients.map((i) => [i.id, i]));

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
        "id, author_id, photo_url, video_url, title, description, recipe_text, recipe_is_ai_generated, ingredient_ids, recipe_id, tags, share_count, created_at, author:profiles!posts_author_id_fkey(name, avatar_url, is_verified, is_owner, is_private), post_likes(user_id), post_comments(count), post_saves(user_id)"
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
        authorAvatarUrl: post.author?.avatar_url ?? null,
        authorIsVerified: post.author?.is_verified ?? false,
        authorIsOwner: post.author?.is_owner ?? false,
        authorIsPrivate: post.author?.is_private ?? false,
        isOfficial: post.author_id === null,
        recipeId: post.recipe_id,
        tags: post.tags ?? [],
        photoUrl: post.photo_url,
        videoUrl: post.video_url,
        shares: post.share_count ?? 0,
        title: post.title,
        description: post.description,
        recipeText: post.recipe_text,
        recipeIsAiGenerated: post.recipe_is_ai_generated ?? false,
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

  async function addPost({ photoFile, videoFile, title, description, recipeText, ingredientIds, tags = [] }) {
    let photoUrl = null;
    let videoUrl = null;

    if (videoFile) {
      const path = `${currentUserId}/${Date.now()}-${videoFile.name}`;
      const { error: uploadError } = await supabase.storage.from("post-videos").upload(path, videoFile);
      if (uploadError) throw uploadError;
      videoUrl = supabase.storage.from("post-videos").getPublicUrl(path).data.publicUrl;
    } else {
      const path = `${currentUserId}/${Date.now()}-${photoFile.name}`;
      const { error: uploadError } = await supabase.storage.from("post-photos").upload(path, photoFile);
      if (uploadError) throw uploadError;
      photoUrl = supabase.storage.from("post-photos").getPublicUrl(path).data.publicUrl;
    }

    let finalRecipeText = recipeText;
    let recipeIsAiGenerated = false;
    if (!finalRecipeText) {
      const ingredientNames = ingredientIds.map((id) => ingredientsById.get(id)?.name).filter(Boolean);
      try {
        const { data: generated, error: generateError } = await supabase.functions.invoke(
          "generate-recipe",
          { body: { title, description, ingredientNames, tags } }
        );
        if (generateError) throw generateError;
        if (generated?.recipeText) {
          finalRecipeText = generated.recipeText;
          recipeIsAiGenerated = true;
        }
      } catch (err) {
        console.error("Failed to generate recipe text, posting without one", err);
      }
    }

    const { error: insertError } = await supabase.from("posts").insert({
      author_id: currentUserId,
      photo_url: photoUrl,
      video_url: videoUrl,
      title,
      description,
      recipe_text: finalRecipeText || null,
      recipe_is_ai_generated: recipeIsAiGenerated,
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

  async function incrementShare(postId) {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, shares: p.shares + 1 } : p)));
    const { error } = await supabase.rpc("increment_post_share", { post_id: postId });
    if (error) {
      console.error("Failed to record share", error);
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

  return { posts, loading, addPost, toggleLike, toggleSave, incrementShare, deletePost, refresh };
}
