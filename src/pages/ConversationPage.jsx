import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useProfile } from "../hooks/useProfile";
import { useConversation } from "../hooks/useDirectMessages";
import PageFade from "../components/PageFade";
import Avatar from "../components/Avatar";

const timeFormatter = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" });

export default function ConversationPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { profile: otherProfile, loading: profileLoading } = useProfile(id);
  const { messages, loading, sendMessage } = useConversation(user?.id, id);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!body.trim() || !user) return;
    setSending(true);
    try {
      await sendMessage(body.trim());
      setBody("");
    } finally {
      setSending(false);
    }
  }

  return (
    <PageFade className="flex flex-1 flex-col">
      <header className="flex items-center gap-2.5 border-b border-[var(--color-cream-dark)] px-5 py-4">
        <Link to="/messages" aria-label="Mesajlara dön" className="text-lg">
          ←
        </Link>
        {!profileLoading && otherProfile && (
          <Link to={`/user/${id}`} className="flex items-center gap-2.5">
            <Avatar name={otherProfile.name} avatarUrl={otherProfile.avatar_url} />
            <span className="text-sm font-bold text-[var(--color-ink)]">{otherProfile.name}</span>
          </Link>
        )}
      </header>

      <div ref={listRef} className="flex-1 overflow-y-auto px-5 py-4">
        {loading ? (
          <p className="py-8 text-center text-sm text-[var(--color-ink-soft)]">Yükleniyor…</p>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--color-ink-soft)]">
            Henüz mesaj yok. İlk mesajı sen yaz!
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {messages.map((m) => {
              const fromMe = m.senderId === user?.id;
              return (
                <li key={m.id} className={`flex ${fromMe ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
                      fromMe
                        ? "bg-[var(--color-paprika)] text-[var(--color-cream)]"
                        : "bg-[var(--color-cream)] text-[var(--color-ink)]"
                    }`}
                  >
                    <p>{m.body}</p>
                    <span
                      className={`mt-0.5 block text-[10px] ${
                        fromMe ? "text-[var(--color-cream)]/70" : "text-[var(--color-ink-soft)]"
                      }`}
                    >
                      {timeFormatter.format(new Date(m.createdAt))}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {user && (
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 border-t border-[var(--color-cream-dark)] px-4 py-3"
        >
          <input
            type="text"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Mesaj yaz…"
            maxLength={2000}
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
      )}
    </PageFade>
  );
}
