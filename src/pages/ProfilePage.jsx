import { useState } from "react";
import { Link } from "react-router-dom";
import { useAppStore } from "../store/useAppStore";
import { useAuth } from "../hooks/useAuth";
import { useFollowStats } from "../hooks/useFollows";
import { useSavedPosts } from "../hooks/useSavedPosts";
import { useUserPosts } from "../hooks/useUserPosts";
import { supabase } from "../lib/supabase";
import { resizeImageFile } from "../lib/resizeImage";
import chains from "../data/chains.json";
import ChainBadge from "../components/ChainBadge";
import PageFade from "../components/PageFade";
import LoginPanel from "../components/LoginPanel";
import PremiumPaywall from "../components/PremiumPaywall";
import FollowListModal from "../components/FollowListModal";
import { initialsFrom } from "../lib/mockSocial";

const DIETARY_OPTIONS = [
  { value: null, label: "Hepsi" },
  { value: "vegetarian", label: "Vejetaryen" },
  { value: "vegan", label: "Vegan" },
  { value: "budget-friendly", label: "Ekonomik" },
];

const CITIES = ["İstanbul", "Ankara", "İzmir", "Bursa", "Antalya"];

const THEME_OPTIONS = [
  { value: "system", label: "Sistem" },
  { value: "light", label: "Açık" },
  { value: "dark", label: "Koyu" },
];

const PROVIDER_LABELS = {
  apple: "Apple",
  google: "Google",
  email: "E-posta",
};

export default function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth();
  const { followers, following } = useFollowStats(user?.id);
  const { posts: savedPosts } = useSavedPosts(user?.id);
  const { posts: userPosts } = useUserPosts(user?.id);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [followListType, setFollowListType] = useState(null);
  const dietaryFilter = useAppStore((s) => s.dietaryFilter);
  const setDietaryFilter = useAppStore((s) => s.setDietaryFilter);
  const city = useAppStore((s) => s.city);
  const setCity = useAppStore((s) => s.setCity);
  const resetDeck = useAppStore((s) => s.resetDeck);
  const preferredChainIds = useAppStore((s) => s.preferredChainIds);
  const togglePreferredChain = useAppStore((s) => s.togglePreferredChain);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setAvatarUploading(true);
    try {
      const { file: resized } = await resizeImageFile(file, 400, 0.82);
      const path = `${user.id}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, resized);
      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(path);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", user.id);
      if (updateError) throw updateError;

      await refreshProfile();
    } catch (err) {
      console.error("Failed to update profile picture", err);
    } finally {
      setAvatarUploading(false);
    }
  }

  return (
    <PageFade className="flex flex-1 flex-col gap-6 px-5 py-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-ink)]">Profil</h1>
          <p className="text-xs text-[var(--color-ink-soft)]">Hesabını ve tercihlerini yönet.</p>
        </div>
        {user && (
          <Link
            to="/settings"
            aria-label="Ayarlar"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-cream)] text-base active:scale-95"
          >
            ⚙️
          </Link>
        )}
      </header>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
          Görünüm
        </h2>
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
      </section>

      {!user ? (
        <LoginPanel />
      ) : (
        <section className="flex flex-col items-center gap-3 rounded-2xl bg-[var(--color-surface)] p-6 text-center shadow-sm">
          <label className="relative flex h-16 w-16 cursor-pointer items-center justify-center rounded-full active:scale-95">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-[var(--color-paprika)] text-xl font-bold text-white">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                initialsFrom(profile?.name ?? user.email) || "🧑‍🍳"
              )}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-olive)] text-[10px] text-white ring-2 ring-white">
              {avatarUploading ? "…" : "📷"}
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={avatarUploading}
              onChange={handleAvatarChange}
            />
          </label>
          <div>
            <h2 className="flex items-center justify-center gap-1.5 text-base font-bold text-[var(--color-ink)]">
              {profile?.name ?? user.email}
              {profile?.is_owner && <span title="Kurucu">👑</span>}
              {!profile?.is_owner && profile?.is_verified && (
                <span
                  className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-olive)] text-[9px] text-white"
                  title="Onaylı hesap"
                >
                  ✓
                </span>
              )}
            </h2>
            <p className="text-xs text-[var(--color-ink-soft)]">{user.email}</p>
            <p className="mt-1 text-[10px] text-[var(--color-ink-soft)]">
              {PROVIDER_LABELS[profile?.provider] ?? profile?.provider} ile giriş yapıldı
            </p>
          </div>

          <div className="flex items-center gap-6">
            <button onClick={() => setFollowListType("followers")} className="text-center active:scale-95">
              <p className="text-base font-bold text-[var(--color-ink)]">{followers}</p>
              <p className="text-[11px] text-[var(--color-ink-soft)]">Takipçi</p>
            </button>
            <button onClick={() => setFollowListType("following")} className="text-center active:scale-95">
              <p className="text-base font-bold text-[var(--color-ink)]">{following}</p>
              <p className="text-[11px] text-[var(--color-ink-soft)]">Takip Edilen</p>
            </button>
          </div>
        </section>
      )}

      <FollowListModal
        profileId={user?.id}
        type={followListType}
        currentUserId={user?.id}
        open={followListType !== null}
        onClose={() => setFollowListType(null)}
      />

      {user && (
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
            Premium
          </h2>
          <PremiumPaywall userId={user.id} compact />
        </section>
      )}

      {user && (
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
            Paylaşımlarım
          </h2>
          {userPosts.length === 0 ? (
            <p className="text-xs text-[var(--color-ink-soft)]">
              Henüz bir paylaşımın yok — Topluluk sekmesinden "+ Tarif Paylaş" ile başlayabilirsin.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {userPosts.map((post) => (
                <Link
                  key={post.id}
                  to={`/post/${post.id}`}
                  className="aspect-square overflow-hidden rounded-xl bg-[var(--color-cream)]"
                >
                  <img src={post.photoUrl} alt={post.title} className="h-full w-full object-cover" />
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {user && (
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
            Kaydedilenler
          </h2>
          {savedPosts.length === 0 ? (
            <p className="text-xs text-[var(--color-ink-soft)]">
              Henüz kaydettiğin bir paylaşım yok — Topluluk sekmesinde 🔖 ile kaydedebilirsin.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {savedPosts.map((post) => (
                <Link
                  key={post.id}
                  to={`/post/${post.id}`}
                  className="aspect-square overflow-hidden rounded-xl bg-[var(--color-cream)]"
                >
                  <img src={post.photoUrl} alt={post.title} className="h-full w-full object-cover" />
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
          Tercih Ettiğin Marketler
        </h2>
        <p className="mb-2 text-xs text-[var(--color-ink-soft)]">
          Fiyat karşılaştırmasında sadece seçtiğin marketler gösterilir.
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
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
          Beslenme Filtresi
        </h2>
        <div className="flex flex-wrap gap-2">
          {DIETARY_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              onClick={() => setDietaryFilter(opt.value)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                dietaryFilter === opt.value
                  ? "bg-[var(--color-paprika)] text-white"
                  : "bg-[var(--color-surface)] text-[var(--color-ink-soft)] shadow-sm"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
          Şehir <span className="normal-case text-[var(--color-ink-soft)]/70">(yakında bölgesel fiyatlar)</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          {CITIES.map((c) => (
            <button
              key={c}
              onClick={() => setCity(c)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                city === c
                  ? "bg-[var(--color-olive)] text-white"
                  : "bg-[var(--color-surface)] text-[var(--color-ink-soft)] shadow-sm"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
          Deste
        </h2>
        <button
          onClick={resetDeck}
          className="rounded-full bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-tomato)] shadow-sm active:scale-95"
        >
          Tüm swipe geçmişini sıfırla
        </button>
      </section>
    </PageFade>
  );
}
