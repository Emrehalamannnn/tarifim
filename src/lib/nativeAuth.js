import { registerPlugin, Capacitor } from "@capacitor/core";

// Thin proxy for AuthPlugin.swift (registered explicitly in
// BridgeViewController.swift, jsName "NativeAuth" -- same pattern as
// storekit.js's registerPlugin("StoreKit") call). Only ever invoked on
// native iOS; useAuth.js falls back to supabase.auth.signInWithOAuth() on
// web via the isNativeIOS() guard below.
export const NativeAuth = registerPlugin("NativeAuth");

export function isNativeIOS() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}
