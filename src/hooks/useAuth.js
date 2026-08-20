import { useCallback, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

// Real Supabase auth session, replacing useAppStore's old mocked
// `user`/`login`/`logout`. Session state deliberately does NOT live in the
// zustand-persisted store — Supabase already persists its own session token
// (sessionStorage, not localStorage — see lib/supabase.js — refreshed
// automatically) and duplicating it would just invite the two copies to drift.
export function useAuth() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  // Flips true when Supabase redirects back here after the user clicks a
  // password-reset email link — App.jsx shows a "set a new password" modal
  // while this is true, independent of HashRouter's own path (the recovery
  // tokens Supabase reads out of the URL fragment on load would otherwise
  // collide with HashRouter treating # as its own route separator).
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!isSupabaseConfigured || !session?.user) return;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single();
    setProfile(data);
  }, [session?.user?.id]);

  useEffect(() => {
    if (!isSupabaseConfigured || !session?.user) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => {
        if (!cancelled) setProfile(data);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  async function signInWithGoogle() {
    return supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  }

  async function signInWithApple() {
    return supabase.auth.signInWithOAuth({
      provider: "apple",
      options: { redirectTo: window.location.origin },
    });
  }

  // Real email+password account creation — replaces the old magic-link flow
  // (no more "check your email" step to get in). username is mandatory
  // (schema.sql's handle_new_user trigger raises if it's missing on an
  // email-provider signup) — LoginPanel validates it client-side first for
  // a fast error, but the trigger is the actual enforcement.
  async function signUpWithPassword(email, password, username) {
    return supabase.auth.signUp({
      email,
      password,
      options: { data: { username: username?.trim().toLowerCase() } },
    });
  }

  // Routed through the auth-login Edge Function rather than calling
  // supabase.auth.signInWithPassword directly, so failed attempts are
  // throttled server-side per email (see supabase/functions/auth-login) —
  // a client-side-only limiter could just be reset by reloading the page.
  async function signInWithPassword(email, password) {
    const { data, error } = await supabase.functions.invoke("auth-login", {
      body: { email, password },
    });

    if (error) {
      let message = "Giriş başarısız.";
      try {
        const body = await error.context.json();
        if (body?.error) message = body.error;
      } catch {
        // no JSON body to read (network failure etc.) — keep the fallback.
      }
      return { error: { message } };
    }

    if (data?.session) {
      await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
    }
    return { error: null };
  }

  // Also routed through an Edge Function (auth-password-reset) for the same
  // per-email throttling reason as signInWithPassword — and so a
  // rate-limited or nonexistent-account request resolves identically,
  // rather than the SDK's resetPasswordForEmail leaking account existence
  // through timing/response differences.
  async function requestPasswordReset(email) {
    const { error } = await supabase.functions.invoke("auth-password-reset", {
      body: { email, redirectTo: window.location.origin },
    });
    return { error: error ? { message: "Bir şeyler ters gitti, tekrar dene." } : null };
  }

  async function signOut() {
    return supabase.auth.signOut();
  }

  // Real email change, only meaningful for provider === "email" accounts
  // (Google/Apple accounts' login email is managed by that provider, not
  // by us — SettingsPage doesn't offer this form for them). Supabase sends
  // a confirmation email before the change actually takes effect.
  async function updateEmail(newEmail) {
    return supabase.auth.updateUser({ email: newEmail });
  }

  async function updatePassword(newPassword) {
    return supabase.auth.updateUser({ password: newPassword });
  }

  return {
    isConfigured: isSupabaseConfigured,
    loading,
    user: session?.user ?? null,
    profile,
    refreshProfile,
    signInWithGoogle,
    signInWithApple,
    signUpWithPassword,
    signInWithPassword,
    requestPasswordReset,
    passwordRecovery,
    clearPasswordRecovery: () => setPasswordRecovery(false),
    signOut,
    updateEmail,
    updatePassword,
  };
}
