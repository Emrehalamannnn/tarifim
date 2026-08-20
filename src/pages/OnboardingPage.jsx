import { useState } from "react";
import { useNavigate } from "react-router-dom";
import chains from "../data/chains.json";
import { useAppStore } from "../store/useAppStore";
import ChainBadge from "../components/ChainBadge";
import PageFade from "../components/PageFade";

export default function OnboardingPage() {
  const navigate = useNavigate();
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const [selected, setSelected] = useState(chains.map((c) => c.id));

  function toggle(chainId) {
    setSelected((prev) =>
      prev.includes(chainId) ? prev.filter((id) => id !== chainId) : [...prev, chainId]
    );
  }

  function handleStart() {
    completeOnboarding(selected);
    navigate("/", { replace: true });
  }

  return (
    <PageFade className="flex flex-1 flex-col justify-between px-6 py-8">
      <div>
        <p className="text-sm font-semibold text-[var(--color-paprika)]">Hoş geldin 👋</p>
        <h1 className="mt-1 text-2xl font-black text-[var(--color-ink)]">
          Hangi marketlerden alışveriş yapıyorsun?
        </h1>
        <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
          Seçtiğin marketleri fiyat karşılaştırmalarında göstereceğiz. Bunu istediğin zaman
          Profil sekmesinden değiştirebilirsin.
        </p>

        <div className="mt-6 flex flex-wrap gap-2.5">
          {chains.map((chain) => {
            const isSelected = selected.includes(chain.id);
            return (
              <button
                key={chain.id}
                onClick={() => toggle(chain.id)}
                className={`rounded-2xl border-2 px-1 py-1 transition-transform active:scale-95 ${
                  isSelected ? "border-[var(--color-olive)]" : "border-transparent opacity-40"
                }`}
              >
                <ChainBadge chain={chain} className="px-3.5 py-1.5 text-sm" />
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-center text-xs text-[var(--color-ink-soft)]">
          {selected.length} market seçildi
        </p>
        <button
          onClick={handleStart}
          disabled={selected.length === 0}
          className="rounded-full bg-[var(--color-paprika)] px-5 py-3 text-sm font-bold text-[var(--color-cream)] shadow-sm active:scale-95 disabled:opacity-40"
        >
          Tarifleri Keşfetmeye Başla
        </button>
      </div>
    </PageFade>
  );
}
