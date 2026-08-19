import { Link, useParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useFollowStats, useIsFollowing } from "../hooks/useFollows";
import { useProfile, useProfileLikeTotal } from "../hooks/useProfile";
import { useUserPosts } from "../hooks/useUserPosts";
import PageFade from "../components/PageFade";
import Avatar from "../components/Avatar";
import EmptyState from "../components/EmptyState";
import FollowButton from "../components/FollowButton";

const PROVIDER_LABELS = {
  apple: "Apple",
  google: "Google",
  email: "E-posta",
};

export default function UserProfilePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { profile, loading } = useProfile(id);
  const { followers, following } = useFollowStats(id);
  const { likeTotal } = useProfileLikeTotal(id);
  const { posts } = useUserPosts(id);
  const { status: followStatus } = useIsFollowing(user?.id, id, profile?.is_private);
  const isSelf = user?.id === id;
  const isLocked = Boolean(profile?.is_private) && !isSelf && followStatus !== "accepted";

  if (loading) {
    return (
      <PageFade>
        <p className="px-5 py-16 text-center text-sm text-[var(--color-ink-soft)]">Yükleniyor…</p>
      </PageFade>
    );
  }

  if (!profile) {
    return (
      <PageFade>
        <EmptyState
          emoji="🔍"
          title="Kullanıcı bulunamadı"
          description="Bu hesap silinmiş olabilir."
          action={
            <Link
              to="/social"
              className="mt-2 rounded-full bg-[var(--color-paprika)] px-5 py-2 text-sm font-semibold text-white shadow-sm active:scale-95"
            >
              Topluluğa Dön
            </Link>
          }
        />
      </PageFade>
    );
  }

  return (
    <PageFade className="flex flex-1 flex-col gap-6 px-5 py-5">
      <header className="flex items-center gap-1">
        <Link to="/social" className="text-xs font-semibold text-[var(--color-ink-soft)]">
          ← Topluluk
        </Link>
      </header>

      <section className="flex flex-col items-center gap-3 rounded-2xl bg-[var(--color-surface)] p-6 text-center shadow-sm">
        <Avatar name={profile.name} avatarUrl={profile.avatar_url} size="lg" className="text-xl" />
        <div>
          <h1 className="flex items-center justify-center gap-1.5 text-base font-bold text-[var(--color-ink)]">
            {profile.name}
            {profile.is_owner && <span title="Kurucu">👑</span>}
            {!profile.is_owner && profile.is_verified && (
              <span
                className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-olive)] text-[9px] text-white"
                title="Onaylı hesap"
              >
                ✓
              </span>
            )}
          </h1>
          <p className="mt-1 text-[10px] text-[var(--color-ink-soft)]">
            {PROVIDER_LABELS[profile.provider] ?? profile.provider} ile katıldı
          </p>
        </div>

        {!isLocked && (
          <div className="flex items-center gap-6">
            <div>
              <p className="text-base font-bold text-[var(--color-ink)]">{posts.length}</p>
              <p className="text-[11px] text-[var(--color-ink-soft)]">Tarif</p>
            </div>
            <div>
              <p className="text-base font-bold text-[var(--color-ink)]">{followers}</p>
              <p className="text-[11px] text-[var(--color-ink-soft)]">Takipçi</p>
            </div>
            <div>
              <p className="text-base font-bold text-[var(--color-ink)]">{following}</p>
              <p className="text-[11px] text-[var(--color-ink-soft)]">Takip Edilen</p>
            </div>
            <div>
              <p className="text-base font-bold text-[var(--color-ink)]">{likeTotal}</p>
              <p className="text-[11px] text-[var(--color-ink-soft)]">Beğeni</p>
            </div>
          </div>
        )}

        <FollowButton
          currentUserId={user?.id}
          targetUserId={id}
          targetIsPrivate={profile.is_private}
        />
      </section>

      {isLocked ? (
        <EmptyState
          emoji="🔒"
          title="Bu hesap gizli"
          description="Takip isteği gönder, kabul edildiğinde paylaşımlarını görebilirsin."
        />
      ) : (
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
            Paylaşımlar
          </h2>
          {posts.length === 0 ? (
            <p className="text-xs text-[var(--color-ink-soft)]">Henüz bir paylaşımı yok.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {posts.map((post) => (
                <Link
                  key={post.id}
                  to={`/post/${post.id}`}
                  className="relative aspect-square overflow-hidden rounded-xl bg-[var(--color-cream)]"
                >
                  {post.videoUrl ? (
                    <>
                      <video src={post.videoUrl} className="h-full w-full object-cover" muted playsInline />
                      <span className="absolute right-1 top-1 text-xs drop-shadow">🎥</span>
                    </>
                  ) : (
                    <img src={post.photoUrl} alt={post.title} className="h-full w-full object-cover" />
                  )}
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
    </PageFade>
  );
}
