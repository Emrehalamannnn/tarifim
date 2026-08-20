import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useFollowList } from "../hooks/useFollows";
import Avatar from "./Avatar";
import FollowButton from "./FollowButton";

const TITLES = { followers: "Takipçiler", following: "Takip Edilenler" };
const EMPTY_MESSAGES = { followers: "Henüz takipçi yok.", following: "Henüz kimseyi takip etmiyor." };

function FollowListRow({ profile, currentUserId }) {
  return (
    <li className="flex items-center gap-2.5">
      <Link to={`/user/${profile.id}`} className="flex min-w-0 flex-1 items-center gap-2.5">
        <Avatar name={profile.name} avatarUrl={profile.avatar_url} />
        <span className="flex min-w-0 items-center gap-1 truncate text-sm font-semibold text-[var(--color-ink)]">
          <span className="truncate">{profile.name}</span>
          {profile.is_owner && <span title="Kurucu">👑</span>}
          {!profile.is_owner && profile.is_verified && (
            <span
              className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-[var(--color-olive)] text-[8px] text-[var(--color-cream)]"
              title="Onaylı hesap"
            >
              ✓
            </span>
          )}
        </span>
      </Link>
      <FollowButton
        currentUserId={currentUserId}
        targetUserId={profile.id}
        targetIsPrivate={profile.is_private}
        size="sm"
      />
    </li>
  );
}

// Bottom-sheet listing a profile's followers or following, opened by
// tapping the counts on ProfilePage. Same visual/animation pattern as
// CommentsModal.
export default function FollowListModal({ profileId, type, currentUserId, open, onClose }) {
  const { list, loading } = useFollowList(open ? profileId : null, type);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[55] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="flex max-h-[85vh] w-full max-w-sm flex-col overflow-hidden rounded-t-[28px] bg-[var(--color-surface)] shadow-2xl sm:rounded-[28px]"
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--color-cream-dark)] px-5 py-4">
              <h2 className="text-base font-bold text-[var(--color-ink)]">{TITLES[type]}</h2>
              <button
                onClick={onClose}
                aria-label="Kapat"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-cream)] text-sm active:scale-90"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {loading ? (
                <p className="py-8 text-center text-sm text-[var(--color-ink-soft)]">Yükleniyor…</p>
              ) : list.length === 0 ? (
                <p className="py-8 text-center text-sm text-[var(--color-ink-soft)]">{EMPTY_MESSAGES[type]}</p>
              ) : (
                <ul className="flex flex-col gap-4">
                  {list.map((profile) => (
                    <FollowListRow key={profile.id} profile={profile} currentUserId={currentUserId} />
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
