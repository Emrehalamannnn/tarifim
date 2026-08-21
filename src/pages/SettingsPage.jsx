import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useFollowRequests } from "../hooks/useFollows";
import { useBlockedUsers } from "../hooks/useModeration";
import { useAppStore } from "../store/useAppStore";
import { supabase } from "../lib/supabase";
import { submitFeedback } from "../hooks/useFeedback";
import { isPasswordStrongEnough } from "../lib/passwordStrength";
import chains from "../data/chains.json";
import ChainBadge from "../components/ChainBadge";
import PageFade from "../components/PageFade";
import LoginPanel from "../components/LoginPanel";
import Avatar from "../components/Avatar";
import PasswordStrengthMeter from "../components/PasswordStrengthMeter";
import ConfirmDialog from "../components/ConfirmDialog";

const USERNAME_PATTERN = /^[a-z0-9_.]{3,20}$/;

const PROVIDER_LABELS = {
  apple: "Apple",
  google: "Google",
  email: "E-posta",
};

const PRIVACY_OPTIONS = [
  { value: false, label: "Herkese Açık" },
  { value: true, label: "Gizli" },
];

const THEME_OPTIONS = [
  { value: "system", label: "Sistem" },
  { value: "light", label: "Açık" },
  { value: "dark", label: "Koyu" },
];

const DIETARY_OPTIONS = [
  { value: null, label: "Hepsi" },
  { value: "vegetarian", label: "Vejetaryen" },
  { value: "vegan", label: "Vegan" },
  { value: "budget-friendly", label: "Ekonomik" },
];

function BlockedUserRow({ user, onUnblock }) {
  const [unblocking, setUnblocking] = useState(false);
  const [error, setError] = useState(null);

  async function handleUnblock() {
    setUnblocking(true);
    setError(null);
    try {
      await onUnblock(user.id);
      // On success the parent removes this row, so this component unmounts
      // here — don't touch state after this point.
    } catch (err) {
      console.error("Failed to unblock user", err);
      setError("Engel kaldırılamadı, tekrar dene.");
      setUnblocking(false);
    }
  }

  return (
    <li className="flex items-center gap-2.5">
      <Link to={`/user/${user.id}`} className="flex min-w-0 flex-1 items-center gap-2.5">
        <Avatar name={user.name} avatarUrl={user.avatar_url} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--color-ink)]">{user.name}</p>
          {user.username && (
            <p className="truncate text-xs text-[var(--color-ink-soft)]">@{user.username}</p>
          )}
        </div>
      </Link>
      <div className="flex flex-col items-end gap-1">
        <button
          onClick={handleUnblock}
          disabled={unblocking}
          className="shrink-0 rounded-full bg-[var(--color-cream)] px-3 py-1.5 text-xs font-semibold text-[var(--color-tomato)] active:scale-95 disabled:opacity-60"
        >
          {unblocking ? "Kaldırılıyor…" : "Engeli Kaldır"}
        </button>
        {error && <p className="text-[10px] text-[var(--color-tomato)]">{error}</p>}
      </div>
    </li>
  );
}

function FollowRequestRow({ request, onApprove, onReject }) {
  return (
    <li className="flex items-center gap-2.5">
      <Link to={`/user/${request.id}`} className="flex min-w-0 flex-1 items-center gap-2.5">
        <Avatar name={request.name} avatarUrl={request.avatar_url} />
        <span className="truncate text-sm font-semibold text-[var(--color-ink)]">{request.name}</span>
      </Link>
      <button
        onClick={() => onApprove(request.id)}
        className="rounded-full bg-[var(--color-olive)] px-3 py-1.5 text-xs font-semibold text-[var(--color-cream)] active:scale-95"
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
  const { user, profile, signOut, deleteAccount, refreshProfile, updateEmail, updatePassword } = useAuth();
  const { requests, approve, reject } = useFollowRequests(user?.id);
  const { users: blockedUsers, loading: blockedUsersLoading, unblock: unblockUser } = useBlockedUsers(user?.id);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const preferredChainIds = useAppStore((s) => s.preferredChainIds);
  const togglePreferredChain = useAppStore((s) => s.togglePreferredChain);
  const dietaryFilter = useAppStore((s) => s.dietaryFilter);
  const setDietaryFilter = useAppStore((s) => s.setDietaryFilter);
  const resetDeck = useAppStore((s) => s.resetDeck);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const [name, setName] = useState(profile?.name ?? "");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);

  const [username, setUsername] = useState(profile?.username ?? "");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameSaved, setUsernameSaved] = useState(false);
  const [usernameError, setUsernameError] = useState(null);

  const [newEmail, setNewEmail] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState(null);

  const [newPassword, setNewPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState(null);

  const [privacySaving, setPrivacySaving] = useState(false);

  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [feedbackError, setFeedbackError] = useState(null);

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

  async function handleUsernameSave(e) {
    e.preventDefault();
    const trimmed = username.trim().toLowerCase();
    if (!USERNAME_PATTERN.test(trimmed)) {
      setUsernameError("3-20 karakter, küçük harf/rakam/nokta/alt çizgi.");
      return;
    }
    setUsernameSaving(true);
    setUsernameSaved(false);
    setUsernameError(null);
    const { error } = await supabase.from("profiles").update({ username: trimmed }).eq("id", user.id);
    if (error) {
      // profiles_username_key is the case-insensitive unique index in
      // schema.sql — a 23505 here means someone else already has it.
      setUsernameError(
        error.code === "23505" ? "Bu kullanıcı adı alınmış." : "Kullanıcı adı güncellenemedi."
      );
    } else {
      setUsername(trimmed);
      await refreshProfile();
      setUsernameSaved(true);
    }
    setUsernameSaving(false);
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

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    if (!isPasswordStrongEnough(newPassword)) return;
    setPasswordSaving(true);
    setPasswordError(null);
    setPasswordSaved(false);
    const { error } = await updatePassword(newPassword);
    if (error) {
      setPasswordError(error.message);
    } else {
      setPasswordSaved(true);
      setNewPassword("");
    }
    setPasswordSaving(false);
  }

  async function handleFeedbackSubmit(e) {
    e.preventDefault();
    if (!feedbackMessage.trim()) return;
    setFeedbackSending(true);
    setFeedbackError(null);
    try {
      await submitFeedback(user.id, feedbackMessage.trim());
      setFeedbackMessage("");
      setFeedbackSent(true);
    } catch (err) {
      setFeedbackError(err.message);
    } finally {
      setFeedbackSending(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleteConfirmOpen(false);
    setDeleting(true);
    setDeleteError(null);
    const { error } = await deleteAccount();
    if (error) {
      setDeleteError(error.message);
      setDeleting(false);
    }
    // On success the session is cleared and this page re-renders into the
    // logged-out LoginPanel state on its own — nothing else to do here.
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
              className="rounded-full bg-[var(--color-paprika)] px-4 py-2 text-sm font-bold text-[var(--color-cream)] active:scale-95 disabled:opacity-40"
            >
              Kaydet
            </button>
          </div>
          {nameSaved && <p className="text-xs text-[var(--color-olive)]">Kaydedildi ✓</p>}
        </form>

        <form
          onSubmit={handleUsernameSave}
          className="mt-2 flex flex-col gap-2 rounded-2xl bg-[var(--color-surface)] p-4 shadow-sm"
        >
          <label htmlFor="settings-username" className="text-xs font-semibold text-[var(--color-ink-soft)]">
            Kullanıcı Adı
          </label>
          <div className="flex gap-2">
            <input
              id="settings-username"
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setUsernameSaved(false);
                setUsernameError(null);
              }}
              autoComplete="username"
              className="flex-1 rounded-full border border-[var(--color-cream-dark)] px-3.5 py-2 text-sm outline-none focus:border-[var(--color-paprika)]"
            />
            <button
              type="submit"
              disabled={!username.trim() || usernameSaving}
              className="rounded-full bg-[var(--color-paprika)] px-4 py-2 text-sm font-bold text-[var(--color-cream)] active:scale-95 disabled:opacity-40"
            >
              Kaydet
            </button>
          </div>
          {usernameError && <p className="text-xs text-[var(--color-tomato)]">{usernameError}</p>}
          {usernameSaved && <p className="text-xs text-[var(--color-olive)]">Kaydedildi ✓</p>}
        </form>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">Tercihler</h2>
        <div className="flex flex-col gap-4 rounded-2xl bg-[var(--color-surface)] p-4 shadow-sm">
          <div>
            <p className="mb-1.5 text-xs font-semibold text-[var(--color-ink-soft)]">Görünüm</p>
            <div className="flex gap-1 rounded-full bg-[var(--color-cream)] p-1">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTheme(opt.value)}
                  className={`flex-1 rounded-full py-1.5 text-sm font-medium transition-colors ${
                    theme === opt.value
                      ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-sm"
                      : "text-[var(--color-ink-soft)]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-[var(--color-ink-soft)]">
              Tercih Ettiğin Marketler
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
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-[var(--color-ink-soft)]">Beslenme Filtresi</p>
            <div className="flex flex-wrap gap-2">
              {DIETARY_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => setDietaryFilter(opt.value)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    dietaryFilter === opt.value
                      ? "bg-[var(--color-paprika)] text-[var(--color-cream)]"
                      : "bg-[var(--color-cream)] text-[var(--color-ink-soft)]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
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
                    className="rounded-full bg-[var(--color-paprika)] px-4 py-2 text-sm font-bold text-[var(--color-cream)] active:scale-95 disabled:opacity-40"
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
          ) : null}

          {profile?.provider === "email" ? (
            <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-2 border-t border-[var(--color-cream-dark)] pt-3">
              <label className="text-xs font-semibold text-[var(--color-ink-soft)]">Şifre Değiştir</label>
              {!passwordSaved && (
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <input
                      type="password"
                      placeholder="Yeni şifre"
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value);
                        setPasswordSaved(false);
                      }}
                      autoComplete="new-password"
                      minLength={8}
                      className="flex-1 rounded-full border border-[var(--color-cream-dark)] px-3.5 py-2 text-sm outline-none focus:border-[var(--color-paprika)]"
                    />
                    <button
                      type="submit"
                      disabled={!isPasswordStrongEnough(newPassword) || passwordSaving}
                      className="rounded-full bg-[var(--color-paprika)] px-4 py-2 text-sm font-bold text-[var(--color-cream)] active:scale-95 disabled:opacity-40"
                    >
                      Kaydet
                    </button>
                  </div>
                  <PasswordStrengthMeter password={newPassword} />
                </div>
              )}
              {passwordError && <p className="text-xs text-[var(--color-tomato)]">{passwordError}</p>}
              {passwordSaved && <p className="text-xs text-[var(--color-olive)]">Şifren güncellendi ✓</p>}
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

          <div className="border-t border-[var(--color-cream-dark)] pt-3">
            <p className="text-xs font-semibold text-[var(--color-ink-soft)]">Hesabı Sil</p>
            <p className="mt-1 text-[11px] text-[var(--color-ink-soft)]">
              Hesabın, paylaşımların, yorumların, mesajların ve yüklediğin medya kalıcı olarak silinir.
              Bu işlem geri alınamaz.
            </p>
            <button
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={deleting}
              className="mt-2 self-start rounded-full bg-[var(--color-tomato)] px-4 py-2 text-xs font-semibold text-[var(--color-cream)] active:scale-95 disabled:opacity-60"
            >
              {deleting ? "Siliniyor…" : "Hesabımı Kalıcı Olarak Sil"}
            </button>
            {deleteError && <p className="mt-1.5 text-xs text-[var(--color-tomato)]">{deleteError}</p>}
          </div>
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

          <div className="mt-4 border-t border-[var(--color-cream-dark)] pt-4">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
              Engellenen Kullanıcılar
            </h3>
            {blockedUsersLoading ? (
              <p className="text-xs text-[var(--color-ink-soft)]">Yükleniyor…</p>
            ) : blockedUsers.length === 0 ? (
              <p className="text-xs text-[var(--color-ink-soft)]">Engellenen kullanıcı yok.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {blockedUsers.map((u) => (
                  <BlockedUserRow key={u.id} user={u} onUnblock={unblockUser} />
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
          Öneri Gönder
        </h2>
        <form onSubmit={handleFeedbackSubmit} className="flex flex-col gap-2 rounded-2xl bg-[var(--color-surface)] p-4 shadow-sm">
          <label className="text-xs font-semibold text-[var(--color-ink-soft)]">
            Uygulamada görmek istediğin bir şey mi var? Bize yaz.
          </label>
          <textarea
            value={feedbackMessage}
            onChange={(e) => {
              setFeedbackMessage(e.target.value);
              setFeedbackSent(false);
            }}
            maxLength={2000}
            rows={3}
            placeholder="Önerini yaz…"
            className="rounded-2xl border border-[var(--color-cream-dark)] px-3.5 py-2.5 text-sm outline-none focus:border-[var(--color-paprika)]"
          />
          <button
            type="submit"
            disabled={!feedbackMessage.trim() || feedbackSending}
            className="self-start rounded-full bg-[var(--color-paprika)] px-4 py-2 text-sm font-bold text-[var(--color-cream)] active:scale-95 disabled:opacity-40"
          >
            Gönder
          </button>
          {feedbackError && <p className="text-xs text-[var(--color-tomato)]">{feedbackError}</p>}
          {feedbackSent && <p className="text-xs text-[var(--color-olive)]">Gönderildi, teşekkürler! ✓</p>}
        </form>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">Uygulama</h2>
        <div className="flex flex-col gap-4 rounded-2xl bg-[var(--color-surface)] p-4 shadow-sm">
          <div>
            <p className="mb-1.5 text-xs font-semibold text-[var(--color-ink-soft)]">Deste</p>
            <button
              onClick={resetDeck}
              className="rounded-full bg-[var(--color-cream)] px-4 py-2 text-sm font-medium text-[var(--color-tomato)] active:scale-95"
            >
              Tüm swipe geçmişini sıfırla
            </button>
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold text-[var(--color-ink-soft)]">Hakkında</p>
            <p className="text-[11px] text-[var(--color-ink-soft)]">Tarifim · sürüm 1.0.0</p>
            <Link
              to="/privacy"
              className="mt-1.5 inline-block text-xs font-semibold text-[var(--color-paprika)]"
            >
              Gizlilik Politikası →
            </Link>
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Hesabını kalıcı olarak sil?"
        description="Hesabın, paylaşımların, yorumların, beğenilerin, takipçilerin, mesajların ve yüklediğin tüm medya kalıcı olarak silinecek. Bu işlem geri alınamaz."
        confirmLabel="Evet, Hesabımı Sil"
        onConfirm={handleDeleteAccount}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </PageFade>
  );
}
