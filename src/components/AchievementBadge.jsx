import AchievementIcon from "../lib/achievementIcons.jsx";
import { tierGradient, tierGlow, tierLabel } from "../lib/achievementRarity";

const SIZE_CONFIG = {
  sm: { badge: "h-9 w-9", icon: "h-4 w-4", ring: "ring-2" },
  md: { badge: "h-14 w-14", icon: "h-6 w-6", ring: "ring-[3px]" },
  lg: { badge: "h-24 w-24", icon: "h-10 w-10", ring: "ring-4" },
};

// Reusable badge: category icon + rarity frame + optional legendary shimmer,
// used everywhere an achievement shows up (galleries, detail modal, unlock
// toast, selected-title chip). Deliberately not one bitmap per achievement —
// see src/lib/achievementIcons.jsx / achievementRarity.js for the underlying
// icon set + tier gradients this composes.
//
// `locked` renders a muted/desaturated frame with a small lock glyph and,
// for a still-secret hidden achievement, a "?" instead of its real icon —
// the caller is responsible for never passing a hidden+locked achievement's
// real title/icon down in the first place (see get_my_gamification's own
// redaction), this component just never assumes an icon/title is present.
export default function AchievementBadge({ achievement, size = "md", locked = false, showTier = false, animated = false }) {
  const cfg = SIZE_CONFIG[size] ?? SIZE_CONFIG.md;
  const isMystery = Boolean(achievement?.hidden) && locked;
  const tier = achievement?.tier ?? "bronze";
  const isLegendary = tier === "legendary" && !locked;

  const frameStyle = isMystery
    ? { background: "linear-gradient(135deg, var(--color-cream-dark), var(--color-ink-soft))" }
    : {
        background: tierGradient(tier),
        boxShadow: locked ? "none" : `0 0 14px ${tierGlow(tier)}`,
      };

  return (
    <div className="inline-flex flex-col items-center gap-1" title={isMystery ? "???" : achievement?.title}>
      <div
        className={`relative flex shrink-0 items-center justify-center rounded-full ring-[var(--color-surface)] ${cfg.badge} ${cfg.ring} ${
          locked && !isMystery ? "opacity-45 grayscale" : ""
        } ${animated && isLegendary ? "achievement-legendary-shimmer" : ""}`}
        style={frameStyle}
      >
        {isMystery ? (
          <span className="font-black text-[var(--color-surface)]" style={{ fontSize: size === "lg" ? 28 : size === "sm" ? 12 : 18 }}>
            ?
          </span>
        ) : (
          <AchievementIcon iconKey={achievement?.iconKey} className={`${cfg.icon} text-[var(--color-surface)]`} />
        )}

        {locked && !isMystery && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-ink)] text-[8px] text-[var(--color-cream)] ring-2 ring-[var(--color-surface)]">
            🔒
          </span>
        )}
      </div>

      {showTier && (
        <span className="text-[9px] font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
          {isMystery ? "???" : tierLabel(achievement?.tier)}
        </span>
      )}
    </div>
  );
}
