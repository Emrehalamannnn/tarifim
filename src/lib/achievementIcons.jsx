// Hand-rolled inline SVG icon set for achievement badges, keyed by
// achievement_definitions.icon_key (see supabase/schema.sql's gamification
// seed data). Tarifim has no icon library dependency (PostCard's bookmark
// button is the same hand-rolled stroke-SVG style this follows) — adding
// one just for ~17 badge glyphs isn't worth a new dependency, so these are
// small, single-purpose line icons in the same visual language.
//
// Every icon uses `currentColor` for both stroke and any fill, so the
// rarity frame (see achievementRarity.js) controls the actual color by
// setting `color` on a wrapping element — the icon itself carries no color
// opinion.

const ICONS = {
  recipe: (
    <>
      <path d="M6 3v6a3 3 0 0 0 6 0V3" />
      <path d="M9 9v12" />
      <path d="M17 3c-1.5 1.5-2 3-2 5s1 3 2 3 2-1 2-3-.5-3.5-2-5Z" />
      <path d="M17 11v10" />
    </>
  ),
  protein: (
    <>
      <path d="M4 9v6" />
      <path d="M2 8v8" />
      <path d="M20 9v6" />
      <path d="M22 8v8" />
      <path d="M6 12h12" />
      <path d="M6 9v6M18 9v6" />
    </>
  ),
  vegetarian: (
    <>
      <path d="M12 22v-9" />
      <path d="M12 13c0-4-3-6-7-6 0 4 3 6 7 6Z" />
      <path d="M12 13c0-4 3-6 7-6 0 4-3 6-7 6Z" />
    </>
  ),
  vegan: <path d="M12 21c7-2 9-8 9-15-7 0-13 3-15 9-1 3 0 5 2 6 3 1 6-1 6-4 0-4 2-8 6-9" />,
  breakfast: (
    <>
      <circle cx="12" cy="13" r="7" />
      <circle cx="12" cy="13" r="2.5" />
      <path d="M7 4h10" />
    </>
  ),
  dessert: (
    <>
      <path d="M4 21h16" />
      <path d="M6 21v-7a6 6 0 0 1 12 0v7" />
      <path d="M9 8c0-1.5 1-2 1-3.5S9 2 9 2M15 8c0-1.5 1-2 1-3.5S15 2 15 2" />
    </>
  ),
  likes: <path d="M12 21s-7.5-4.6-10.2-9.3C.2 8.6 1.7 5 5.3 5c2 0 3.4 1 4.7 2.7C11.3 6 12.7 5 14.7 5c3.6 0 5.1 3.6 3.5 6.7C19.5 16.4 12 21 12 21Z" />,
  viral: <path d="M12 2c1 3-2 4-2 7a4 4 0 0 0 8 0c0-1-.3-2-1-3 1 0 3 2 3 6a8 8 0 0 1-16 0c0-5 3-7 4-8 0 2 .5 3 1.5 3S12 5 12 2Z" />,
  comments: <path d="M21 12a8 8 0 0 1-11.5 7.2L3 21l1.9-5.6A8 8 0 1 1 21 12Z" />,
  followers: (
    <>
      <circle cx="8.5" cy="8" r="3.2" />
      <path d="M2.5 20c0-3.5 2.7-6 6-6s6 2.5 6 6" />
      <path d="M16 4.5c1.7.3 3 1.8 3 3.5s-1.3 3.2-3 3.5" />
      <path d="M18.5 14.2c2 .6 3.2 2.4 3.2 5.8" />
    </>
  ),
  social: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6" />
      <path d="M18 8v6M15 11h6" />
    </>
  ),
  saves: <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-5-7 5V4a1 1 0 0 1 1-1Z" />,
  collection: (
    <>
      <rect x="3" y="16" width="18" height="4" rx="1" />
      <rect x="5" y="10" width="14" height="4" rx="1" />
      <rect x="7" y="4" width="10" height="4" rx="1" />
    </>
  ),
  variety: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.5 4 5.5 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.5-4-9s1.5-6.5 4-9Z" />
    </>
  ),
  consistency: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 3v4M16 3v4" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" />
    </>
  ),
  xp: <path d="M12 2l2.9 6.5 7.1.7-5.4 4.7 1.6 7-6.2-3.8-6.2 3.8 1.6-7-5.4-4.7 7.1-.7Z" />,
  special: (
    <>
      <path d="M7 4h10v4a5 5 0 0 1-10 0Z" />
      <path d="M7 5H4a3 3 0 0 0 3 5M17 5h3a3 3 0 0 1-3 5" />
      <path d="M12 13v4" />
      <path d="M8 21h8" />
      <path d="M9 17h6l1 4H8Z" />
    </>
  ),
};

export default function AchievementIcon({ iconKey, className = "" }) {
  const shape = ICONS[iconKey] ?? ICONS.special;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {shape}
    </svg>
  );
}
