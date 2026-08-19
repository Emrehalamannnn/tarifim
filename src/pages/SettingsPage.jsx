import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useFollowRequests } from "../hooks/useFollows";
import { supabase } from "../lib/supabase";
import PageFade from "../components/PageFade";
import LoginPanel from "../components/LoginPanel";
import Avatar from "../components/Avatar";

const PROVIDER_LABELS = {
  apple: "Apple",
  google: "Google",
  email: "E-posta",
};

const PRIVACY_OPTIONS = [
  { value: false, label: "Herkese Açık" },
  { value: true, label: "Gizli" },
];

function FollowRequestRow({ request, onApprove, onReject }) {
  return (
    <li className="flex items-center gap-2.5">
      <Link to={`/user/${request.id}`} className="flex min-w-0 flex-1 items-center gap-2.5">
        <Avatar name={request.name} avatarUrl={request.avatar_url} />
        <span className="truncate text-sm font-semibold text-[var(--color-ink)]">{request.name}</span>
      </Link>
      <button
        onClick={() => onApprove(request.id)}
        className="rounded-full bg-[var(--color-olive)] px-3 py-1.5 text-xs font-semibold text-white active:scale-95"
      >
        Onayla
      </button>
      <button
        onClick={() => onReject(request.id)}
        className="rounded-full bg-[var(--color-cream)] px-3 py-1.5 text-xs font-semibold text-[var(--color-ink-soft)] active:scale-95"
      >
        Reddet
      </button>
    </li>
  );
}

export default function SettingsPage() {
  const { user, profile, signOut, refreshProfile, updateEmail } = useAuth();
  const { requests, approve, reject } = useFollowRequests(user?.id);

  const [name, setName] = useState(profile?.name ?? "");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState(null);

  const [privacySaving, setPrivacySaving] = useState(false);

  if (!user) {
    return (
      <PageFade className="flex flex-1 flex-col gap-6 px-5 py-5">
        <header>
          <Link to="/profile" className="text-xs font-semibold text-[var(--color-ink-soft)]">
            ← Profil
          </Link>
          <h1 className="mt-1 text-xl font-bold text-[var(--color-ink)]">Ayarlar</h1>
        </header>
        <LoginPanel />
      </PageFade>
    );
  }

  async function handleNameSave(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setNameSaving(true);
    setNameSaved(false);
    const { error } = await supabase.from("profiles").update({ name: name.trim() }).eq("id", user.id);
    if (error) {
      console.error("Failed to update name", error);
    } else {
      await refreshProfile();
      setNameSaved(true);
    }
    setNameSaving(false);
  }

  async function handleEmailSubmit(e) {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setEmailSending(true);
    setEmailError(null);
    const { error } = await updateEmail(newEmail.trim());
    if (error) setEmailError(error.message);
    else setEmailSent(true);
    setEmailSending(false);
  }

  async function handlePrivacyChange(nextIsPrivate) {
    if (nextIsPrivate === profile?.is_private) return;
    setPrivacySaving(true);
    const { error } = await supabase.from("profiles").update({ is_private: nextIsPrivate }).eq("id", user.id);
    if (error) {
      console.error("Failed to update privacy", error);
      setPrivacySaving(false);
      return;
    }
    if (!nextIsPrivate) {
      const { error: acceptError } = await supabase.rpc("accept_all_pending_follow_requests");
      if (acceptError) console.error("Failed to auto-accept pending requests", acceptError);
    }
    await refreshProfile();
    setPrivacySaving(false);
  }

  return (
    <PageFade className="flex flex-1 flex-col gap-6 px-5 py-5">
      <header>
        <Link to="/profile" className="text-xs font-semibold text-[var(--color-ink-soft)]">
          ← Profil
        </Link>
        <h1 className="mt-1 text-xl font-bold text-[var(--color-ink)]">Ayarlar</h1>
      </header>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">Hesap</h2>
        <form onSubmit={handleNameSave} className="flex flex-col gap-2 rounded-2xl bg-[var(--color-surface)] p-4 shadow-sm">
          <label className="text-xs font-semibold text-[var(--color-ink-soft)]">Görünen Ad</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameSaved(false);
              }}
              className="flex-1 rounded-full border border-[var(--color-cream-dark)] px-3.5 py-2 text-sm outline-none focus:border-[var(--color-paprika)]"
            />
            <button
              type="submit"
              disabled={!name.trim() || nameSaving}
              className="rounded-full bg-[var(--color-paprika)] px-4 py-2 text-sm font-bold text-white active:scale-95 disabled:opacity-40"
            >
              Kaydet
            </button>
          </div>
          {nameSaved && <p className="text-xs text-[var(--color-olive)]">Kaydedildi ✓</p>}
        </form>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">Güvenlik</h2>
        <div className="flex flex-col gap-3 rounded-2xl bg-[var(--color-surface)] p-4 shadow-sm">
          {profile?.provider === "email" ? (
            <form onSubmit={handleEmailSubmit} className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-[var(--color-ink-soft)]">E-posta Değiştir</label>
              <p className="text-[11px] text-[var(--color-ink-soft)]">Şu an: {user.email}</p>
              {!emailSent && (
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="Yeni e-posta"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="flex-1 rounded-full border border-[var(--color-cream-dark)] px-3.5 py-2 text-sm outline-none focus:border-[var(--color-paprika)]"
                  />
                  <button
                    type="submit"
                    disabled={!newEmail.trim() || emailSending}
                    className="rounded-full bg-[var(--color-paprika)] px-4 py-2 text-sm font-bold text-white active:scale-95 disabled:opacity-40"
                  >
                    Gönder
                  </button>
                </div>
              )}
              {emailError && <p className="text-xs text-[var(--color-tomato)]">{emailError}</p>}
              {emailSent && (
                <p className="text-xs text-[var(--color-olive)]">
                  📩 Onay için hem eski hem yeni adresini kontrol et.
                </p>
              )}
            </form>
          ) : (
            <div>
              <p className="text-xs font-semibold text-[var(--color-ink-soft)]">E-posta</p>
              <p className="mt-1 text-sm text-[var(--color-ink)]">{user.email}</p>
              <p className="mt-1 text-[11px] text-[var(--color-ink-soft)]">
                {PROVIDER_LABELS[profile?.provider] ?? profile?.provider} ile giriş yaptığın için oturum açma
                e-postan sağlayıcı tarafından yönetilir, buradan değiştirilemez.
              </p>
            </div>
          )}

          <button
            onClick={signOut}
            className="mt-1 self-start rounded-full bg-[var(--color-cream)] px-4 py-2 text-xs font-semibold text-[var(--color-tomato)] active:scale-95"
          >
            Çıkış Yap
          </button>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">Gizlilik</h2>
        <div className="rounded-2xl bg-[var(--color-surface)] p-4 shadow-sm">
          <div className="flex gap-1 rounded-full bg-[var(--color-cream)] p-1">
            {PRIVACY_OPTIONS.map((opt) => (
              <button
                key={String(opt.value)}
                onClick={() => handlePrivacyChange(opt.value)}
                disabled={privacySaving}
                className={`flex-1 rounded-full py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${
                  Boolean(profile?.is_private) === opt.value
                    ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-sm"
                    : "text-[var(--color-ink-soft)]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-[var(--color-ink-soft)]">
            Gizli hesaplarda paylaşımlar sadece kabul edilmiş takipçilere görünür; yeni takipçiler önce istek
            göndermeli.
          </p>

          {profile?.is_private && (
            <div className="mt-4">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
                Takip İstekleri
              </h3>
              {requests.length === 0 ? (
                <p className="text-xs text-[var(--color-ink-soft)]">Bekleyen istek yok.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {requests.map((r) => (
                    <FollowRequestRow key={r.id} request={r} onApprove={approve} onReject={reject} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </section>
    </PageFade>
  );
}
