import { useCallback, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { fetchBlockedIds } from "./useModeration";

// Comments for a single post, loaded lazily (only while a CommentsModal for
// that post is open) rather than as part of useCommunityFeed's feed query.
// Instagram-style shape: one level of replies (a reply's parent is always a
// top-level comment — replying to a reply re-parents onto that reply's own
// parent, see CommentsModal), per-comment likes, and a post-owner-only pin.
export function usePostComments(postId, currentUserId) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !postId) {
      setComments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("post_comments")
      .select(
        "*, author:profiles!post_comments_author_id_fkey(name, avatar_url), comment_likes(user_id)"
      )
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Failed to load comments", error);
      setComments([]);
    } else {
      // Comments from users the viewer has blocked are dropped, matching
      // the feed-level filtering in useCommunityFeed.
      const blockedIds = await fetchBlockedIds(currentUserId);
      const visible = blockedIds.size ? data.filter((c) => !blockedIds.has(c.author_id)) : data;
      setComments(
        visible.map((c) => ({
          id: c.id,
          postId: c.post_id,
          parentCommentId: c.parent_comment_id,
          pinnedAt: c.pinned_at,
          authorId: c.author_id,
          author: c.author?.name ?? "Bilinmeyen",
          authorAvatarUrl: c.author?.avatar_url ?? null,
          body: c.body,
          createdAt: c.created_at,
          likeCount: c.comment_likes.length,
          likedByMe: currentUserId ? c.comment_likes.some((l) => l.user_id === currentUserId) : false,
        }))
      );
    }
    setLoading(false);
  }, [postId, currentUserId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function addComment(currentUserId, body, parentCommentId = null) {
    const { error } = await supabase
      .from("post_comments")
      .insert({ post_id: postId, author_id: currentUserId, body, parent_comment_id: parentCommentId });
    if (error) throw error;
    await refresh();
  }

  async function deleteComment(commentId) {
    setComments((prev) => prev.filter((c) => c.id !== commentId && c.parentCommentId !== commentId));
    const { error } = await supabase.from("post_comments").delete().eq("id", commentId);
    if (error) {
      console.error("Failed to delete comment", error);
      await refresh();
    }
  }

  async function toggleCommentLike(commentId, currentlyLiked) {
    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? { ...c, likeCount: c.likeCount + (currentlyLiked ? -1 : 1), likedByMe: !currentlyLiked }
          : c
      )
    );
    const query = supabase.from("comment_likes");
    const { error } = currentlyLiked
      ? await query.delete().eq("comment_id", commentId).eq("user_id", currentUserId)
      : await query.insert({ comment_id: commentId, user_id: currentUserId });
    if (error) {
      console.error("Failed to toggle comment like", error);
      await refresh();
    }
  }

  async function togglePin(commentId, currentlyPinned) {
    setComments((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, pinnedAt: currentlyPinned ? null : new Date().toISOString() } : c))
    );
    const { error } = await supabase.rpc("set_comment_pinned", {
      comment_id: commentId,
      pinned: !currentlyPinned,
    });
    if (error) {
      console.error("Failed to toggle pin", error);
      await refresh();
    }
  }

  return { comments, loading, addComment, deleteComment, toggleCommentLike, togglePin, refresh };
}
