import { useSubscription } from "../hooks/useSubscription";

const dateFormatter = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" });

const PERKS = [
  "Sepetindeki tariflere ve kalori hedeflerine göre kişiselleştirilmiş tavsiyeler",
  "Beslenme filtrenle uyumlu, uygulanabilir öneriler",
  "Sorularını istediğin an sohbet ederek sor",
];

// Honest paywall — no fake "buy" button. Real purchasing needs Apple's
// StoreKit (this app ships on iOS, where third-party processors like
// Stripe aren't allowed for in-app digital subscriptions) wired up from a
// Mac with an Apple Developer account, which isn't available yet. Until
// then the only way a user becomes premium is a manual SQL Editor insert
// into `subscriptions` — see supabase/schema.sql.
export default function PremiumPaywall({ userId, compact = false }) {
  const { subscription, isPremium, loading } = useSubscription(userId);

  if (loading) {
    return <p className="text-sm text-[var(--color-ink-soft)]">Yükleniyor…</p>;
  }

  if (isPremium) {
    return (
      <div
        className={`flex flex-col items-center gap-2 rounded-2xl bg-white text-center shadow-sm ${
          compact ? "p-4" : "p-6"
        }`}
      >
        <span className="rounded-full bg-[var(--color-olive)] px-3 py-1 text-xs font-bold text-white">
          ✨ Premium Aktif
        </span>
        {subscription?.current_period_end && (
          <p className="text-xs text-[var(--color-ink-soft)]">
            {dateFormatter.format(new Date(subscription.current_period_end))} tarihine kadar geçerli.
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-2xl bg-white text-center shadow-sm ${
        compact ? "p-4" : "p-6"
      }`}
    >
      <span className="text-4xl">🩺</span>
      <div>
        <h2 className="text-base font-bold text-[var(--color-ink)]">Kişisel Sağlık Koçun</h2>
        <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
          Tarifim Premium ile yapay zeka destekli sağlık koçuna erişim kazan.
        </p>
      </div>

      {!compact && (
        <ul className="flex w-full flex-col gap-1.5 text-left text-xs text-[var(--color-ink-soft)]">
          {PERKS.map((perk) => (
            <li key={perk} className="flex gap-1.5">
              <span className="text-[var(--color-olive)]">✓</span>
              {perk}
            </li>
          ))}
        </ul>
      )}

      <button
        disabled
        className="w-full cursor-not-allowed rounded-full bg-[var(--color-cream)] px-5 py-3 text-sm font-bold text-[var(--color-ink-soft)]"
      >
        Yakında — iOS Uygulamasıyla Birlikte
      </button>
      <p className="text-[10px] text-[var(--color-ink-soft)]">
        Abonelik, App Store üzerinden Apple'ın satın alma sistemiyle sunulacak.
      </p>
    </div>
  );
}
