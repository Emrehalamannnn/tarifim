import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Both env vars come from a real Supabase project (Project Settings -> API).
// Until they're set, `supabase` stays null and auth/social features show a
// "not configured" state instead of crashing the app on import — see
// .env.example and CLAUDE.md's "Real accounts & social backend" section.
export const supabase = url && anonKey ? createClient(url, anonKey) : null;

export const isSupabaseConfigured = Boolean(supabase);
