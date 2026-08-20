import { useEffect, useMemo, useRef, useState } from "react";
import recipes from "../data/recipes.json";
import { useAuth } from "../hooks/useAuth";
import { useSubscription } from "../hooks/useSubscription";
import { useAiCoach } from "../hooks/useAiCoach";
import { useAppStore, cartRecipeIdsFrom } from "../store/useAppStore";
import PageFade from "../components/PageFade";
import PremiumPaywall from "../components/PremiumPaywall";
import LoginPanel from "../components/LoginPanel";

const recipesById = new Map(recipes.map((r) => [r.id, r]));

const SUGGESTIONS = [
  "Bu hafta hangi tariflerim bana uygun?",
  "Sepetimdeki tariflerin kalorisi nasıl?",
];

export default function CoachPage() {
  const { user } = useAuth();
  const { isPremium, loading: subLoading } = useSubscription(user?.id);
  const dietaryFilter = useAppStore((s) => s.dietaryFilter);
  const decisions = useAppStore((s) => s.decisions);
  const cartRecipeNames = useMemo(() => {
    return cartRecipeIdsFrom(decisions)
      .map((id) => recipesById.get(id)?.name)
      .filter(Boolean);
  }, [decisions]);

  const context = useMemo(
    () => ({ dietaryFilter, cartRecipeNames }),
    [dietaryFilter, cartRecipeNames]
  );
  const { messages, sending, error, sendMessage } = useAiCoach(context);
  const [input, setInput] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  if (!user) {
    return (
      <PageFade className="flex flex-1 flex-col gap-6 px-5 py-5">
        <header>
          <h1 className="text-xl font-bold text-[var(--color-ink)]">Koç</h1>
          <p className="text-xs text-[var(--color-ink-soft)]">
            Sağlık koçuna erişmek için giriş yap.
          </p>
        </header>
        <LoginPanel />
      </PageFade>
    );
  }

  if (subLoading) {
    return (
      <PageFade className="flex flex-1 items-center justify-center">
        <p className="text-sm text-[var(--color-ink-soft)]">Yükleniyor…</p>
      </PageFade>
    );
  }

  if (!isPremium || error === "premium_required") {
    return (
      <PageFade className="flex flex-1 flex-col gap-4 px-5 py-5">
        <header>
          <h1 className="text-xl font-bold text-[var(--color-ink)]">Koç</h1>
        </header>
        <PremiumPaywall userId={user.id} />
      </PageFade>
    );
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!input.trim() || sending) return;
    sendMessage(input.trim());
    setInput("");
  }

  return (
    <PageFade className="flex flex-1 flex-col">
      <header className="px-5 pb-2 pt-5">
        <h1 className="text-xl font-bold text-[var(--color-ink)]">Sağlık Koçun</h1>
        <p className="text-xs text-[var(--color-ink-soft)]">
          Sepetindeki tariflere ve tercihlerine göre tavsiye al.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-2">
        {messages.length === 0 && (
          <div className="flex flex-col gap-2 py-4">
            <p className="text-xs text-[var(--color-ink-soft)]">Örnek sorular:</p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setInput(s)}
                className="w-fit rounded-full bg-[var(--color-surface)] px-3.5 py-2 text-left text-xs text-[var(--color-ink)] shadow-sm active:scale-95"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2.5 py-2">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${
                m.role === "user"
                  ? "ml-auto bg-[var(--color-paprika)] text-[var(--color-cream)]"
                  : "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-sm"
              }`}
            >
              {m.content}
            </div>
          ))}
          {sending && (
            <div className="max-w-[80%] rounded-2xl bg-[var(--color-surface)] px-3.5 py-2.5 text-sm text-[var(--color-ink-soft)] shadow-sm">
              Yazıyor…
            </div>
          )}
          {error && error !== "premium_required" && (
            <p className="text-xs text-[var(--color-tomato)]">{error}</p>
          )}
        </div>
        <div ref={scrollRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t border-[var(--color-cream-dark)] px-4 py-3"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Bir soru sor…"
          disabled={sending}
          className="flex-1 rounded-full border border-[var(--color-cream-dark)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--color-paprika)] disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!input.trim() || sending}
          className="rounded-full bg-[var(--color-paprika)] px-4 py-2.5 text-sm font-bold text-[var(--color-cream)] active:scale-95 disabled:opacity-40"
        >
          Gönder
        </button>
      </form>
    </PageFade>
  );
}
