import { useMemo, useState } from "react";
import AchievementBadge from "./AchievementBadge";
import AchievementDetailModal from "./AchievementDetailModal";
import { FILTER_GROUPS, filterGroupFor } from "../lib/achievementRarity";

// Achievement gallery grid, shared by ProfilePage (own profile — unlocked
// full-color + locked muted-with-progress) and UserProfilePage (someone
// else's — unlocked only, no empty locked slots, no progress numbers at
// all). Which mode it's in is entirely driven by what `achievements` (the
// return value of useAchievements) actually contains: the public shape
// simply has an empty lockedAchievements array and isSelf=false, so this
// component never has to special-case "am I looking at myself" beyond that.
export default function AchievementGallery({ achievements }) {
  const {
    isSelf,
    unlockedAchievements,
    lockedAchievements,
    achievementCount,
    totalAchievementCount,
    selectedTitle,
    selectTitle,
  } = achievements;

  const [filter, setFilter] = useState("all");
  const [openAchievement, setOpenAchievement] = useState(null);

  const items = useMemo(() => {
    const unlocked = unlockedAchievements.map((a) => ({ ...a, locked: false }));
    const locked = lockedAchievements.map((a) => ({ ...a, locked: true }));
    const all = [...unlocked, ...locked];
    if (filter === "all") return all;
    return all.filter((a) => filterGroupFor(a.category) === filter);
  }, [unlockedAchievements, lockedAchievements, filter]);

  if (unlockedAchievements.length === 0 && lockedAchievements.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">Başarımlar</h2>
        <p className="text-xs font-semibold text-[var(--color-ink-soft)]">
          {achievementCount}
          {isSelf && totalAchievementCount ? ` / ${totalAchievementCount}` : ""}
        </p>
      </div>

      {isSelf && (
        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
          {FILTER_GROUPS.map((group) => (
            <button
              key={group.key}
              onClick={() => setFilter(group.key)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                filter === group.key
                  ? "bg-[var(--color-paprika)] text-[var(--color-cream)]"
                  : "bg-[var(--color-cream)] text-[var(--color-ink-soft)]"
              }`}
            >
              {group.label}
            </button>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-xs text-[var(--color-ink-soft)]">Bu kategoride henüz başarım yok.</p>
      ) : (
        <div className="grid grid-cols-4 gap-3 rounded-2xl bg-[var(--color-surface)] p-4 shadow-sm">
          {items.map((a) => (
            <button key={a.id} onClick={() => setOpenAchievement(a)} className="flex justify-center active:scale-90">
              <AchievementBadge achievement={a} size="md" locked={a.locked} />
            </button>
          ))}
        </div>
      )}

      <AchievementDetailModal
        achievement={openAchievement}
        open={openAchievement !== null}
        onClose={() => setOpenAchievement(null)}
        isSelf={isSelf}
        isSelected={Boolean(openAchievement) && selectedTitle?.id === openAchievement.id}
        onSelectTitle={selectTitle}
      />
    </section>
  );
}
