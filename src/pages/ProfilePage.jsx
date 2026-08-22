import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useFollowStats } from "../hooks/useFollows";
import { useSavedPosts } from "../hooks/useSavedPosts";
import { useUserPosts } from "../hooks/useUserPosts";
import { useFeedback } from "../hooks/useFeedback";
import { useAchievements } from "../hooks/useAchievements";
import { supabase } from "../lib/supabase";
import { resizeImageFile } from "../lib/resizeImage";
import { getCroppedImageFile } from "../lib/cropImage";
import PageFade from "../components/PageFade";
import LoginPanel from "../components/LoginPanel";
import PremiumPaywall from "../components/PremiumPaywall";
import FollowListModal from "../components/FollowListModal";
import ImageCropModal from "../components/ImageCropModal";
import GamificationHeader from "../components/GamificationHeader";
import AchievementGallery from "../components/AchievementGallery";
import { initialsFrom } from "../lib/mockSocial";

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
  const { feedback } = useFeedback(profile?.is_owner ?? false);
  const achievements = useAchievements(user?.id, user?.id);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarCropSrc, setAvatarCropSrc] = useState(null);
  const [followListType, setFollowListType] = useState(null);

  function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    setAvatarCropSrc(URL.createObjectURL(file));
  }

  function handleAvatarCropCancel() {
    if (avatarCropSrc) URL.revokeObjectURL(avatarCropSrc);
    setAvatarCropSrc(null);
  }

  async function handleAvatarCropConfirm(croppedAreaPixels) {
    if (!user) return;
    setAvatarUploading(true);
    try {
      const croppedFile = await getCroppedImageFile(avatarCropSrc, croppedAreaPixels);
      const { file: resized } = await resizeImageFile(croppedFile, 400, 0.82);
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
      URL.revokeObjectURL(avatarCropSrc);
      setAvatarCropSrc(null);
    }
  }

  return (
    <PageFade className="flex flex-1 flex-col gap-6 px-5 py-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-ink)]">Profil</h1>
          <p className="text-xs text-[var(--color-ink-soft)]">Paylaşımların ve hesabın.</p>
        </div>
        {user && (
          <div className="flex items-center gap-2">
            <Link
              to="/messages"
              aria-label="Mesajlar"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-cream)] text-base active:scale-95"
            >
              ✉️
            </Link>
            <Link
              to="/settings"
              aria-label="Ayarlar"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-cream)] text-base active:scale-95"
            >
              ⚙️
            </Link>
          </div>
        )}
      </header>

      {!user ? (
        <LoginPanel />
      ) : (
        <section className="flex flex-col items-center gap-3 rounded-2xl bg-[var(--color-surface)] p-6 text-center shadow-sm">
          <label className="relative flex h-16 w-16 cursor-pointer items-center justify-center rounded-full active:scale-95">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-[var(--color-paprika)] text-xl font-bold text-[var(--color-cream)]">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                initialsFrom(profile?.name ?? user.email) || "🧑‍🍳"
              )}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-olive)] text-[10px] text-[var(--color-cream)] ring-2 ring-white">
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
                  className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-olive)] text-[9px] text-[var(--color-cream)]"
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

          <div className="w-full border-t border-[var(--color-cream-dark)] pt-3">
            <GamificationHeader achievements={achievements} />
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

      {user && <AchievementGallery achievements={achievements} />}

      {profile?.is_owner && (
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
            Kullanıcı Önerileri
          </h2>
          {feedback.length === 0 ? (
            <p className="text-xs text-[var(--color-ink-soft)]">Henüz gelen bir öneri yok.</p>
          ) : (
            <ul className="flex flex-col gap-3 rounded-2xl bg-[var(--color-surface)] p-4 shadow-sm">
              {feedback.map((f) => (
                <li key={f.id} className="flex items-start gap-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-olive)] text-[10px] font-bold text-[var(--color-cream)]">
                    {f.authorAvatarUrl ? (
                      <img src={f.authorAvatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      initialsFrom(f.author)
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-[var(--color-ink)]">
                      <span className="font-semibold">{f.author}</span> {f.message}
                    </p>
                    <span className="text-[11px] text-[var(--color-ink-soft)]">
                      {new Date(f.createdAt).toLocaleDateString("tr-TR")}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {user && <PremiumPaywall userId={user.id} compact />}

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

      <ImageCropModal
        open={avatarCropSrc !== null}
        imageSrc={avatarCropSrc}
        aspect={1}
        onCancel={handleAvatarCropCancel}
        onConfirm={handleAvatarCropConfirm}
      />
    </PageFade>
  );
}
