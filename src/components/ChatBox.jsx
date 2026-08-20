import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useCommunityChat } from "../hooks/useCommunityChat";
import Avatar from "./Avatar";

const timeFormatter = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" });

export default function ChatBox({ currentUserId, open, onClose }) {
  const { messages, loading, sendMessage } = useCommunityChat(open);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!body.trim() || !currentUserId) return;
    setSending(true);
    try {
      await sendMessage(currentUserId, body.trim());
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
            className="flex h-[80vh] w-full max-w-sm flex-col overflow-hidden rounded-t-[28px] bg-[var(--color-surface)] shadow-2xl sm:h-[70vh] sm:rounded-[28px]"
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--color-cream-dark)] px-5 py-4">
              <h2 className="text-base font-bold text-[var(--color-ink)]">💬 Topluluk Sohbeti</h2>
              <button
                onClick={onClose}
                aria-label="Kapat"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-cream)] text-sm active:scale-90"
              >
                ✕
              </button>
            </div>

            <div ref={listRef} className="flex-1 overflow-y-auto px-5 py-4">
              {loading ? (
                <p className="py-8 text-center text-sm text-[var(--color-ink-soft)]">Yükleniyor…</p>
              ) : messages.length === 0 ? (
                <p className="py-8 text-center text-sm text-[var(--color-ink-soft)]">
                  Henüz mesaj yok. İlk mesajı sen yaz!
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {messages.map((m) => (
                    <li key={m.id} className="flex items-start gap-2.5">
                      <Link to={`/user/${m.userId}`} className="shrink-0">
                        <Avatar name={m.author} avatarUrl={m.authorAvatarUrl} size="sm" />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-[var(--color-ink)]">
                          <Link to={`/user/${m.userId}`} className="font-semibold">
                            {m.author}
                          </Link>{" "}
                          {m.body}
                        </p>
                        <span className="text-[11px] text-[var(--color-ink-soft)]">
                          {timeFormatter.format(new Date(m.createdAt))}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {currentUserId ? (
              <form
                onSubmit={handleSubmit}
                className="flex items-center gap-2 border-t border-[var(--color-cream-dark)] px-4 py-3"
              >
                <input
                  type="text"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Mesaj yaz…"
                  maxLength={500}
                  className="flex-1 rounded-full border border-[var(--color-cream-dark)] px-3.5 py-2 text-sm outline-none focus:border-[var(--color-paprika)]"
                />
                <button
                  type="submit"
                  disabled={!body.trim() || sending}
                  className="rounded-full bg-[var(--color-paprika)] px-4 py-2 text-sm font-bold text-[var(--color-cream)] active:scale-95 disabled:opacity-40"
                >
                  Gönder
                </button>
              </form>
            ) : (
              <div className="border-t border-[var(--color-cream-dark)] px-5 py-4 text-center">
                <Link
                  to="/profile"
                  onClick={onClose}
                  className="text-sm font-semibold text-[var(--color-paprika)]"
                >
                  Sohbet etmek için giriş yap
                </Link>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
