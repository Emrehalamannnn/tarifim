import { useCallback, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

// A single global, publicly-readable chat room (see schema.sql's
// chat_messages comment) — not per-post comments, not 1:1 DMs. Loads the
// most recent messages, then stays live via a Realtime subscription on
// inserts rather than polling.
export function useCommunityChat(enabled) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !enabled) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("chat_messages")
      .select("*, author:profiles!chat_messages_user_id_fkey(name, avatar_url)")
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) {
      console.error("Failed to load chat messages", error);
      setMessages([]);
    } else {
      setMessages(
        data.map((m) => ({
          id: m.id,
          userId: m.user_id,
          author: m.author?.name ?? "Bilinmeyen",
          authorAvatarUrl: m.author?.avatar_url ?? null,
          body: m.body,
          createdAt: m.created_at,
        }))
      );
    }
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isSupabaseConfigured || !enabled) return;
    const channel = supabase
      .channel("chat_messages_feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, refresh]);

  async function sendMessage(userId, body) {
    const { error } = await supabase.from("chat_messages").insert({ user_id: userId, body });
    if (error) throw error;
  }

  return { messages, loading, sendMessage, refresh };
}
