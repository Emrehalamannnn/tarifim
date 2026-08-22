// Level / rank / XP progress / selected title, shown near profile identity
// on both own and public profiles. `achievements` is whatever
// useAchievements(profileId, currentUserId) returned — the XP bar only
// renders when isSelf (public callers get xp/progressPercent/nextLevelXp as
// null, by design, see useAchievements).
export default function GamificationHeader({ achievements }) {
  const { isSelf, level, rankName, xp, progressPercent, nextLevelXp, selectedTitle } = achievements;

  if (level === null) return null;

  return (
    <div className="flex flex-col items-center gap-1">
      <p className="text-sm font-black text-[var(--color-ink)]">Seviye {level}</p>
      <p className="text-xs font-semibold text-[var(--color-paprika)]">{rankName}</p>

      {isSelf && (
        <div className="mt-1 w-full max-w-[220px]">
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-cream)]">
            <div
              className="h-full rounded-full bg-[var(--color-olive)] transition-[width] duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="mt-1 text-center text-[10px] text-[var(--color-ink-soft)]">
            {xp.toLocaleString("tr-TR")} / {nextLevelXp.toLocaleString("tr-TR")} XP
          </p>
        </div>
      )}

      {selectedTitle && (
        <p className="mt-0.5 text-xs font-bold text-[var(--color-olive)]">{selectedTitle.title}</p>
      )}
    </div>
  );
}
