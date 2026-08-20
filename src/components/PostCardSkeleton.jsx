// Placeholder shaped like PostCard, shown while useCommunityFeed's first
// fetch is in flight so the feed never paints a blank page — can't remove
// the real network round-trip, but removes the "did anything happen?" gap.
export default function PostCardSkeleton() {
  return (
    <li className="overflow-hidden rounded-2xl bg-[var(--color-surface)] shadow-sm">
      <div className="flex items-center gap-2.5 px-4 pt-3.5">
        <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-[var(--color-cream)]" />
        <div className="flex-1">
          <div className="h-3 w-28 animate-pulse rounded-full bg-[var(--color-cream)]" />
          <div className="mt-1.5 h-2.5 w-16 animate-pulse rounded-full bg-[var(--color-cream)]" />
        </div>
      </div>
      <div className="mt-3 aspect-[4/5] w-full animate-pulse bg-[var(--color-cream)]" />
      <div className="flex flex-col gap-2 px-4 py-3.5">
        <div className="flex gap-4">
          <div className="h-4 w-8 animate-pulse rounded-full bg-[var(--color-cream)]" />
          <div className="h-4 w-8 animate-pulse rounded-full bg-[var(--color-cream)]" />
          <div className="h-4 w-8 animate-pulse rounded-full bg-[var(--color-cream)]" />
        </div>
        <div className="h-3.5 w-2/3 animate-pulse rounded-full bg-[var(--color-cream)]" />
        <div className="h-3 w-1/2 animate-pulse rounded-full bg-[var(--color-cream)]" />
      </div>
    </li>
  );
}
