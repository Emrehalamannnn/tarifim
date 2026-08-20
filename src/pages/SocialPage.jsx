import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useCommunityFeed } from "../hooks/useCommunityFeed";
import { useFollowingIds } from "../hooks/useFollowingIds";
import PageFade from "../components/PageFade";
import PostCard from "../components/PostCard";
import PostCardSkeleton from "../components/PostCardSkeleton";
import CreatePostModal from "../components/CreatePostModal";
import CommentsModal from "../components/CommentsModal";
import FiltersModal from "../components/FiltersModal";
import ChatBox from "../components/ChatBox";

export default function SocialPage() {
  const { isConfigured, user, profile } = useAuth();
  const { posts, loading, addPost, toggleLike, toggleSave, incrementShare, deletePost } = useCommunityFeed(
    user?.id
  );
  const { followingIds } = useFollowingIds(user?.id);
  const [createOpen, setCreateOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [commentsPostId, setCommentsPostId] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [audienceFilter, setAudienceFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState(null);
  const [sort, setSort] = useState("recent");

  const activeFilterCount =
    (audienceFilter !== "all" ? 1 : 0) + (tagFilter !== null ? 1 : 0) + (sort !== "recent" ? 1 : 0);

  const visiblePosts = useMemo(() => {
    let result = posts;
    if (audienceFilter === "following") {
      result = result.filter((p) => followingIds.has(p.authorId));
    }
    if (tagFilter) {
      result = result.filter((p) => p.tags?.includes(tagFilter));
    }
    if (sort === "popular") {
      result = [...result].sort((a, b) => b.likes - a.likes);
    }
    return result;
  }, [posts, audienceFilter, tagFilter, sort, followingIds]);

  async function handleSubmit(post) {
    await addPost(post);
    setCreateOpen(false);
  }

  return (
    <PageFade>
      <header className="flex items-center justify-between px-5 pb-2 pt-5">
        <h1 className="flex items-center gap-1.5 text-2xl font-black tracking-tight text-[var(--color-ink)]">
          <span aria-hidden>🍳</span> Tarifim
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setChatOpen(true)}
            aria-label="Topluluk Sohbeti"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-cream)] text-base active:scale-95"
          >
            💬
          </button>
          {user ? (
            <button
              onClick={() => setCreateOpen(true)}
              aria-label="Tarif Paylaş"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-paprika)] text-lg font-bold text-[var(--color-cream)] shadow-sm active:scale-95"
            >
              +
            </button>
          ) : (
            <Link
              to="/profile"
              className="rounded-full bg-[var(--color-cream)] px-3.5 py-2 text-xs font-semibold text-[var(--color-ink-soft)]"
            >
              Paylaşmak için giriş yap
            </Link>
          )}
        </div>
      </header>

      {!isConfigured && (
        <p className="mx-4 mb-2 rounded-xl bg-[var(--color-cream)] px-3.5 py-2.5 text-xs text-[var(--color-ink-soft)]">
          ⚙️ Topluluk akışı Supabase'e bağlı değil — bkz. Profil sekmesi kurulum talimatları için.
        </p>
      )}

      <div className="px-4 pb-3">
        <button
          onClick={() => setFiltersOpen(true)}
          className="flex items-center gap-1.5 rounded-full bg-[var(--color-surface)] px-3.5 py-1.5 text-xs font-semibold text-[var(--color-ink-soft)] shadow-sm active:scale-95"
        >
          <span aria-hidden>⚙️</span> Filtreler
          {activeFilterCount > 0 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-paprika)] text-[10px] text-[var(--color-cream)]">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {audienceFilter === "following" && followingIds.size === 0 && (
        <p className="mx-4 mb-2 rounded-xl bg-[var(--color-cream)] px-3.5 py-2.5 text-xs text-[var(--color-ink-soft)]">
          Henüz kimseyi takip etmiyorsun. Paylaşımlardaki "Takip Et" butonuyla başlayabilirsin.
        </p>
      )}

      {!loading && visiblePosts.length === 0 && (audienceFilter !== "following" || followingIds.size > 0) && (
        <p className="mx-4 mb-2 rounded-xl bg-[var(--color-cream)] px-3.5 py-2.5 text-xs text-[var(--color-ink-soft)]">
          Bu filtrelere uyan bir paylaşım yok.
        </p>
      )}

      <ul className="flex flex-col gap-3 px-4 pb-4">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => <PostCardSkeleton key={i} />)
          : visiblePosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                currentUserId={user?.id}
                currentUserIsOwner={profile?.is_owner ?? false}
                onToggleLike={toggleLike}
                onToggleSave={toggleSave}
                onOpenComments={setCommentsPostId}
                onShare={incrementShare}
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

      <FiltersModal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        audienceFilter={audienceFilter}
        setAudienceFilter={setAudienceFilter}
        sort={sort}
        setSort={setSort}
        tagFilter={tagFilter}
        setTagFilter={setTagFilter}
      />

      <CommentsModal
        postId={commentsPostId}
        postAuthorId={posts.find((p) => p.id === commentsPostId)?.authorId ?? null}
        currentUserId={user?.id}
        currentUserIsOwner={profile?.is_owner ?? false}
        open={commentsPostId !== null}
        onClose={() => setCommentsPostId(null)}
      />

      <ChatBox currentUserId={user?.id} open={chatOpen} onClose={() => setChatOpen(false)} />
    </PageFade>
  );
}
