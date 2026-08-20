import { useCallback, useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

// Real Supabase auth session, replacing useAppStore's old mocked
// `user`/`login`/`logout`. Session state deliberately does NOT live in the
// zustand-persisted store — Supabase already persists its own session token
// (localStorage, refreshed automatically) and duplicating it would just
// invite the two copies to drift.
export function useAuth() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
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

  // Real email+password account creation/sign-in — replaces the old
  // magic-link flow (no more "check your email" step to get in).
  async function signUpWithPassword(email, password) {
    return supabase.auth.signUp({ email, password });
  }

  async function signInWithPassword(email, password) {
    return supabase.auth.signInWithPassword({ email, password });
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
    signOut,
    updateEmail,
    updatePassword,
  };
}
