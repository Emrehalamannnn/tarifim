import { useSubscription } from "../hooks/useSubscription";

const dateFormatter = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" });

// StoreKit purchasing isn't implemented yet, so non-premium users see no
// premium surface at all — no disabled "coming soon" buy button (App Review
// treats visibly unfinished purchase flows as unfinished apps). The whole
// premium feature is hidden until real In-App Purchase support ships; for
// the rare manually-granted premium account (SQL Editor insert into
// `subscriptions` — see supabase/schema.sql) this renders the active badge.
export default function PremiumPaywall({ userId, compact = false }) {
  const { subscription, isPremium, loading } = useSubscription(userId);

  if (loading || !isPremium) return null;

  return (
    <section>
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
        Premium
      </h2>
      <div
        className={`flex flex-col items-center gap-2 rounded-2xl bg-[var(--color-surface)] text-center shadow-sm ${
          compact ? "p-4" : "p-6"
        }`}
      >
        <span className="rounded-full bg-[var(--color-olive)] px-3 py-1 text-xs font-bold text-[var(--color-cream)]">
          ✨ Premium Aktif
        </span>
        {subscription?.current_period_end && (
          <p className="text-xs text-[var(--color-ink-soft)]">
            {dateFormatter.format(new Date(subscription.current_period_end))} tarihine kadar geçerli.
          </p>
        )}
      </div>
    </section>
  );
}
