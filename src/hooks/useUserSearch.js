import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

// Backs the "Yeni Mesaj" username search (Instagram-style DM composer,
// reachable from Topluluk's message icon). profiles is publicly readable
// (schema.sql), so a plain ilike search needs no extra RLS — the pattern is
// passed as a query-builder value, not concatenated into raw SQL, so it's
// not an injection vector. Debounced client-side since this fires on every
// keystroke.
export function useUserSearch(query, excludeUserId) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (!isSupabaseConfigured || trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      let request = supabase
        .from("profiles")
        .select("id, name, username, avatar_url, is_verified, is_owner")
        .ilike("username", `%${trimmed}%`)
        .order("username")
        .limit(20);
      if (excludeUserId) request = request.neq("id", excludeUserId);

      const { data, error } = await request;
      if (cancelled) return;
      if (error) {
        console.error("Failed to search users", error);
        setResults([]);
      } else {
        setResults(data);
      }
      setLoading(false);
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, excludeUserId]);

  return { results, loading };
}
