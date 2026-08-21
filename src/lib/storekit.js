import { registerPlugin, Capacitor } from "@capacitor/core";

export const PREMIUM_MONTHLY_PRODUCT_ID = "com.tarifim.app.premium.monthly";
export const PREMIUM_YEARLY_PRODUCT_ID = "com.tarifim.app.premium.yearly";
// Both belong to the same Apple subscription group ("Tarifim Premium") and
// unlock the same entitlement -- neither is more privileged than the other.
export const PREMIUM_PRODUCT_IDS = [PREMIUM_MONTHLY_PRODUCT_ID, PREMIUM_YEARLY_PRODUCT_ID];

// Registering the plugin proxy is safe on every platform (web included) --
// it only throws if one of its methods is actually invoked without a native
// implementation, which the isNativeIOS() guards below prevent.
const StoreKitNative = registerPlugin("StoreKit");

export function isNativeIOS() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
}

export async function loadProducts(productIds = PREMIUM_PRODUCT_IDS) {
  if (!isNativeIOS()) return [];
  const { products } = await StoreKitNative.getProducts({ productIds });
  return products ?? [];
}

// appAccountToken must be the caller's Supabase auth user id (a UUID) --
// never an email or a made-up identifier -- so Apple's own transaction
// record can later be cross-checked against the account it belongs to (see
// supabase/functions/apple-subscription).
export async function purchase(productId, appAccountToken) {
  if (!isNativeIOS()) {
    throw new Error("Satın alma yalnızca iOS uygulamasında kullanılabilir.");
  }
  return StoreKitNative.purchase({ productId, appAccountToken });
}

export async function currentEntitlements() {
  if (!isNativeIOS()) return [];
  const { entitlements } = await StoreKitNative.currentEntitlements();
  return entitlements ?? [];
}

// Only ever call this from an explicit user action (a "Restore" button tap),
// never automatically -- it can surface Apple's account-picker UI.
export async function restorePurchases() {
  if (!isNativeIOS()) {
    throw new Error("Satın alımları geri yükleme yalnızca iOS uygulamasında kullanılabilir.");
  }
  const { entitlements } = await StoreKitNative.restorePurchases();
  return entitlements ?? [];
}
