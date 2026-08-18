import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useCommunityFeed } from "../hooks/useCommunityFeed";
import { useFollowingIds } from "../hooks/useFollowingIds";
import PageFade from "../components/PageFade";
import PostCard from "../components/PostCard";
import CreatePostModal from "../components/CreatePostModal";
import CommentsModal from "../components/CommentsModal";

const FILTERS = [
  { value: "all", label: "Tümü" },
  { value: "following", label: "Takip Ettiklerim" },
];

export default function SocialPage() {
  const { isConfigured, user } = useAuth();
  const { posts, addPost, toggleLike, toggleSave, deletePost } = useCommunityFeed(user?.id);
  const { followingIds } = useFollowingIds(user?.id);
  const [createOpen, setCreateOpen] = useState(false);
  const [commentsPostId, setCommentsPostId] = useState(null);
  const [filter, setFilter] = useState("all");

  const visiblePosts = useMemo(() => {
    if (filter !== "following") return posts;
    return posts.filter((p) => followingIds.has(p.authorId));
  }, [posts, filter, followingIds]);

  async function handleSubmit(post) {
    await addPost(post);
    setCreateOpen(false);
  }

  return (
    <PageFade>
      <header className="flex items-center justify-between px-5 pb-2 pt-5">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-ink)]">Topluluk</h1>
          <p className="text-xs text-[var(--color-ink-soft)]">
            Diğer kullanıcıların tariflerini keşfet.
          </p>
        </div>
        {user ? (
          <button
            onClick={() => setCreateOpen(true)}
            className="rounded-full bg-[var(--color-paprika)] px-3.5 py-2 text-xs font-semibold text-white shadow-sm active:scale-95"
          >
            + Tarif Paylaş
          </button>
        ) : (
          <Link
            to="/profile"
            className="rounded-full bg-[var(--color-cream)] px-3.5 py-2 text-xs font-semibold text-[var(--color-ink-soft)]"
          >
            Paylaşmak için giriş yap
          </Link>
        )}
      </header>

      {!isConfigured && (
        <p className="mx-4 mb-2 rounded-xl bg-[var(--color-cream)] px-3.5 py-2.5 text-xs text-[var(--color-ink-soft)]">
          ⚙️ Topluluk akışı Supabase'e bağlı değil — bkz. Profil sekmesi kurulum talimatları için.
        </p>
      )}

      <div className="flex gap-2 px-4 pb-3">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              filter === f.value
                ? "bg-[var(--color-ink)] text-white"
                : "bg-white text-[var(--color-ink-soft)] shadow-sm"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filter === "following" && visiblePosts.length === 0 && (
        <p className="mx-4 mb-2 rounded-xl bg-[var(--color-cream)] px-3.5 py-2.5 text-xs text-[var(--color-ink-soft)]">
          Henüz kimseyi takip etmiyorsun. Paylaşımlardaki "Takip Et" butonuyla başlayabilirsin.
        </p>
      )}

      <ul className="flex flex-col gap-3 px-4 pb-4">
        {visiblePosts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            currentUserId={user?.id}
            onToggleLike={toggleLike}
            onToggleSave={toggleSave}
            onOpenComments={setCommentsPostId}
            onDelete={deletePost}
          />
        ))}
      </ul>

      {user && (
        <CreatePostModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onSubmit={handleSubmit}
        />
      )}

      <CommentsModal
        postId={commentsPostId}
        currentUserId={user?.id}
        open={commentsPostId !== null}
        onClose={() => setCommentsPostId(null)}
      />
    </PageFade>
  );
}
