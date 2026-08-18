import { useState } from "react";
import { useAppStore } from "../store/useAppStore";

// Apple/Google are simulated sign-ins (instant, local-only) since this app
// has no backend to run real OAuth against. Email just captures a local
// profile — there is no password because nothing verifies it. See
// CLAUDE.md "Mocked auth & social features" before treating this as real.
export default function LoginPanel() {
  const login = useAppStore((s) => s.login);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  function handleEmailSubmit(e) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    login("email", { name: name.trim(), email: email.trim() });
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl bg-white p-6 text-center shadow-sm">
      <span className="text-4xl">🧑‍🍳</span>
      <div>
        <h2 className="text-base font-bold text-[var(--color-ink)]">Giriş Yap</h2>
        <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
          Profilini, takipçilerini ve paylaşımlarını görmek için giriş yap.
        </p>
      </div>

      <div className="flex w-full flex-col gap-2.5">
        <button
          onClick={() => login("apple", { name: "Apple Kullanıcısı", email: "kullanici@icloud.com" })}
          className="flex items-center justify-center gap-2 rounded-full bg-black px-4 py-3 text-sm font-semibold text-white active:scale-95"
        >
          <span></span> Apple ile Giriş Yap
        </button>
        <button
          onClick={() => login("google", { name: "Google Kullanıcısı", email: "kullanici@gmail.com" })}
          className="flex items-center justify-center gap-2 rounded-full border border-[var(--color-cream-dark)] bg-white px-4 py-3 text-sm font-semibold text-[var(--color-ink)] active:scale-95"
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

        {showEmailForm && (
          <form onSubmit={handleEmailSubmit} className="flex flex-col gap-2 pt-1 text-left">
            <input
              type="text"
              placeholder="Ad Soyad"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-xl border border-[var(--color-cream-dark)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--color-paprika)]"
            />
            <input
              type="email"
              placeholder="E-posta"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-xl border border-[var(--color-cream-dark)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--color-paprika)]"
            />
            <button
              type="submit"
              disabled={!name.trim() || !email.trim()}
              className="rounded-full bg-[var(--color-paprika)] px-4 py-2.5 text-sm font-bold text-white active:scale-95 disabled:opacity-40"
            >
              Giriş Yap
            </button>
          </form>
        )}
      </div>

      <p className="text-[10px] text-[var(--color-ink-soft)]">
        Bu bir demo girişidir — bilgilerin yalnızca bu cihazda saklanır.
      </p>
    </div>
  );
}
