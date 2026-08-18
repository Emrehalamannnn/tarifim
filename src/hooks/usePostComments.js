import { useCallback, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

// Comments for a single post, loaded lazily (only while a CommentsModal for
// that post is open) rather than as part of useCommunityFeed's feed query.
export function usePostComments(postId) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !postId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("post_comments")
      .select("*, author:profiles!post_comments_author_id_fkey(name)")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Failed to load comments", error);
      setComments([]);
    } else {
      setComments(
        data.map((c) => ({
          id: c.id,
          authorId: c.author_id,
          author: c.author?.name ?? "Bilinmeyen",
          body: c.body,
          createdAt: c.created_at,
        }))
      );
    }
    setLoading(false);
  }, [postId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addComment(currentUserId, body) {
    const { error } = await supabase
      .from("post_comments")
      .insert({ post_id: postId, author_id: currentUserId, body });
    if (error) throw error;
    await refresh();
  }

  async function deleteComment(commentId) {
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    const { error } = await supabase.from("post_comments").delete().eq("id", commentId);
    if (error) {
      console.error("Failed to delete comment", error);
      await refresh();
    }
  }

  return { comments, loading, addComment, deleteComment };
}
