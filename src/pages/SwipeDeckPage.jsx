import SwipeDeck from "../components/SwipeDeck";
import PageFade from "../components/PageFade";

export default function SwipeDeckPage() {
  return (
    // Overrides PageFade's default (overflow: visible) for this page only.
    // Every other page relies on that default so its content can grow past
    // one screen and scroll inside App.jsx's shared overflow-y-auto route
    // container. Discover must never do that -- with overflow: visible, this
    // page's own content becomes the thing that overflows and makes that
    // container internally draggable, which reads as the whole UI moving.
    // min-h-0 pairs with flex-1 so this element shrinks to the space its
    // flex parent actually gives it (the real viewport height, safe areas
    // and bottom nav already subtracted) instead of growing to fit content.
    <PageFade className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex items-center justify-between px-5 pb-1 pt-5">
        <h1 className="text-2xl font-black text-[var(--color-paprika)]">Tarifim</h1>
        <span className="text-xs font-medium text-[var(--color-ink-soft)]">Bugün ne pişirsem?</span>
      </header>
      <SwipeDeck />
    </PageFade>
  );
}
