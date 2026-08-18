import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useCommunityFeed } from "../hooks/useCommunityFeed";
import PageFade from "../components/PageFade";
import PostCard from "../components/PostCard";
import CommentsModal from "../components/CommentsModal";
import EmptyState from "../components/EmptyState";

// Deep-link target for PostCard's share button — HashRouter puts this at
// #/post/:id. Reuses useCommunityFeed's already-fetched posts array rather
// than adding a dedicated single-post query, fine at this app's scale.
export default function PostDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { posts, loading, toggleLike, toggleSave, deletePost } = useCommunityFeed(user?.id);
  const [commentsOpen, setCommentsOpen] = useState(false);

  const post = posts.find((p) => p.id === id);

  if (loading) {
    return (
      <PageFade>
        <p className="px-5 py-16 text-center text-sm text-[var(--color-ink-soft)]">Yükleniyor…</p>
      </PageFade>
    );
  }

  if (!post) {
    return (
      <PageFade>
        <EmptyState
          emoji="🔍"
          title="Paylaşım bulunamadı"
          description="Bu paylaşım silinmiş olabilir."
          action={
            <Link
              to="/social"
              className="mt-2 rounded-full bg-[var(--color-paprika)] px-5 py-2 text-sm font-semibold text-white shadow-sm active:scale-95"
            >
              Topluluğa Dön
            </Link>
          }
        />
      </PageFade>
    );
  }

  return (
    <PageFade>
      <header className="px-5 pb-2 pt-5">
        <Link to="/social" className="text-xs font-semibold text-[var(--color-ink-soft)]">
          ← Topluluk
        </Link>
      </header>
      <ul className="flex flex-col gap-3 px-4 pb-4">
        <PostCard
          post={post}
          currentUserId={user?.id}
          onToggleLike={toggleLike}
          onToggleSave={toggleSave}
          onOpenComments={() => setCommentsOpen(true)}
          onDelete={deletePost}
        />
      </ul>
      <CommentsModal
        postId={post.id}
        currentUserId={user?.id}
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
      />
    </PageFade>
  );
}
