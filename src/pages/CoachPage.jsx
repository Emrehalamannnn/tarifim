import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import recipes from "../data/recipes.json";
import { useAuth } from "../hooks/useAuth";
import { useCoachAccess } from "../hooks/useCoachAccess";
import { useAiCoach } from "../hooks/useAiCoach";
import { useAppStore, cartRecipeIdsFrom } from "../store/useAppStore";
import PageFade from "../components/PageFade";
import LoginPanel from "../components/LoginPanel";
import PremiumPaywall from "../components/PremiumPaywall";

const recipesById = new Map(recipes.map((r) => [r.id, r]));

const SUGGESTIONS = [
  "Bu hafta hangi tariflerim bana uygun?",
  "Sepetimdeki tariflerin kalorisi nasıl?",
];

// Three dots pulsing in sequence — replaces the old plain "Yazıyor…" text
// while a reply streams in from the AI coach.
function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-[var(--color-ink-soft)]"
          animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

export default function CoachPage() {
  const { user } = useAuth();
  const hasCoachAccess = useCoachAccess(user);
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

  if (!hasCoachAccess) {
    return (
      <PageFade className="flex flex-1 flex-col gap-6 px-5 py-5">
        <header>
          <h1 className="text-xl font-bold text-[var(--color-ink)]">Koç</h1>
          <p className="text-xs text-[var(--color-ink-soft)]">
            AI Koç, Tarifim Premium'un bir parçasıdır.
          </p>
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
      <header className="flex items-center gap-3 px-5 pb-3 pt-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-olive)] text-lg">
          🩺
        </span>
        <div>
          <h1 className="text-xl font-bold text-[var(--color-ink)]">Sağlık Koçun</h1>
          <p className="text-xs text-[var(--color-ink-soft)]">
            Sepetindeki tariflere ve tercihlerine göre tavsiye al. Mesajların ve beslenme tercihlerin,
            yanıt üretmek için yapay zeka sağlayıcımız Anthropic'e iletilir. Koç tıbbi tavsiye vermez.
          </p>
        </div>
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
                💡 {s}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2.5 py-2">
          {messages.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={`max-w-[80%] px-3.5 py-2.5 text-sm ${
                m.role === "user"
                  ? "ml-auto rounded-2xl rounded-br-md bg-[var(--color-paprika)] text-[var(--color-cream)]"
                  : "rounded-2xl rounded-bl-md bg-[var(--color-surface)] text-[var(--color-ink)] shadow-sm"
              }`}
            >
              {m.content}
              {m.truncated && (
                <p className="mt-1 text-[11px] italic text-[var(--color-ink-soft)]">
                  Yanıt yarıda kesildi, daha kısa bir soru olarak tekrar sorabilirsin.
                </p>
              )}
            </motion.div>
          ))}
          {sending && (
            <div className="w-fit rounded-2xl rounded-bl-md bg-[var(--color-surface)] px-3.5 shadow-sm">
              <TypingDots />
            </div>
          )}
          {error && <p className="text-xs text-[var(--color-tomato)]">{error}</p>}
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
