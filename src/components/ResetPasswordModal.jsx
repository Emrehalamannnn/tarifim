import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../hooks/useAuth";
import PasswordStrengthMeter from "./PasswordStrengthMeter";
import { isPasswordStrongEnough } from "../lib/passwordStrength";

// Shown app-wide (mounted in App.jsx, not gated behind any route) whenever
// useAuth's passwordRecovery flips true — Supabase reads the recovery
// tokens out of the URL fragment itself on load, so this doesn't depend on
// (and isn't broken by) HashRouter also trying to parse that same fragment
// as a route.
export default function ResetPasswordModal() {
  const { passwordRecovery, clearPasswordRecovery, updatePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const strongEnough = isPasswordStrongEnough(password);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!strongEnough) return;
    setError(null);
    setSubmitting(true);
    try {
      const { error: updateError } = await updatePassword(password);
      if (updateError) {
        setError(updateError.message);
      } else {
        setDone(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setPassword("");
    setError(null);
    setDone(false);
    clearPasswordRecovery();
  }

  return (
    <AnimatePresence>
      {passwordRecovery && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-5 backdrop-blur-sm sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="w-full max-w-sm rounded-[24px] bg-[var(--color-surface)] p-5 shadow-2xl"
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 340, damping: 28 }}
          >
            {done ? (
              <>
                <h2 className="text-base font-bold text-[var(--color-ink)]">Şifren Güncellendi</h2>
                <p className="mt-1.5 text-sm text-[var(--color-ink-soft)]">
                  Artık yeni şifrenle giriş yapabilirsin.
                </p>
                <button
                  onClick={handleClose}
                  className="mt-5 w-full rounded-full bg-[var(--color-paprika)] px-4 py-2.5 text-sm font-bold text-[var(--color-cream)] active:scale-95"
                >
                  Tamam
                </button>
              </>
            ) : (
              <>
                <h2 className="text-base font-bold text-[var(--color-ink)]">Yeni Şifre Belirle</h2>
                <p className="mt-1.5 text-sm text-[var(--color-ink-soft)]">
                  Hesabın için yeni bir şifre gir.
                </p>
                <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2.5 text-left" noValidate>
                  <label htmlFor="reset-password" className="text-xs font-semibold text-[var(--color-ink-soft)]">
                    Yeni Şifre
                  </label>
                  <div className="relative">
                    <input
                      id="reset-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      minLength={8}
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
                  <PasswordStrengthMeter password={password} />
                  {error && <p className="text-xs text-[var(--color-tomato)]">{error}</p>}
                  <div className="mt-2 flex gap-2.5">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="flex-1 rounded-full bg-[var(--color-cream)] px-4 py-2.5 text-sm font-semibold text-[var(--color-ink)] active:scale-95"
                    >
                      Vazgeç
                    </button>
                    <button
                      type="submit"
                      disabled={submitting || !strongEnough}
                      className="flex-1 rounded-full bg-[var(--color-paprika)] px-4 py-2.5 text-sm font-bold text-[var(--color-cream)] active:scale-95 disabled:opacity-40"
                    >
                      {submitting ? "…" : "Kaydet"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
