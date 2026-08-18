import { useState } from "react";
import { Link } from "react-router-dom";
import ingredients from "../data/ingredients.json";
import { useAppStore } from "../store/useAppStore";
import { initialsFrom } from "../lib/mockSocial";
import PageFade from "../components/PageFade";
import CreatePostModal from "../components/CreatePostModal";

const ingredientsById = new Map(ingredients.map((i) => [i.id, i]));

const dateFormatter = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" });

function PostCard({ post }) {
  const toggleLike = useAppStore((s) => s.toggleLikeCommunityPost);
  const deletePost = useAppStore((s) => s.deleteCommunityPost);

  return (
    <li className="overflow-hidden rounded-2xl bg-white shadow-sm">
      <div className="flex items-center gap-2.5 px-4 pt-3.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-olive)] text-xs font-bold text-white">
          {initialsFrom(post.author) || "🧑‍🍳"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--color-ink)]">{post.author}</p>
          <p className="text-[11px] text-[var(--color-ink-soft)]">
            {dateFormatter.format(new Date(post.createdAt))}
          </p>
        </div>
        {post.ownedByMe && (
          <button
            onClick={() => deletePost(post.id)}
            aria-label="Paylaşımı sil"
            className="text-xs text-[var(--color-tomato)]"
          >
            Sil
          </button>
        )}
      </div>

      <img src={post.photoUrl} alt={post.title} className="mt-3 h-56 w-full object-cover" />

      <div className="flex flex-col gap-2 px-4 py-3.5">
        <h3 className="text-sm font-bold text-[var(--color-ink)]">{post.title}</h3>
        {post.description && (
          <p className="text-sm text-[var(--color-ink-soft)]">{post.description}</p>
        )}

        <div className="flex flex-wrap gap-1.5">
          {post.ingredientIds.map((id) => (
            <span
              key={id}
              className="rounded-full bg-[var(--color-cream)] px-2 py-0.5 text-[11px] text-[var(--color-ink-soft)]"
            >
              {ingredientsById.get(id)?.name ?? id}
            </span>
          ))}
        </div>

        <button
          onClick={() => toggleLike(post.id)}
          className="mt-1 flex w-fit items-center gap-1.5 text-sm active:scale-95"
        >
          <span className={post.likedByMe ? "text-[var(--color-tomato)]" : "text-[var(--color-ink-soft)]"}>
            {post.likedByMe ? "❤️" : "🤍"}
          </span>
          <span className="text-[var(--color-ink-soft)]">{post.likes}</span>
        </button>
      </div>
    </li>
  );
}

export default function SocialPage() {
  const user = useAppStore((s) => s.user);
  const posts = useAppStore((s) => s.communityPosts);
  const addCommunityPost = useAppStore((s) => s.addCommunityPost);
  const [createOpen, setCreateOpen] = useState(false);

  function handleSubmit(post) {
    addCommunityPost({
      id: `post_${Date.now()}`,
      author: user.name,
      createdAt: new Date().toISOString(),
      likes: 0,
      likedByMe: false,
      ownedByMe: true,
      ...post,
    });
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

      <ul className="flex flex-col gap-3 px-4 pb-4">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </ul>

      {user && (
        <CreatePostModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onSubmit={handleSubmit}
        />
      )}
    </PageFade>
  );
}
