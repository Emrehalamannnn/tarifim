export default function EmptyState({ emoji, title, description, action }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 py-16 text-center">
      <span className="text-6xl">{emoji}</span>
      <h2 className="text-lg font-semibold text-[var(--color-ink)]">{title}</h2>
      <p className="max-w-xs text-sm text-[var(--color-ink-soft)]">{description}</p>
      {action}
    </div>
  );
}
