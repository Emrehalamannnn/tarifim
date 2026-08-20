import { initialsFrom } from "../lib/mockSocial";

const SIZE_CLASSES = {
  sm: "h-7 w-7 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-16 w-16 text-xl",
};

// Shared avatar circle: a real photo when profile.avatar_url is set,
// otherwise initials-from-name — the same fallback ProfilePage always used,
// now reused by PostCard, CommentsModal, and UserProfilePage too.
export default function Avatar({ name, avatarUrl, size = "md", className = "" }) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-olive)] font-bold text-[var(--color-cream)] ${SIZE_CLASSES[size]} ${className}`}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        initialsFrom(name ?? "") || "🧑‍🍳"
      )}
    </div>
  );
}
