import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useCommunityFeed } from "../hooks/useCommunityFeed";
import { useFollowingIds } from "../hooks/useFollowingIds";
import { ALL_TAGS, tagLabel } from "../lib/tags";
import PageFade from "../components/PageFade";
import PostCard from "../components/PostCard";
import CreatePostModal from "../components/CreatePostModal";
import CommentsModal from "../components/CommentsModal";

const AUDIENCE_FILTERS = [
  { value: "all", label: "Tümü" },
  { value: "following", label: "Takip Ettiklerim" },
];

const SORT_OPTIONS = [
  { value: "recent", label: "En Yeni" },
  { value: "popular", label: "En Popüler" },
];

export default function SocialPage() {
  const { isConfigured, user, profile } = useAuth();
  const { posts, addPost, toggleLike, toggleSave, deletePost } = useCommunityFeed(user?.id);
  const { followingIds } = useFollowingIds(user?.id);
  const [createOpen, setCreateOpen] = useState(false);
  const [commentsPostId, setCommentsPostId] = useState(null);
  const [audienceFilter, setAudienceFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState(null);
  const [sort, setSort] = useState("recent");

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

      <div className="flex gap-2 px-4 pb-2">
        {AUDIENCE_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setAudienceFilter(f.value)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              audienceFilter === f.value
                ? "bg-[var(--color-ink)] text-white"
                : "bg-white text-[var(--color-ink-soft)] shadow-sm"
            }`}
          >
            {f.label}
          </button>
        ))}

        <div className="ml-auto flex gap-1 rounded-full bg-white p-0.5 shadow-sm">
          {SORT_OPTIONS.map((s) => (
            <button
              key={s.value}
              onClick={() => setSort(s.value)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                sort === s.value
                  ? "bg-[var(--color-olive)] text-white"
                  : "text-[var(--color-ink-soft)]"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto px-4 pb-3">
        <button
          onClick={() => setTagFilter(null)}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            tagFilter === null
              ? "bg-[var(--color-paprika)] text-white"
              : "bg-white text-[var(--color-ink-soft)] shadow-sm"
          }`}
        >
          Tüm Kategoriler
        </button>
        {ALL_TAGS.map((tag) => (
          <button
            key={tag}
            onClick={() => setTagFilter((prev) => (prev === tag ? null : tag))}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              tagFilter === tag
                ? "bg-[var(--color-paprika)] text-white"
                : "bg-white text-[var(--color-ink-soft)] shadow-sm"
            }`}
          >
            {tagLabel(tag)}
          </button>
        ))}
      </div>

      {audienceFilter === "following" && followingIds.size === 0 && (
        <p className="mx-4 mb-2 rounded-xl bg-[var(--color-cream)] px-3.5 py-2.5 text-xs text-[var(--color-ink-soft)]">
          Henüz kimseyi takip etmiyorsun. Paylaşımlardaki "Takip Et" butonuyla başlayabilirsin.
        </p>
      )}

      {visiblePosts.length === 0 && (audienceFilter !== "following" || followingIds.size > 0) && (
        <p className="mx-4 mb-2 rounded-xl bg-[var(--color-cream)] px-3.5 py-2.5 text-xs text-[var(--color-ink-soft)]">
          Bu filtrelere uyan bir paylaşım yok.
        </p>
      )}

      <ul className="flex flex-col gap-3 px-4 pb-4">
        {visiblePosts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            currentUserId={user?.id}
            currentUserIsOwner={profile?.is_owner ?? false}
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
