import { useState } from "react";
import { useAuth } from "../hooks/useAuth";

// Real Supabase auth: Google/Apple are OAuth redirects (each needs its
// provider enabled with real credentials in the Supabase dashboard before
// the button will work — see CLAUDE.md "Real accounts & social backend").
// Email is real email+password (signUp / signInWithPassword) — no magic
// link, the user types a password and it's checked immediately.
export default function LoginPanel() {
  const { isConfigured, signInWithGoogle, signInWithApple, signUpWithPassword, signInWithPassword } = useAuth();
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);
  const [error, setError] = useState(null);

  async function handleEmailSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await signUpWithPassword(email.trim(), password);
        if (signUpError) {
          setError(signUpError.message);
        } else if (!data.session) {
          // "Confirm email" is on for this project — signUp succeeded but
          // needs the one-time confirmation link before a session exists.
          setConfirmSent(true);
        }
      } else {
        const { error: signInError } = await signInWithPassword(email.trim(), password);
        if (signInError) setError(signInError.message);
      }
    } finally {
      setSubmitting(false);
    }
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

        {showEmailForm && !confirmSent && (
          <form onSubmit={handleEmailSubmit} className="flex flex-col gap-2 pt-1 text-left">
            <div className="flex gap-1 self-center rounded-full bg-[var(--color-cream)] p-1">
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError(null);
                }}
                className={`rounded-full px-3.5 py-1 text-xs font-semibold transition-colors ${
                  mode === "signin" ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-sm" : "text-[var(--color-ink-soft)]"
                }`}
              >
                Giriş Yap
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setError(null);
                }}
                className={`rounded-full px-3.5 py-1 text-xs font-semibold transition-colors ${
                  mode === "signup" ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-sm" : "text-[var(--color-ink-soft)]"
                }`}
              >
                Hesap Oluştur
              </button>
            </div>
            <input
              type="email"
              placeholder="E-posta"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="rounded-xl border border-[var(--color-cream-dark)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--color-paprika)]"
            />
            <input
              type="password"
              placeholder="Şifre"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={6}
              className="rounded-xl border border-[var(--color-cream-dark)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--color-paprika)]"
            />
            {error && <p className="text-xs text-[var(--color-tomato)]">{error}</p>}
            <button
              type="submit"
              disabled={!email.trim() || password.length < 6 || submitting}
              className="rounded-full bg-[var(--color-paprika)] px-4 py-2.5 text-sm font-bold text-[var(--color-cream)] active:scale-95 disabled:opacity-40"
            >
              {submitting ? "…" : mode === "signup" ? "Hesap Oluştur" : "Giriş Yap"}
            </button>
          </form>
        )}

        {confirmSent && (
          <p className="pt-1 text-xs text-[var(--color-olive)]">
            📩 {email} adresine bir onay bağlantısı gönderdik — hesabını onaylamak için gelen kutunu kontrol et,
            sonra şifrenle giriş yapabilirsin.
          </p>
        )}
      </div>

      <p className="text-[10px] text-[var(--color-ink-soft)]">
        Giriş yaparak hesabını oluşturmuş olursun — bilgilerin Supabase üzerinde güvenle saklanır.
      </p>
    </div>
  );
}
