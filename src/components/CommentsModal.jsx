import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePostComments } from "../hooks/usePostComments";
import { initialsFrom } from "../lib/mockSocial";

const dateFormatter = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" });

export default function CommentsModal({ postId, currentUserId, open, onClose }) {
  const { comments, loading, addComment, deleteComment } = usePostComments(open ? postId : null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!body.trim() || !currentUserId) return;
    setSending(true);
    try {
      await addComment(currentUserId, body.trim());
      setBody("");
    } finally {
      setSending(false);
    }
  }

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
            className="flex max-h-[85vh] w-full max-w-sm flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px]"
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--color-cream-dark)] px-5 py-4">
              <h2 className="text-base font-bold text-[var(--color-ink)]">Yorumlar</h2>
              <button
                onClick={onClose}
                aria-label="Kapat"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-cream)] text-sm active:scale-90"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {loading ? (
                <p className="py-8 text-center text-sm text-[var(--color-ink-soft)]">Yükleniyor…</p>
              ) : comments.length === 0 ? (
                <p className="py-8 text-center text-sm text-[var(--color-ink-soft)]">
                  Henüz yorum yok. İlk yorumu sen yap!
                </p>
              ) : (
                <ul className="flex flex-col gap-3.5">
                  {comments.map((c) => (
                    <li key={c.id} className="flex items-start gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-olive)] text-[10px] font-bold text-white">
                        {initialsFrom(c.author) || "🧑‍🍳"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-[var(--color-ink)]">
                          <span className="font-semibold">{c.author}</span> {c.body}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[var(--color-ink-soft)]">
                          {dateFormatter.format(new Date(c.createdAt))}
                        </p>
                      </div>
                      {c.authorId === currentUserId && (
                        <button
                          onClick={() => deleteComment(c.id)}
                          aria-label="Yorumu sil"
                          className="shrink-0 text-xs text-[var(--color-tomato)]"
                        >
                          Sil
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {currentUserId && (
              <form
                onSubmit={handleSubmit}
                className="flex items-center gap-2 border-t border-[var(--color-cream-dark)] px-4 py-3"
              >
                <input
                  type="text"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Yorum ekle…"
                  className="flex-1 rounded-full border border-[var(--color-cream-dark)] px-3.5 py-2 text-sm outline-none focus:border-[var(--color-paprika)]"
                />
                <button
                  type="submit"
                  disabled={!body.trim() || sending}
                  className="rounded-full bg-[var(--color-paprika)] px-4 py-2 text-sm font-bold text-white active:scale-95 disabled:opacity-40"
                >
                  Gönder
                </button>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
