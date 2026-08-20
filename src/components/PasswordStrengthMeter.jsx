import { getPasswordStrength } from "../lib/passwordStrength";

const BAR_COLORS = [
  "bg-[var(--color-cream-dark)]",
  "bg-[var(--color-tomato)]",
  "bg-[var(--color-tomato)]",
  "bg-[var(--color-olive)]",
  "bg-[var(--color-olive)]",
];

// Four-segment strength bar + label, shown under the password field only in
// signup mode (LoginPanel) — reused as-is by the post-recovery "set a new
// password" form.
export default function PasswordStrengthMeter({ password }) {
  const { score, label, tooShort } = getPasswordStrength(password);
  if (!password) return null;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= score ? BAR_COLORS[score] : "bg-[var(--color-cream-dark)]"
            }`}
          />
        ))}
      </div>
      <p className={`text-[11px] ${tooShort ? "text-[var(--color-tomato)]" : "text-[var(--color-ink-soft)]"}`}>
        {tooShort ? "En az 8 karakter olmalı" : label}
      </p>
    </div>
  );
}
