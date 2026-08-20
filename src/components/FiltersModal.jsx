import { motion, AnimatePresence } from "framer-motion";
import { ALL_TAGS, tagLabel } from "../lib/tags";

const AUDIENCE_FILTERS = [
  { value: "all", label: "Tümü" },
  { value: "following", label: "Takip Ettiklerim" },
];

const SORT_OPTIONS = [
  { value: "recent", label: "En Yeni" },
  { value: "popular", label: "En Popüler" },
];

// Bottom-sheet home for the feed's audience/sort/category controls —
// collapsed out of SocialPage's header into one "Filtreler" button so the
// header has room for the messages entry point. Same modal chrome as
// CommentsModal/ShoppingListModal.
export default function FiltersModal({
  open,
  onClose,
  audienceFilter,
  setAudienceFilter,
  sort,
  setSort,
  tagFilter,
  setTagFilter,
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[55] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="flex max-h-[80vh] w-full max-w-sm flex-col overflow-hidden rounded-t-[28px] bg-[var(--color-surface)] shadow-2xl sm:rounded-[28px]"
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--color-cream-dark)] px-5 py-4">
              <h2 className="text-base font-bold text-[var(--color-ink)]">Filtreler</h2>
              <button
                onClick={onClose}
                aria-label="Kapat"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-cream)] text-sm active:scale-90"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                Kimden
              </p>
              <div className="flex gap-2">
                {AUDIENCE_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setAudienceFilter(f.value)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                      audienceFilter === f.value
                        ? "bg-[var(--color-ink)] text-[var(--color-cream)]"
                        : "bg-[var(--color-cream)] text-[var(--color-ink-soft)]"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                Sırala
              </p>
              <div className="flex w-fit gap-1 rounded-full bg-[var(--color-cream)] p-1">
                {SORT_OPTIONS.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setSort(s.value)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      sort === s.value
                        ? "bg-[var(--color-olive)] text-[var(--color-cream)]"
                        : "text-[var(--color-ink-soft)]"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-soft)]">
                Kategori
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setTagFilter(null)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    tagFilter === null
                      ? "bg-[var(--color-paprika)] text-[var(--color-cream)]"
                      : "bg-[var(--color-cream)] text-[var(--color-ink-soft)]"
                  }`}
                >
                  Tüm Kategoriler
                </button>
                {ALL_TAGS.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setTagFilter((prev) => (prev === tag ? null : tag))}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      tagFilter === tag
                        ? "bg-[var(--color-paprika)] text-[var(--color-cream)]"
                        : "bg-[var(--color-cream)] text-[var(--color-ink-soft)]"
                    }`}
                  >
                    {tagLabel(tag)}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-[var(--color-cream-dark)] px-5 py-4">
              <button
                onClick={onClose}
                className="w-full rounded-full bg-[var(--color-paprika)] px-5 py-3 text-sm font-bold text-[var(--color-cream)] shadow-sm active:scale-95"
              >
                Uygula
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
