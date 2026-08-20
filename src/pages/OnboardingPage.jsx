import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import chains from "../data/chains.json";
import { useAppStore } from "../store/useAppStore";
import { useAuth } from "../hooks/useAuth";
import ChainBadge from "../components/ChainBadge";
import LoginPanel from "../components/LoginPanel";
import PageFade from "../components/PageFade";

const DIETARY_OPTIONS = [
  { value: null, label: "Hepsi", emoji: "🍽️" },
  { value: "vegetarian", label: "Vejetaryen", emoji: "🥦" },
  { value: "vegan", label: "Vegan", emoji: "🌱" },
  { value: "budget-friendly", label: "Ekonomik", emoji: "💸" },
];

function StepDots({ step }) {
  return (
    <div className="flex justify-center gap-1.5">
      {[1, 2, 3, 4].map((n) => (
        <span
          key={n}
          className={`h-1.5 rounded-full transition-all ${
            n === step ? "w-6 bg-[var(--color-paprika)]" : "w-1.5 bg-[var(--color-cream-dark)]"
          }`}
        />
      ))}
    </div>
  );
}

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const setDietaryFilter = useAppStore((s) => s.setDietaryFilter);
  const [step, setStep] = useState(1);
  const [selectedChains, setSelectedChains] = useState(chains.map((c) => c.id));

  // Once step 2's login succeeds (useAuth's session subscription flips
  // `user` truthy), move straight on to preferences — no separate
  // "continue" button needed for this step.
  useEffect(() => {
    if (step === 2 && user) setStep(3);
  }, [step, user]);

  function toggleChain(chainId) {
    setSelectedChains((prev) =>
      prev.includes(chainId) ? prev.filter((id) => id !== chainId) : [...prev, chainId]
    );
  }

  function handleFinish() {
    completeOnboarding(selectedChains);
    navigate("/", { replace: true });
  }

  return (
    <PageFade className="flex flex-1 flex-col justify-between px-6 py-8">
      <div className="mb-4">
        <StepDots step={step} />
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex flex-1 flex-col"
          >
            <p className="text-sm font-semibold text-[var(--color-paprika)]">Hoş geldin 👋</p>
            <h1 className="mt-1 text-2xl font-black text-[var(--color-ink)]">
              Hangi marketlerden alışveriş yapıyorsun?
            </h1>
            <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
              Seçtiğin marketleri fiyat karşılaştırmalarında göstereceğiz. Bunu istediğin zaman
              Ayarlar sekmesinden değiştirebilirsin.
            </p>

            <div className="mt-6 flex flex-wrap gap-2.5">
              {chains.map((chain) => {
                const isSelected = selectedChains.includes(chain.id);
                return (
                  <button
                    key={chain.id}
                    onClick={() => toggleChain(chain.id)}
                    className={`rounded-2xl border-2 px-1 py-1 transition-transform active:scale-95 ${
                      isSelected ? "border-[var(--color-olive)]" : "border-transparent opacity-40"
                    }`}
                  >
                    <ChainBadge chain={chain} className="px-3.5 py-1.5 text-sm" />
                  </button>
                );
              })}
            </div>

            <div className="mt-auto flex flex-col gap-2 pt-8">
              <p className="text-center text-xs text-[var(--color-ink-soft)]">
                {selectedChains.length} market seçildi
              </p>
              <button
                onClick={() => setStep(2)}
                disabled={selectedChains.length === 0}
                className="rounded-full bg-[var(--color-paprika)] px-5 py-3 text-sm font-bold text-[var(--color-cream)] shadow-sm active:scale-95 disabled:opacity-40"
              >
                Devam Et
              </button>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex flex-1 flex-col justify-center gap-4"
          >
            <div className="text-center">
              <p className="text-sm font-semibold text-[var(--color-paprika)]">Neredeyse hazır</p>
              <h1 className="mt-1 text-2xl font-black text-[var(--color-ink)]">Hesabını oluştur</h1>
              <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
                Paylaşımlarını, takipçilerini ve favorilerini kaydedebilmemiz için bir hesaba
                ihtiyacın var.
              </p>
            </div>
            <LoginPanel />
            <button
              onClick={() => setStep(1)}
              className="self-center text-xs font-semibold text-[var(--color-ink-soft)]"
            >
              ← Geri
            </button>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex flex-1 flex-col"
          >
            <p className="text-sm font-semibold text-[var(--color-paprika)]">Son bir şey</p>
            <h1 className="mt-1 text-2xl font-black text-[var(--color-ink)]">Nasıl besleniyorsun?</h1>
            <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
              Sana önerdiğimiz tarifleri buna göre önceliklendirelim. İstediğin zaman Ayarlar'dan
              değiştirebilirsin.
            </p>

            <div className="mt-6 flex flex-col gap-2.5">
              {DIETARY_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => setDietaryFilter(opt.value)}
                  className="flex items-center gap-3 rounded-2xl bg-[var(--color-surface)] px-4 py-3.5 text-left shadow-sm active:scale-95"
                >
                  <span className="text-xl">{opt.emoji}</span>
                  <span className="text-sm font-semibold text-[var(--color-ink)]">{opt.label}</span>
                </button>
              ))}
            </div>

            <div className="mt-auto flex flex-col gap-2 pt-8">
              <button
                onClick={() => setStep(4)}
                className="rounded-full bg-[var(--color-paprika)] px-5 py-3 text-sm font-bold text-[var(--color-cream)] shadow-sm active:scale-95"
              >
                Devam Et
              </button>
            </div>
          </motion.div>
        )}

        {step === 4 && (
          <motion.div
            key="step4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-1 flex-col items-center justify-center gap-5 text-center"
          >
            <motion.span
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
              className="text-6xl"
            >
              🍽️
            </motion.span>
            <motion.h1
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="text-2xl font-black text-[var(--color-ink)]"
            >
              Tarifim'e hoş geldin!
            </motion.h1>
            <motion.p
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.45, duration: 0.4 }}
              className="max-w-xs text-sm text-[var(--color-ink-soft)]"
            >
              Sağa kaydır, sepetine ekle, en uygun marketi bul — ve topluluktaki herkesin
              tariflerini keşfet.
            </motion.p>
            <motion.button
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.4 }}
              onClick={handleFinish}
              className="mt-2 rounded-full bg-[var(--color-paprika)] px-8 py-3.5 text-sm font-bold text-[var(--color-cream)] shadow-sm active:scale-95"
            >
              Başla
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </PageFade>
  );
}
