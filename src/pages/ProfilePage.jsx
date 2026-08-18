import { useAppStore } from "../store/useAppStore";
import { useAuth } from "../hooks/useAuth";
import { useFollowStats } from "../hooks/useFollows";
import chains from "../data/chains.json";
import ChainBadge from "../components/ChainBadge";
import PageFade from "../components/PageFade";
import LoginPanel from "../components/LoginPanel";
import { initialsFrom } from "../lib/mockSocial";

const DIETARY_OPTIONS = [
  { value: null, label: "Hepsi" },
  { value: "vegetarian", label: "Vejetaryen" },
  { value: "vegan", label: "Vegan" },
  { value: "budget-friendly", label: "Ekonomik" },
];

const CITIES = ["İstanbul", "Ankara", "İzmir", "Bursa", "Antalya"];

const PROVIDER_LABELS = {
  apple: "Apple",
  google: "Google",
  email: "E-posta",
};

export default function ProfilePage() {
  const { user, profile, signOut } = useAuth();
  const { followers, following } = useFollowStats(user?.id);
  const dietaryFilter = useAppStore((s) => s.dietaryFilter);
  const setDietaryFilter = useAppStore((s) => s.setDietaryFilter);
  const city = useAppStore((s) => s.city);
  const setCity = useAppStore((s) => s.setCity);
  const resetDeck = useAppStore((s) => s.resetDeck);
  const preferredChainIds = useAppStore((s) => s.preferredChainIds);
  const togglePreferredChain = useAppStore((s) => s.togglePreferredChain);

  return (
    <PageFade className="flex flex-1 flex-col gap-6 px-5 py-5">
      <header>
        <h1 className="text-xl font-bold text-[var(--color-ink)]">Profil</h1>
        <p className="text-xs text-[var(--color-ink-soft)]">Hesabını ve tercihlerini yönet.</p>
      </header>

      {!user ? (
        <LoginPanel />
      ) : (
        <section className="flex flex-col items-center gap-3 rounded-2xl bg-white p-6 text-center shadow-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-paprika)] text-xl font-bold text-white">
            {initialsFrom(profile?.name ?? user.email) || "🧑‍🍳"}
          </div>
          <div>
            <h2 className="text-base font-bold text-[var(--color-ink)]">{profile?.name ?? user.email}</h2>
            <p className="text-xs text-[var(--color-ink-soft)]">{user.email}</p>
            <p className="mt-1 text-[10px] text-[var(--color-ink-soft)]">
              {PROVIDER_LABELS[profile?.provider] ?? profile?.provider} ile giriş yapıldı
            </p>
          </div>

          <div className="flex items-center gap-6">
            <div>
              <p className="text-base font-bold text-[var(--color-ink)]">{followers}</p>
              <p className="text-[11px] text-[var(--color-ink-soft)]">Takipçi</p>
            </div>
            <div>
              <p className="text-base font-bold text-[var(--color-ink)]">{following}</p>
              <p className="text-[11px] text-[var(--color-ink-soft)]">Takip Edilen</p>
            </div>
          </div>

          <button
            onClick={signOut}
            className="mt-1 rounded-full bg-[var(--color-cream)] px-4 py-2 text-xs font-semibold text-[var(--color-tomato)] active:scale-95"
          >
            Çıkış Yap
          </button>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
          Tercih Ettiğin Marketler
        </h2>
        <p className="mb-2 text-xs text-[var(--color-ink-soft)]">
          Fiyat karşılaştırmasında sadece seçtiğin marketler gösterilir.
        </p>
        <div className="flex flex-wrap gap-2.5">
          {chains.map((chain) => {
            const isSelected = preferredChainIds.includes(chain.id);
            return (
              <button
                key={chain.id}
                onClick={() => togglePreferredChain(chain.id)}
                className={`rounded-2xl border-2 px-1 py-1 transition-transform active:scale-95 ${
                  isSelected ? "border-[var(--color-olive)]" : "border-transparent opacity-40"
                }`}
              >
                <ChainBadge chain={chain} className="px-3.5 py-1.5 text-sm" />
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
          Beslenme Filtresi
        </h2>
        <div className="flex flex-wrap gap-2">
          {DIETARY_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              onClick={() => setDietaryFilter(opt.value)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                dietaryFilter === opt.value
                  ? "bg-[var(--color-paprika)] text-white"
                  : "bg-white text-[var(--color-ink-soft)] shadow-sm"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
          Şehir <span className="normal-case text-[var(--color-ink-soft)]/70">(yakında bölgesel fiyatlar)</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          {CITIES.map((c) => (
            <button
              key={c}
              onClick={() => setCity(c)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                city === c
                  ? "bg-[var(--color-olive)] text-white"
                  : "bg-white text-[var(--color-ink-soft)] shadow-sm"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
          Deste
        </h2>
        <button
          onClick={resetDeck}
          className="rounded-full bg-white px-4 py-2 text-sm font-medium text-[var(--color-tomato)] shadow-sm active:scale-95"
        >
          Tüm swipe geçmişini sıfırla
        </button>
      </section>
    </PageFade>
  );
}
