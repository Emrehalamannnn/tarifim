import { useCallback, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

// Private 1:1 messaging (see schema.sql's direct_messages comment) — not
// per-post comments, not a public/group room. There's no separate
// "conversations" table; a conversation is just the set of distinct other
// users a given user has exchanged direct_messages rows with.

// Inbox: one row per conversation partner, most-recently-active first.
export function useConversations(currentUserId) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !currentUserId) {
      setConversations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("direct_messages")
      .select(
        "*, sender:profiles!direct_messages_sender_id_fkey(name, avatar_url), recipient:profiles!direct_messages_recipient_id_fkey(name, avatar_url)"
      )
      .or(`sender_id.eq.${currentUserId},recipient_id.eq.${currentUserId}`)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load conversations", error);
      setConversations([]);
      setLoading(false);
      return;
    }

    // Collapse to the latest message per other-party — data is already
    // newest-first, so the first row seen per partner id wins.
    const byPartner = new Map();
    for (const m of data) {
      const isSender = m.sender_id === currentUserId;
      const partnerId = isSender ? m.recipient_id : m.sender_id;
      if (byPartner.has(partnerId)) continue;
      const partner = isSender ? m.recipient : m.sender;
      byPartner.set(partnerId, {
        userId: partnerId,
        name: partner?.name ?? "Bilinmeyen",
        avatarUrl: partner?.avatar_url ?? null,
        lastMessage: m.body,
        lastMessageAt: m.created_at,
        lastMessageFromMe: isSender,
      });
    }
    setConversations(Array.from(byPartner.values()));
    setLoading(false);
  }, [currentUserId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isSupabaseConfigured || !currentUserId) return;
    const channel = supabase
      .channel(`direct_messages_inbox_${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, refresh]);

  return { conversations, loading, refresh };
}

// One thread between currentUserId and otherUserId.
export function useConversation(currentUserId, otherUserId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured || !currentUserId || !otherUserId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("direct_messages")
      .select("*")
      .or(
        `and(sender_id.eq.${currentUserId},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${currentUserId})`
      )
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Failed to load conversation", error);
      setMessages([]);
    } else {
      setMessages(
        data.map((m) => ({
          id: m.id,
          senderId: m.sender_id,
          body: m.body,
          createdAt: m.created_at,
        }))
      );
    }
    setLoading(false);
  }, [currentUserId, otherUserId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!isSupabaseConfigured || !currentUserId || !otherUserId) return;
    const channel = supabase
      .channel(`direct_messages_thread_${currentUserId}_${otherUserId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        (payload) => {
          const row = payload.new;
          const belongsToThread =
            (row.sender_id === currentUserId && row.recipient_id === otherUserId) ||
            (row.sender_id === otherUserId && row.recipient_id === currentUserId);
          if (belongsToThread) refresh();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, otherUserId, refresh]);

  async function sendMessage(body) {
    const { error } = await supabase
      .from("direct_messages")
      .insert({ sender_id: currentUserId, recipient_id: otherUserId, body });
    if (error) throw error;
  }

  return { messages, loading, sendMessage, refresh };
}
