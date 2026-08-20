import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { usePostComments } from "../hooks/usePostComments";
import Avatar from "./Avatar";

const dateFormatter = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" });

function CommentRow({
  comment,
  isReply,
  currentUserId,
  canPin,
  onLike,
  onPin,
  onDelete,
  onReply,
}) {
  const canDelete = comment.authorId === currentUserId || canPin;

  return (
    <li className={`flex items-start gap-2.5 ${isReply ? "mt-3 pl-8" : ""}`}>
      <Link to={`/user/${comment.authorId}`} className="shrink-0">
        <Avatar name={comment.author} avatarUrl={comment.authorAvatarUrl} size={isReply ? "sm" : "md"} />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-[var(--color-ink)]">
          <Link to={`/user/${comment.authorId}`} className="font-semibold">
            {comment.author}
          </Link>{" "}
          {comment.body}
        </p>
        <div className="mt-0.5 flex items-center gap-3 text-[11px] text-[var(--color-ink-soft)]">
          <span>{dateFormatter.format(new Date(comment.createdAt))}</span>
          {comment.pinnedAt && <span className="font-semibold text-[var(--color-paprika)]">📌 Sabitlenmiş</span>}
          {comment.likeCount > 0 && <span>{comment.likeCount} beğeni</span>}
          {currentUserId && (
            <button onClick={() => onReply(comment)} className="font-semibold active:scale-95">
              Yanıtla
            </button>
          )}
          {canPin && !isReply && (
            <button onClick={() => onPin(comment)} className="font-semibold active:scale-95">
              {comment.pinnedAt ? "Sabitlemeyi Kaldır" : "Sabitle"}
            </button>
          )}
          {canDelete && (
            <button onClick={() => onDelete(comment.id)} className="font-semibold text-[var(--color-tomato)] active:scale-95">
              Sil
            </button>
          )}
        </div>
      </div>
      <button
        onClick={() => onLike(comment)}
        disabled={!currentUserId}
        aria-label={comment.likedByMe ? "Beğenmekten vazgeç" : "Beğen"}
        className="mt-0.5 shrink-0 active:scale-90 disabled:opacity-40"
      >
        <span className={comment.likedByMe ? "text-[var(--color-tomato)]" : "text-[var(--color-ink-soft)]"}>
          {comment.likedByMe ? "❤️" : "🤍"}
        </span>
      </button>
    </li>
  );
}

export default function CommentsModal({
  postId,
  postAuthorId,
  currentUserId,
  currentUserIsOwner,
  open,
  onClose,
}) {
  const { comments, loading, addComment, deleteComment, toggleCommentLike, togglePin } = usePostComments(
    open ? postId : null,
    currentUserId
  );
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null); // { commentId, authorName }

  const canPin = Boolean(currentUserId) && (currentUserId === postAuthorId || currentUserIsOwner);

  const { threads } = useMemo(() => {
    const topLevel = comments.filter((c) => !c.parentCommentId);
    const repliesByParent = new Map();
    for (const c of comments) {
      if (!c.parentCommentId) continue;
      if (!repliesByParent.has(c.parentCommentId)) repliesByParent.set(c.parentCommentId, []);
      repliesByParent.get(c.parentCommentId).push(c);
    }
    const pinned = topLevel
      .filter((c) => c.pinnedAt)
      .sort((a, b) => new Date(b.pinnedAt) - new Date(a.pinnedAt));
    const rest = topLevel.filter((c) => !c.pinnedAt);
    return {
      pinned,
      threads: [...pinned, ...rest].map((c) => ({ comment: c, replies: repliesByParent.get(c.id) ?? [] })),
    };
  }, [comments]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!body.trim() || !currentUserId) return;
    setSending(true);
    try {
      await addComment(currentUserId, body.trim(), replyingTo?.commentId ?? null);
      setBody("");
      setReplyingTo(null);
    } finally {
      setSending(false);
    }
  }

  function handleReply(comment) {
    // Instagram flattens reply-to-a-reply onto the same top-level parent —
    // a reply's own parentCommentId is always a top-level comment, so reuse
    // it rather than nesting a third level.
    const parentId = comment.parentCommentId ?? comment.id;
    setReplyingTo({ commentId: parentId, authorName: comment.author });
  }

  function handleLike(comment) {
    toggleCommentLike(comment.id, comment.likedByMe);
  }

  function handlePin(comment) {
    togglePin(comment.id, Boolean(comment.pinnedAt));
  }

  function handleClose() {
    setReplyingTo(null);
    setBody("");
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[55] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleClose}
        >
          <motion.div
            className="flex max-h-[85vh] w-full max-w-sm flex-col overflow-hidden rounded-t-[28px] bg-[var(--color-surface)] shadow-2xl sm:rounded-[28px]"
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--color-cream-dark)] px-5 py-4">
              <h2 className="text-base font-bold text-[var(--color-ink)]">Yorumlar</h2>
              <button
                onClick={handleClose}
                aria-label="Kapat"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-cream)] text-sm active:scale-90"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {loading ? (
                <p className="py-8 text-center text-sm text-[var(--color-ink-soft)]">Yükleniyor…</p>
              ) : threads.length === 0 ? (
                <p className="py-8 text-center text-sm text-[var(--color-ink-soft)]">
                  Henüz yorum yok. İlk yorumu sen yap!
                </p>
              ) : (
                <ul className="flex flex-col gap-4">
                  {threads.map(({ comment, replies }) => (
                    <div key={comment.id}>
                      <CommentRow
                        comment={comment}
                        isReply={false}
                        currentUserId={currentUserId}
                        canPin={canPin}
                        onLike={handleLike}
                        onPin={handlePin}
                        onDelete={deleteComment}
                        onReply={handleReply}
                      />
                      {replies.map((reply) => (
                        <CommentRow
                          key={reply.id}
                          comment={reply}
                          isReply
                          currentUserId={currentUserId}
                          canPin={canPin}
                          onLike={handleLike}
                          onPin={handlePin}
                          onDelete={deleteComment}
                          onReply={handleReply}
                        />
                      ))}
                    </div>
                  ))}
                </ul>
              )}
            </div>

            {currentUserId && (
              <form
                onSubmit={handleSubmit}
                className="flex flex-col gap-2 border-t border-[var(--color-cream-dark)] px-4 py-3"
              >
                {replyingTo && (
                  <div className="flex items-center justify-between rounded-full bg-[var(--color-cream)] px-3 py-1 text-xs text-[var(--color-ink-soft)]">
                    <span>
                      <span className="font-semibold">{replyingTo.authorName}</span> adlı kullanıcıya yanıt
                      veriliyor
                    </span>
                    <button
                      type="button"
                      onClick={() => setReplyingTo(null)}
                      aria-label="Yanıtı iptal et"
                      className="ml-2 shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder={replyingTo ? "Yanıt yaz…" : "Yorum ekle…"}
                    className="flex-1 rounded-full border border-[var(--color-cream-dark)] px-3.5 py-2 text-sm outline-none focus:border-[var(--color-paprika)]"
                  />
                  <button
                    type="submit"
                    disabled={!body.trim() || sending}
                    className="rounded-full bg-[var(--color-paprika)] px-4 py-2 text-sm font-bold text-[var(--color-cream)] active:scale-95 disabled:opacity-40"
                  >
                    Gönder
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
