import { useIsFollowing } from "../hooks/useFollows";

const LABELS = { none: "Takip Et", pending: "İstek Gönderildi", accepted: "Takip Ediliyor" };

const SIZE_CLASSES = {
  md: "rounded-full px-5 py-2 text-sm font-semibold",
  sm: "rounded-full px-2.5 py-1 text-[11px] font-semibold",
};

// Shared follow/unfollow control, used on UserProfilePage, PostCard, and
// FollowListModal. 3-state: 'none' (tap to follow/request), 'pending' (tap
// to cancel the request), 'accepted' (tap to unfollow).
export default function FollowButton({ currentUserId, targetUserId, targetIsPrivate, size = "md" }) {
  const { status, loading, toggleFollow } = useIsFollowing(currentUserId, targetUserId, targetIsPrivate);
  if (!currentUserId || currentUserId === targetUserId || loading) return null;

  const isActive = status !== "none";
  return (
    <button
      onClick={toggleFollow}
      className={`${SIZE_CLASSES[size]} active:scale-95 ${
        isActive ? "bg-[var(--color-cream)] text-[var(--color-ink-soft)]" : "bg-[var(--color-olive)] text-[var(--color-cream)]"
      }`}
    >
      {LABELS[status]}
    </button>
  );
}
