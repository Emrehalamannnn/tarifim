import { motion, AnimatePresence } from "framer-motion";

export default function ConfirmDialog({ open, title, description, confirmLabel, onConfirm, onCancel }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-5 backdrop-blur-sm sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onCancel}
        >
          <motion.div
            className="w-full max-w-sm rounded-[24px] bg-[var(--color-surface)] p-5 shadow-2xl"
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-bold text-[var(--color-ink)]">{title}</h2>
            {description && (
              <p className="mt-1.5 text-sm text-[var(--color-ink-soft)]">{description}</p>
            )}
            <div className="mt-5 flex gap-2.5">
              <button
                onClick={onCancel}
                className="flex-1 rounded-full bg-[var(--color-cream)] px-4 py-2.5 text-sm font-semibold text-[var(--color-ink)] active:scale-95"
              >
                Vazgeç
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 rounded-full bg-[var(--color-tomato)] px-4 py-2.5 text-sm font-semibold text-[var(--color-cream)] active:scale-95"
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
