import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useUserSearch } from "../hooks/useUserSearch";
import PageFade from "../components/PageFade";
import Avatar from "../components/Avatar";

// Instagram-style DM composer: search a username, tap a result, land on
// ConversationPage for that user (which creates the thread on first send —
// there's no separate "create conversation" step, see useDirectMessages).
export default function NewMessagePage() {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const { results, loading } = useUserSearch(query, user?.id);
  const navigate = useNavigate();

  return (
    <PageFade className="flex flex-1 flex-col gap-4 px-5 py-5">
      <header className="flex items-center gap-3">
        <Link to="/messages" aria-label="Mesajlara dön" className="text-lg">
          ←
        </Link>
        <h1 className="text-xl font-bold text-[var(--color-ink)]">Yeni Mesaj</h1>
      </header>

      <label htmlFor="user-search" className="sr-only">
        Kullanıcı adı ara
      </label>
      <input
        id="user-search"
        type="text"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Kullanıcı adı ara…"
        className="rounded-xl border border-[var(--color-cream-dark)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--color-paprika)]"
      />

      {loading && <p className="py-4 text-center text-sm text-[var(--color-ink-soft)]">Aranıyor…</p>}

      {!loading && query.trim().length >= 2 && results.length === 0 && (
        <p className="py-4 text-center text-sm text-[var(--color-ink-soft)]">Kullanıcı bulunamadı.</p>
      )}

      {!loading && query.trim().length > 0 && query.trim().length < 2 && (
        <p className="py-4 text-center text-xs text-[var(--color-ink-soft)]">En az 2 karakter yaz.</p>
      )}

      <ul className="flex flex-col gap-1">
        {results.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => navigate(`/messages/${r.id}`)}
              className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left active:bg-[var(--color-cream)]"
            >
              <Avatar name={r.name} avatarUrl={r.avatar_url} size="lg" className="text-base" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 truncate text-sm font-semibold text-[var(--color-ink)]">
                  {r.name}
                  {r.is_owner && <span title="Kurucu">👑</span>}
                  {!r.is_owner && r.is_verified && (
                    <span className="text-[var(--color-paprika)]" title="Onaylı">
                      ✓
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-[var(--color-ink-soft)]">@{r.username}</p>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </PageFade>
  );
}
