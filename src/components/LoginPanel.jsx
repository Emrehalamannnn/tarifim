import { useState } from "react";
import { useAuth } from "../hooks/useAuth";

// Real Supabase auth: Google/Apple are OAuth redirects (each needs its
// provider enabled with real credentials in the Supabase dashboard before
// the button will work — see CLAUDE.md "Real accounts & social backend").
// Email is a real magic-link sign-in (no password, same UX as the old
// mocked flow, but the link actually gets emailed and verified now).
export default function LoginPanel() {
  const { isConfigured, signInWithGoogle, signInWithApple, signInWithEmail } = useAuth();
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  async function handleEmailSubmit(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    const { error: signInError } = await signInWithEmail(email.trim());
    if (signInError) setError(signInError.message);
    else setSent(true);
  }

  if (!isConfigured) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-[var(--color-surface)] p-6 text-center shadow-sm">
        <span className="text-4xl">⚙️</span>
        <div>
          <h2 className="text-base font-bold text-[var(--color-ink)]">Hesaplar Henüz Ayarlanmadı</h2>
          <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
            Giriş yapabilmek için bir Supabase projesi bağlanmalı. <code>.env.example</code> dosyasını{" "}
            <code>.env</code> olarak kopyalayıp proje bilgilerini gir, sonra{" "}
            <code>supabase/schema.sql</code>'i projenin SQL Editor'ünde çalıştır.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl bg-[var(--color-surface)] p-6 text-center shadow-sm">
      <span className="text-4xl">🧑‍🍳</span>
      <div>
        <h2 className="text-base font-bold text-[var(--color-ink)]">Giriş Yap</h2>
        <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
          Profilini, takipçilerini ve paylaşımlarını görmek için giriş yap.
        </p>
      </div>

      <div className="flex w-full flex-col gap-2.5">
        <button
          onClick={signInWithApple}
          className="flex items-center justify-center gap-2 rounded-full bg-black px-4 py-3 text-sm font-semibold text-white active:scale-95"
        >
          <span></span> Apple ile Giriş Yap
        </button>
        <button
          onClick={signInWithGoogle}
          className="flex items-center justify-center gap-2 rounded-full border border-[var(--color-cream-dark)] bg-[var(--color-surface)] px-4 py-3 text-sm font-semibold text-[var(--color-ink)] active:scale-95"
        >
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#4285F4] text-[10px] font-bold text-white">
            G
          </span>
          Google ile Giriş Yap
        </button>
        <button
          onClick={() => setShowEmailForm((v) => !v)}
          className="flex items-center justify-center gap-2 rounded-full bg-[var(--color-cream)] px-4 py-3 text-sm font-semibold text-[var(--color-ink)] active:scale-95"
        >
          ✉️ E-posta ile Giriş Yap
        </button>

        {showEmailForm && !sent && (
          <form onSubmit={handleEmailSubmit} className="flex flex-col gap-2 pt-1 text-left">
            <input
              type="email"
              placeholder="E-posta"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl border border-[var(--color-cream-dark)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--color-paprika)]"
            />
            {error && <p className="text-xs text-[var(--color-tomato)]">{error}</p>}
            <button
              type="submit"
              disabled={!email.trim()}
              className="rounded-full bg-[var(--color-paprika)] px-4 py-2.5 text-sm font-bold text-white active:scale-95 disabled:opacity-40"
            >
              Giriş Bağlantısı Gönder
            </button>
          </form>
        )}

        {sent && (
          <p className="pt-1 text-xs text-[var(--color-olive)]">
            📩 {email} adresine bir giriş bağlantısı gönderdik — gelen kutunu kontrol et.
          </p>
        )}
      </div>

      <p className="text-[10px] text-[var(--color-ink-soft)]">
        Giriş yaparak hesabını oluşturmuş olursun — bilgilerin Supabase üzerinde güvenle saklanır.
      </p>
    </div>
  );
}
