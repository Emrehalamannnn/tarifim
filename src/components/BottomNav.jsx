import { NavLink } from "react-router-dom";

const TABS = [
  { to: "/", label: "Topluluk", emoji: "📸", end: true },
  { to: "/kesfet", label: "Keşfet", emoji: "🔥" },
  { to: "/cart", label: "Sepetim", emoji: "🛒" },
  { to: "/coach", label: "Koç", emoji: "🩺" },
  { to: "/profile", label: "Profil", emoji: "🧑‍🍳" },
];

export default function BottomNav() {
  return (
    <nav
      className="sticky bottom-0 z-10 flex border-t border-[var(--color-cream-dark)] bg-[var(--color-cream)]/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
              isActive ? "text-[var(--color-paprika)]" : "text-[var(--color-ink-soft)]"
            }`
          }
        >
          <span className="text-xl leading-none">{tab.emoji}</span>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
