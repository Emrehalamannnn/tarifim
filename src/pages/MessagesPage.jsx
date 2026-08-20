import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useConversations } from "../hooks/useDirectMessages";
import PageFade from "../components/PageFade";
import Avatar from "../components/Avatar";
import EmptyState from "../components/EmptyState";
import LoginPanel from "../components/LoginPanel";

const dateFormatter = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" });

export default function MessagesPage() {
  const { user } = useAuth();
  const { conversations, loading } = useConversations(user?.id);

  return (
    <PageFade className="flex flex-1 flex-col gap-4 px-5 py-5">
      <header className="flex items-start justify-between">
        <div>
          <Link to="/profile" className="text-xs font-semibold text-[var(--color-ink-soft)]">
            ← Profil
          </Link>
          <h1 className="mt-1 text-xl font-bold text-[var(--color-ink)]">Mesajlar</h1>
        </div>
        {user && (
          <Link
            to="/messages/new"
            aria-label="Yeni Mesaj"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-paprika)] text-lg font-bold text-[var(--color-cream)] shadow-sm active:scale-95"
          >
            +
          </Link>
        )}
      </header>

      {!user ? (
        <LoginPanel />
      ) : loading ? (
        <p className="py-8 text-center text-sm text-[var(--color-ink-soft)]">Yükleniyor…</p>
      ) : conversations.length === 0 ? (
        <EmptyState
          emoji="💬"
          title="Henüz mesajın yok"
          description="Bir kullanıcının profiline gidip 'Mesaj Gönder' ile başlayabilirsin."
        />
      ) : (
        <ul className="flex flex-col gap-1">
          {conversations.map((c) => (
            <Link
              key={c.userId}
              to={`/messages/${c.userId}`}
              className="flex items-center gap-3 rounded-2xl px-2 py-2.5 active:bg-[var(--color-cream)]"
            >
              <Avatar name={c.name} avatarUrl={c.avatarUrl} size="lg" className="text-base" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--color-ink)]">{c.name}</p>
                <p className="truncate text-xs text-[var(--color-ink-soft)]">
                  {c.lastMessageFromMe ? "Sen: " : ""}
                  {c.lastMessage}
                </p>
              </div>
              <span className="shrink-0 text-[11px] text-[var(--color-ink-soft)]">
                {dateFormatter.format(new Date(c.lastMessageAt))}
              </span>
            </Link>
          ))}
        </ul>
      )}
    </PageFade>
  );
}
