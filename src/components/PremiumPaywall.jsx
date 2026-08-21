import { useEffect, useState } from "react";
import { useSubscription } from "../hooks/useSubscription";
import { supabase } from "../lib/supabase";
import { PREMIUM_PRODUCT_ID, isNativeIOS, loadProducts, purchase, restorePurchases } from "../lib/storekit";

const dateFormatter = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" });

const PRIVACY_POLICY_URL = "https://emrehalamannnn.github.io/tarifim/privacy/";
const TERMS_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";

const PERIOD_UNIT_LABELS_TR = { day: "gün", week: "hafta", month: "ay", year: "yıl" };

function periodLabel(period) {
  if (!period) return "";
  const unit = PERIOD_UNIT_LABELS_TR[period.unit] ?? period.unit;
  return period.value === 1 ? unit : `${period.value} ${unit}`;
}

// Registers a StoreKit-verified transaction with the backend, which
// independently re-verifies it with Apple before recording anything — see
// supabase/functions/apple-subscription. Throws if Apple/the backend
// rejects it, so callers can surface a real error instead of unlocking
// Premium on client-side StoreKit state alone.
async function registerTransaction(transactionId) {
  const { data, error } = await supabase.functions.invoke("apple-subscription", {
    body: { action: "register", transactionId },
  });
  if (error || !data?.isPremium) {
    throw new Error("Apple işlemi doğrulanamadı.");
  }
}

export default function PremiumPaywall({ userId, compact = false }) {
  const { subscription, isPremium, loading, refresh } = useSubscription(userId);
  const [product, setProduct] = useState(null);
  const [productLoading, setProductLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (isPremium || !isNativeIOS()) {
      setProductLoading(false);
      return;
    }
    let cancelled = false;
    loadProducts([PREMIUM_PRODUCT_ID])
      .then((products) => {
        if (!cancelled) setProduct(products[0] ?? null);
      })
      .finally(() => {
        if (!cancelled) setProductLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isPremium]);

  async function handlePurchase() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await purchase(PREMIUM_PRODUCT_ID, userId);
      if (result?.pending) {
        setMessage("Satın alma onay bekliyor.");
        return;
      }
      await registerTransaction(result.transactionId);
      await refresh();
    } catch (err) {
      if (err?.code !== "USER_CANCELLED") {
        setMessage("Satın alma tamamlanamadı, tekrar dener misin?");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    setBusy(true);
    setMessage(null);
    try {
      const entitlements = await restorePurchases();
      const active = entitlements.find((e) => e.productId === PREMIUM_PRODUCT_ID);
      if (!active) {
        setMessage("Geri yüklenecek aktif bir abonelik bulunamadı.");
        return;
      }
      await registerTransaction(active.transactionId);
      await refresh();
    } catch {
      setMessage("Geri yükleme tamamlanamadı, tekrar dener misin?");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;

  const legalLinks = (
    <div className="mt-1 flex gap-3 text-[10px] text-[var(--color-ink-soft)]">
      <a href={PRIVACY_POLICY_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2">
        Gizlilik Politikası
      </a>
      <a href={TERMS_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2">
        Kullanım Şartları
      </a>
    </div>
  );

  if (isPremium) {
    return (
      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">Premium</h2>
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

  return (
    <section>
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
        Tarifim Premium
      </h2>
      <div
        className={`flex flex-col items-center gap-3 rounded-2xl bg-[var(--color-surface)] text-center shadow-sm ${
          compact ? "p-4" : "p-6"
        }`}
      >
        <span className="text-3xl">🩺</span>
        <p className="text-sm font-semibold text-[var(--color-ink)]">AI Koç erişimi</p>

        {!isNativeIOS() ? (
          <p className="max-w-xs text-xs text-[var(--color-ink-soft)]">
            Abonelikler yalnızca iOS uygulamasından satın alınabilir.
          </p>
        ) : productLoading ? (
          <p className="text-xs text-[var(--color-ink-soft)]">Yükleniyor…</p>
        ) : product ? (
          <>
            <p className="text-lg font-bold text-[var(--color-ink)]">
              {product.displayPrice}
              {product.subscriptionPeriod && (
                <span className="ml-1 text-xs font-normal text-[var(--color-ink-soft)]">
                  / {periodLabel(product.subscriptionPeriod)}
                </span>
              )}
            </p>
            {product.introductoryOffer?.paymentMode === "freeTrial" && (
              <p className="text-xs font-medium text-[var(--color-olive)]">Ücretsiz deneme mevcut</p>
            )}
            <button
              onClick={handlePurchase}
              disabled={busy}
              className="mt-1 w-full rounded-full bg-[var(--color-paprika)] px-4 py-2.5 text-sm font-bold text-[var(--color-cream)] active:scale-95 disabled:opacity-50"
            >
              Abone Ol
            </button>
            <button
              onClick={handleRestore}
              disabled={busy}
              className="text-xs font-medium text-[var(--color-ink-soft)] underline underline-offset-2 disabled:opacity-50"
            >
              Satın Alımları Geri Yükle
            </button>
          </>
        ) : (
          <p className="text-xs text-[var(--color-tomato)]">Ürün bilgisi yüklenemedi.</p>
        )}

        {message && <p className="text-xs text-[var(--color-ink-soft)]">{message}</p>}

        {legalLinks}
      </div>
    </section>
  );
}
