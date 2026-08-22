import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "../hooks/useAuth";
import { useGamification } from "../hooks/useGamification";
import AchievementBadge from "./AchievementBadge";
import AchievementDetailModal from "./AchievementDetailModal";

const DISPLAY_MS = 4200;

// Mounted once at the app root (see App.jsx, same placement pattern as
// <ResetPasswordModal />) — self-contained, reads the signed-in user itself
// rather than being threaded through props. Achievements unlock server-side
// (triggers in supabase/schema.sql) and arrive here via useGamification's
// realtime-backed `newlyUnlocked` queue; this component's only job is
// showing them one at a time (never overlapping — spec: "Do not display
// five overlapping modals") and marking each acknowledged once shown.
export default function AchievementUnlockToast() {
  const { user } = useAuth();
  const { newlyUnlocked, acknowledgeUnlock, selectedTitle, selectTitle } = useGamification(user?.id);
  const [current, setCurrent] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const prefersReducedMotion = useMemo(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    []
  );

  useEffect(() => {
    if (!current && newlyUnlocked.length > 0) {
      setCurrent(newlyUnlocked[0]);
    }
  }, [newlyUnlocked, current]);

  useEffect(() => {
    if (!current || detailOpen) return;
    const timer = window.setTimeout(() => dismiss(), DISPLAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, detailOpen]);

  function dismiss() {
    if (!current) return;
    acknowledgeUnlock(current.id);
    setCurrent(null);
  }

  function handleTap() {
    setDetailOpen(true);
  }

  function handleDetailClose() {
    setDetailOpen(false);
    dismiss();
  }

  return (
    <>
      <AnimatePresence>
        {current && !detailOpen && (
          <motion.div
            key={current.id}
            className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+12px)] z-[70] flex justify-center px-5"
            initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -30, scale: 0.9 }}
            animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -20, scale: 0.9 }}
            transition={prefersReducedMotion ? { duration: 0.15 } : { type: "spring", stiffness: 340, damping: 26 }}
          >
            <button
              onClick={handleTap}
              className="flex w-full max-w-sm items-center gap-3 rounded-2xl bg-[var(--color-surface)] px-4 py-3 text-left shadow-2xl active:scale-[0.98]"
            >
              <AchievementBadge achievement={current} size="md" animated={!prefersReducedMotion} />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-paprika)]">
                  Yeni Ünvan Açıldı
                </p>
                <p className="truncate text-sm font-black text-[var(--color-ink)]">{current.title}</p>
                {current.xpReward > 0 && (
                  <p className="text-[11px] font-semibold text-[var(--color-saffron)]">+{current.xpReward} XP</p>
                )}
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AchievementDetailModal
        achievement={current}
        open={detailOpen}
        onClose={handleDetailClose}
        isSelf
        isSelected={Boolean(current) && selectedTitle?.id === current.id}
        onSelectTitle={selectTitle}
      />
    </>
  );
}
