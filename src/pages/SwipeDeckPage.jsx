import SwipeDeck from "../components/SwipeDeck";
import PageFade from "../components/PageFade";

export default function SwipeDeckPage() {
  return (
    <PageFade>
      <header className="flex items-center justify-between px-5 pb-1 pt-5">
        <h1 className="text-2xl font-black text-[var(--color-paprika)]">Tarifim</h1>
        <span className="text-xs font-medium text-[var(--color-ink-soft)]">Bugün ne pişirsem?</span>
      </header>
      <SwipeDeck />
    </PageFade>
  );
}
