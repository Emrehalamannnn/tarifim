import { useCallback, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

// Admin-only inbox for the Settings "feature request" box (see schema.sql's
// feedback table comment) — RLS already restricts select to is_owner, this
// hook just doesn't bother querying otherwise.
export function useFeedback(enabled) {
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !enabled) {
      setFeedback([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("feedback")
      .select("*, author:profiles!feedback_user_id_fkey(name, avatar_url)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load feedback", error);
      setFeedback([]);
    } else {
      setFeedback(
        data.map((f) => ({
          id: f.id,
          author: f.author?.name ?? "Bilinmeyen",
          authorAvatarUrl: f.author?.avatar_url ?? null,
          message: f.message,
          createdAt: f.created_at,
        }))
      );
    }
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { feedback, loading, refresh };
}

export async function submitFeedback(userId, message) {
  const { error } = await supabase.from("feedback").insert({ user_id: userId, message });
  if (error) throw error;
}
