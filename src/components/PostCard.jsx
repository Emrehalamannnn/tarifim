import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ingredients from "../data/ingredients.json";
import { useIsFollowing } from "../hooks/useFollows";
import Avatar from "./Avatar";

// Double-click-to-like on the media needs to coexist with single-click-to-open.
// Browsers fire two click events before a dblclick, so a naive onClick would
// navigate away before the second click ever lands — this delays a single
// click just long enough to cancel it if a second one arrives in time.
const DOUBLE_CLICK_WINDOW_MS = 250;

const ingredientsById = new Map(ingredients.map((i) => [i.id, i]));

const dateFormatter = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" });

function shareUrlFor(postId) {
  return `${window.location.origin}${window.location.pathname}#/post/${postId}`;
}

function FollowButton({ currentUserId, authorId }) {
  const { isFollowing, loading, toggleFollow } = useIsFollowing(currentUserId, authorId);
  if (!currentUserId || currentUserId === authorId || loading) return null;

  return (
    <button
      onClick={toggleFollow}
      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold active:scale-95 ${
        isFollowing
          ? "bg-[var(--color-cream)] text-[var(--color-ink-soft)]"
          : "bg-[var(--color-olive)] text-white"
      }`}
    >
      {isFollowing ? "Takip Ediliyor" : "Takip Et"}
    </button>
  );
}

export default function PostCard({
  post,
  currentUserId,
  currentUserIsOwner,
  onToggleLike,
  onToggleSave,
  onOpenComments,
  onShare,
  onDelete,
}) {
  const navigate = useNavigate();
  const [shareFeedback, setShareFeedback] = useState(false);
  const [muted, setMuted] = useState(true);
  const clickTimer = useRef(null);

  async function handleShare(e) {
    e.stopPropagation();
    onShare?.(post.id);
    const url = shareUrlFor(post.id);
    if (navigator.share) {
      try {
        await navigator.share({ title: post.title, text: post.description, url });
        return;
      } catch {
        // user cancelled the share sheet, or share failed — fall through to
        // the clipboard fallback below rather than leaving no feedback
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareFeedback(true);
      window.setTimeout(() => setShareFeedback(false), 1800);
    } catch {
      // clipboard API unavailable — nothing more we can do
    }
  }

  function handleMediaClick() {
    if (clickTimer.current) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
      return;
    }
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      navigate(`/post/${post.id}`);
    }, DOUBLE_CLICK_WINDOW_MS);
  }

  function handleMediaDoubleClick() {
    if (clickTimer.current) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    if (!currentUserId || post.likedByMe) return;
    onToggleLike(post.id, false);
  }

  return (
    <li className="overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-sm">
      <div className="flex items-center gap-2.5 px-4 pt-3.5">
        {post.isOfficial ? (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-olive)] text-xs font-bold text-white">
            🍳
          </div>
        ) : (
          <Link to={`/user/${post.authorId}`}>
            <Avatar name={post.author} avatarUrl={post.authorAvatarUrl} />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 truncate text-sm font-semibold text-[var(--color-ink)]">
            {post.isOfficial ? (
              post.author
            ) : (
              <Link to={`/user/${post.authorId}`} className="truncate">
                {post.author}
              </Link>
            )}
            {post.isOfficial && (
              <span
                className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--color-paprika)] text-[8px] text-white"
                title="Resmi Tarifim hesabı"
              >
                ✓
              </span>
            )}
            {!post.isOfficial && post.authorIsOwner && (
              <span title="Kurucu">👑</span>
            )}
            {!post.isOfficial && !post.authorIsOwner && post.authorIsVerified && (
              <span
                className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--color-olive)] text-[8px] text-white"
                title="Onaylı hesap"
              >
                ✓
              </span>
            )}
          </p>
          <p className="text-[11px] text-[var(--color-ink-soft)]">
            {dateFormatter.format(new Date(post.createdAt))}
          </p>
        </div>
        {!post.isOfficial && <FollowButton currentUserId={currentUserId} authorId={post.authorId} />}
        {(post.ownedByMe || currentUserIsOwner) && (
          <button
            onClick={() => onDelete(post.id)}
            aria-label="Paylaşımı sil"
            className="text-xs text-[var(--color-tomato)]"
          >
            Sil
          </button>
        )}
      </div>

      <div
        className="relative mt-3 aspect-[4/5] w-full select-none overflow-hidden bg-[var(--color-ink)]"
        onClick={handleMediaClick}
        onDoubleClick={handleMediaDoubleClick}
      >
        {post.videoUrl ? (
          <>
            <video
              src={post.videoUrl}
              className="h-full w-full object-cover"
              autoPlay
              loop
              muted={muted}
              playsInline
              draggable={false}
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMuted((m) => !m);
              }}
              aria-label={muted ? "Sesi Aç" : "Sesi Kapat"}
              className="absolute bottom-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-sm text-white backdrop-blur"
            >
              {muted ? "🔇" : "🔊"}
            </button>
          </>
        ) : (
          <img
            src={post.photoUrl}
            alt={post.title}
            className="h-full w-full object-cover"
            draggable={false}
          />
        )}
      </div>

      <div className="flex flex-col gap-2 px-4 py-3.5">
        <div className="flex items-center gap-4">
          <button
            onClick={() => onToggleLike(post.id, post.likedByMe)}
            disabled={!currentUserId}
            className="flex items-center gap-1.5 text-sm active:scale-95 disabled:opacity-60"
          >
            <span className={post.likedByMe ? "text-[var(--color-tomato)]" : "text-[var(--color-ink-soft)]"}>
              {post.likedByMe ? "❤️" : "🤍"}
            </span>
            <span className="text-[var(--color-ink-soft)]">{post.likes}</span>
          </button>

          <button
            onClick={() => onOpenComments(post.id)}
            className="flex items-center gap-1.5 text-sm active:scale-95"
          >
            <span className="text-[var(--color-ink-soft)]">💬</span>
            <span className="text-[var(--color-ink-soft)]">{post.commentCount}</span>
          </button>

          <button onClick={handleShare} className="flex items-center gap-1.5 text-sm active:scale-95">
            <span className="text-[var(--color-ink-soft)]">↗️</span>
            <span className="text-[var(--color-ink-soft)]">{post.shares}</span>
          </button>

          <button
            onClick={() => onToggleSave(post.id, post.savedByMe)}
            disabled={!currentUserId}
            aria-label={post.savedByMe ? "Kaydedilenlerden çıkar" : "Kaydet"}
            className={`ml-auto active:scale-95 disabled:opacity-60 ${
              post.savedByMe ? "text-[var(--color-paprika)]" : "text-[var(--color-ink-soft)]"
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill={post.savedByMe ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        </div>

        {shareFeedback && <p className="text-[11px] text-[var(--color-olive)]">Bağlantı kopyalandı ✓</p>}

        <button onClick={() => navigate(`/post/${post.id}`)} className="text-left">
          <h3 className="text-sm font-bold text-[var(--color-ink)]">{post.title}</h3>
          {post.description && (
            <p className="text-sm text-[var(--color-ink-soft)]">{post.description}</p>
          )}
        </button>

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

        {post.recipeId && (
          <Link
            to={`/recipe/${post.recipeId}`}
            className="mt-1 w-fit text-xs font-semibold text-[var(--color-paprika)]"
          >
            Tarifi Gör →
          </Link>
        )}
      </div>
    </li>
  );
}
