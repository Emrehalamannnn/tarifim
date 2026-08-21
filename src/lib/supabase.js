import { createClient } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Both env vars come from a real Supabase project (Project Settings -> API).
// Until they're set, `supabase` stays null and auth/social features show a
// "not configured" state instead of crashing the app on import — see
// .env.example and CLAUDE.md's "Real accounts & social backend" section.
//
// Session storage: supabase-js defaults to `window.localStorage`, which
// persists indefinitely and is readable by any script that achieves XSS on
// this origin (no HttpOnly-cookie option exists for a pure static-frontend
// SPA like this one — there's no server to set one). `sessionStorage` scopes
// the token to the current tab and clears it when the tab closes, shrinking
// that exposure window; it's the standard mitigation short of a backend
// session layer. Trade-off: signing in in one tab doesn't carry over to a
// new tab, and closing the tab signs the user out — acceptable here.
//
// In the packaged iOS app (Capacitor WKWebView) that trade-off inverts:
// sessionStorage is wiped every time iOS terminates the app, which would
// force a fresh login on every relaunch. There's no third-party-script XSS
// surface in the bundled webview, so localStorage's indefinite persistence
// is the correct choice there.
const sessionStore = Capacitor.isNativePlatform() ? window.localStorage : window.sessionStorage;

export const supabase = url && anonKey
  ? createClient(url, anonKey, {
      auth: {
        storage: sessionStore,
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

export const isSupabaseConfigured = Boolean(supabase);
export const supabaseUrl = url;
