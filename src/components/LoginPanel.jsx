import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import PasswordStrengthMeter from "./PasswordStrengthMeter";
import { isPasswordStrongEnough } from "../lib/passwordStrength";

const USERNAME_PATTERN = /^[a-z0-9_.]{3,20}$/;

// Real Supabase auth: Google/Apple are OAuth redirects (each needs its
// provider enabled with real credentials in the Supabase dashboard before
// the button will work — see CLAUDE.md "Real accounts & social backend").
// Email is real email+password (signUp / signInWithPassword, the latter
// routed through the rate-limited auth-login Edge Function — see useAuth).
//
// Markup follows a password-manager-friendly sign-in form shape: a real
// <form>, a labeled email input with autoComplete="username" (the token a
// password manager keys off, regardless of input type="email"), a labeled
// password input with the correct current-password/new-password token so
// Enter submits and saved credentials autofill correctly, and a visible
// "Şifreyi göster/gizle" toggle as its own type="button" so it never
// submits the form. Federated buttons sit above a divider, not mixed in
// with the form fields.
export default function LoginPanel() {
  const {
    isConfigured,
    signInWithGoogle,
    signInWithApple,
    signUpWithPassword,
    signInWithPassword,
    requestPasswordReset,
  } = useAuth();
  const [mode, setMode] = useState("signin"); // "signin" | "signup" | "forgot"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [error, setError] = useState(null);

  const usernameTrimmed = username.trim().toLowerCase();
  const usernameValid = USERNAME_PATTERN.test(usernameTrimmed);
  const passwordStrongEnough = isPasswordStrongEnough(password);

  function switchMode(next) {
    setMode(next);
    setError(null);
    setConfirmSent(false);
    setResetSent(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (mode === "forgot") {
      if (!email.trim()) return;
      setSubmitting(true);
      try {
        await requestPasswordReset(email.trim());
        setResetSent(true);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!email.trim() || !password) return;
    if (mode === "signup" && (!usernameValid || !passwordStrongEnough)) return;

    setSubmitting(true);
    try {
      if (mode === "signup") {
        const { data, error: signUpError } = await signUpWithPassword(email.trim(), password, usernameTrimmed);
        if (signUpError) {
          setError(
            /duplicate|unique|username/i.test(signUpError.message)
              ? "Bu kullanıcı adı alınmış — başka bir tane dene."
              : signUpError.message
          );
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
        <h2 className="text-base font-bold text-[var(--color-ink)]">
          {mode === "forgot" ? "Şifreni Sıfırla" : "Giriş Yap"}
        </h2>
        <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
          {mode === "forgot"
            ? "E-postanı gir, sana bir sıfırlama bağlantısı gönderelim."
            : "Profilini, takipçilerini ve paylaşımlarını görmek için giriş yap."}
        </p>
      </div>

      <div className="flex w-full flex-col gap-3">
        {mode !== "forgot" && (
          <>
            <div className="flex flex-col gap-2.5">
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
            </div>

            <div className="flex items-center gap-3" role="separator">
              <span className="h-px flex-1 bg-[var(--color-cream-dark)]" />
              <span className="text-[11px] text-[var(--color-ink-soft)]">veya</span>
              <span className="h-px flex-1 bg-[var(--color-cream-dark)]" />
            </div>

            <div className="flex gap-1 self-center rounded-full bg-[var(--color-cream)] p-1">
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className={`rounded-full px-3.5 py-1 text-xs font-semibold transition-colors ${
                  mode === "signin" ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-sm" : "text-[var(--color-ink-soft)]"
                }`}
              >
                Giriş Yap
              </button>
              <button
                type="button"
                onClick={() => switchMode("signup")}
                className={`rounded-full px-3.5 py-1 text-xs font-semibold transition-colors ${
                  mode === "signup" ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-sm" : "text-[var(--color-ink-soft)]"
                }`}
              >
                Hesap Oluştur
              </button>
            </div>
          </>
        )}

        {!confirmSent && !resetSent && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-2.5 text-left" noValidate>
            {mode === "signup" && (
              <div className="flex flex-col gap-1">
                <label htmlFor="login-username" className="text-xs font-semibold text-[var(--color-ink-soft)]">
                  Kullanıcı Adı
                </label>
                <input
                  id="login-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  placeholder="ör. ayse.yilmaz"
                  className="rounded-xl border border-[var(--color-cream-dark)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--color-paprika)]"
                />
                {username.length > 0 && !usernameValid && (
                  <p className="text-[11px] text-[var(--color-tomato)]">
                    3-20 karakter, küçük harf/rakam/nokta/alt çizgi.
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label htmlFor="login-email" className="text-xs font-semibold text-[var(--color-ink-soft)]">
                E-posta
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                placeholder="ornek@eposta.com"
                className="rounded-xl border border-[var(--color-cream-dark)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--color-paprika)]"
              />
            </div>

            {mode !== "forgot" && (
              <div className="flex flex-col gap-1">
                <label htmlFor="login-password" className="text-xs font-semibold text-[var(--color-ink-soft)]">
                  Şifre
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    minLength={mode === "signup" ? 8 : undefined}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-[var(--color-cream-dark)] px-3.5 py-2.5 pr-11 text-sm outline-none focus:border-[var(--color-paprika)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
                    className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-sm text-[var(--color-ink-soft)] active:scale-90"
                  >
                    {showPassword ? "🙈" : "👁️"}
                  </button>
                </div>
                {mode === "signup" && <PasswordStrengthMeter password={password} />}
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={() => switchMode("forgot")}
                    className="self-end text-[11px] font-semibold text-[var(--color-paprika)]"
                  >
                    Şifremi unuttum
                  </button>
                )}
              </div>
            )}

            {mode === "forgot" && (
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className="self-start text-[11px] font-semibold text-[var(--color-paprika)]"
              >
                ← Girişe dön
              </button>
            )}

            {error && <p className="text-xs text-[var(--color-tomato)]">{error}</p>}

            <button
              type="submit"
              disabled={
                submitting ||
                !email.trim() ||
                (mode !== "forgot" && !password) ||
                (mode === "signup" && (!usernameValid || !passwordStrongEnough))
              }
              className="rounded-full bg-[var(--color-paprika)] px-4 py-2.5 text-sm font-bold text-[var(--color-cream)] active:scale-95 disabled:opacity-40"
            >
              {submitting
                ? "…"
                : mode === "forgot"
                  ? "Sıfırlama Bağlantısı Gönder"
                  : mode === "signup"
                    ? "Hesap Oluştur"
                    : "Giriş Yap"}
            </button>
          </form>
        )}

        {confirmSent && (
          <p className="pt-1 text-xs text-[var(--color-olive)]">
            📩 {email} adresine bir onay bağlantısı gönderdik — hesabını onaylamak için gelen kutunu kontrol et,
            sonra şifrenle giriş yapabilirsin.
          </p>
        )}

        {resetSent && (
          <p className="pt-1 text-xs text-[var(--color-olive)]">
            📩 Bu e-posta ile bir hesap varsa, {email} adresine bir sıfırlama bağlantısı gönderdik.
          </p>
        )}
      </div>

      <p className="text-[10px] text-[var(--color-ink-soft)]">
        Giriş yaparak hesabını oluşturmuş olursun — bilgilerin Supabase üzerinde güvenle saklanır.
      </p>
    </div>
  );
}
