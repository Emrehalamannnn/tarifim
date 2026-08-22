import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import AchievementBadge from "./AchievementBadge";
import { tierLabel } from "../lib/achievementRarity";

const PROGRESS_LABELS_TR = {
  post_count: "Tarif",
  category_post_count: "Tarif",
  total_likes_received: "Beğeni",
  single_post_likes: "Tek tarif beğenisi",
  dessert_likes: "Tatlı beğenisi",
  comments_received: "Yorum",
  comments_written: "Yazılan yorum",
  followers: "Takipçi",
  following: "Takip edilen",
  saves_received: "Kayıt",
  saved_count: "Kaydedilen tarif",
  distinct_categories: "Farklı kategori",
  active_days: "Farklı gün",
  active_months: "Farklı ay",
  xp_total: "XP",
  achievement_count: "Başarım",
  legendary_count: "Efsanevi başarım",
  level: "Seviye",
  distinct_achievement_categories: "Farklı başarım kategorisi",
};

function ProgressLine({ progress }) {
  if (!progress) return null;
  if (progress.parts) {
    return (
      <ul className="mt-3 flex flex-col gap-1.5">
        {progress.parts.map((part, i) => (
          <li key={i} className="flex items-center justify-between text-xs text-[var(--color-ink-soft)]">
            <span>{PROGRESS_LABELS_TR[part.type] ?? "İlerleme"}</span>
            <span className="font-semibold text-[var(--color-ink)]">
              {Math.min(part.current, part.target).toLocaleString("tr-TR")} / {part.target.toLocaleString("tr-TR")}
            </span>
          </li>
        ))}
      </ul>
    );
  }
  const pct = Math.max(0, Math.min(100, (progress.current / progress.target) * 100));
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-xs text-[var(--color-ink-soft)]">
        <span>{PROGRESS_LABELS_TR[progress.type] ?? "İlerleme"}</span>
        <span className="font-semibold text-[var(--color-ink)]">
          {Math.min(progress.current, progress.target).toLocaleString("tr-TR")} / {progress.target.toLocaleString("tr-TR")}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-cream)]">
        <div className="h-full rounded-full bg-[var(--color-olive)]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const dateFormatter = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" });

// Tapping any badge (gallery, unlock toast, selected-title chip) opens this.
// `achievement` carries whatever the caller already has — a fully-detailed
// unlocked/locked-with-progress row from get_my_gamification, or the
// narrower unlocked-only shape from get_public_gamification for someone
// else's profile. Never fetches anything itself; owner-only actions
// (selecting a title) are only offered when `isSelf` and the achievement is
// actually unlocked.
export default function AchievementDetailModal({ achievement, open, onClose, isSelf, isSelected, onSelectTitle }) {
  const [busy, setBusy] = useState(false);
  const isUnlocked = Boolean(achievement?.unlockedAt);
  const isMystery = Boolean(achievement?.hidden) && !isUnlocked;

  async function handleSelect() {
    setBusy(true);
    try {
      await onSelectTitle(isSelected ? null : achievement.id);
    } catch (err) {
      console.error("Failed to update selected title", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {open && achievement && (
        <motion.div
          className="fixed inset-0 z-[65] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="flex w-full max-w-sm flex-col items-center gap-3 rounded-t-[28px] bg-[var(--color-surface)] px-6 py-7 text-center shadow-2xl sm:rounded-[28px]"
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <AchievementBadge achievement={achievement} size="lg" locked={!isUnlocked} animated />

            <div>
              <h2 className="text-lg font-black text-[var(--color-ink)]">
                {isMystery ? "???" : achievement.title}
              </h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                {isMystery ? "Gizli Başarım" : tierLabel(achievement.tier)}
              </p>
            </div>

            <p className="text-sm text-[var(--color-ink-soft)]">
              {isMystery ? "Bu başarımın detayları henüz gizli — kilidini açtığında ortaya çıkacak." : achievement.description}
            </p>

            {!isMystery && achievement.xpReward > 0 && (
              <p className="text-xs font-semibold text-[var(--color-saffron)]">+{achievement.xpReward} XP</p>
            )}

            {isUnlocked && (
              <p className="text-[11px] text-[var(--color-ink-soft)]">
                {dateFormatter.format(new Date(achievement.unlockedAt))} tarihinde kazanıldı
              </p>
            )}

            {isSelf && !isUnlocked && !isMystery && achievement.progress && (
              <div className="w-full">
                <ProgressLine progress={achievement.progress} />
              </div>
            )}

            {isSelf && isUnlocked && (
              <button
                onClick={handleSelect}
                disabled={busy}
                className={`mt-1 w-full rounded-full px-5 py-2.5 text-sm font-bold active:scale-95 disabled:opacity-50 ${
                  isSelected
                    ? "bg-[var(--color-cream)] text-[var(--color-ink)]"
                    : "bg-[var(--color-paprika)] text-[var(--color-cream)]"
                }`}
              >
                {isSelected ? "Profilden Kaldır" : "Profilde Göster"}
              </button>
            )}

            <button
              onClick={onClose}
              className="mt-1 text-xs font-semibold text-[var(--color-ink-soft)]"
            >
              Kapat
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
