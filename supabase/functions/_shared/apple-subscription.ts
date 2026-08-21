// Server-side Apple App Store Server API client, shared by
// apple-subscription, subscription-status, coach-access and ai-coach.
//
// verifyAppleSubscription() is the only source of truth for whether a given
// Apple transaction currently entitles its owner to Tarifim Premium --
// nothing here ever trusts client-reported StoreKit state. It generates a
// short-lived ES256 JWT (Apple's required auth scheme for this API) using
// the App Store Connect In-App Purchase key, then asks Apple directly.
//
// hasActivePremium() reads the *result* of that verification back out of
// public.subscriptions, which is only ever written by apple-subscription/
// subscription-status after a successful verifyAppleSubscription() call --
// so callers that just need a fast yes/no (coach-access, ai-coach) don't
// have to hit Apple's API on every request.
//
// Required secrets: APPLE_IAP_KEY_ID, APPLE_IAP_ISSUER_ID,
// APPLE_IAP_PRIVATE_KEY, APPLE_BUNDLE_ID. Never sent to the client.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const APPLE_PRODUCT_ID = "com.tarifim.app.premium.monthly";

const PRODUCTION_BASE = "https://api.storekit.apple.com";
const SANDBOX_BASE = "https://api.storekit-sandbox.apple.com";
const JWT_TTL_SECONDS = 1200;
const TRANSACTION_NOT_FOUND_ERROR_CODE = 4040010;

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function pemToDer(pem: string): Uint8Array {
  const base64 = pem.replace(/-----BEGIN [^-]+-----/, "").replace(/-----END [^-]+-----/, "").replace(/\s+/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Module-scope cache: the Edge Function runtime reuses this isolate across
// invocations, so re-importing the same PEM into a CryptoKey on every
// request would be wasted work.
let cachedSigningKey: { pem: string; key: CryptoKey } | null = null;

async function importSigningKey(privateKeyPem: string): Promise<CryptoKey> {
  if (cachedSigningKey && cachedSigningKey.pem === privateKeyPem) return cachedSigningKey.key;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(privateKeyPem),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  cachedSigningKey = { pem: privateKeyPem, key };
  return key;
}

async function generateAppleJWT(): Promise<string> {
  const keyId = Deno.env.get("APPLE_IAP_KEY_ID");
  const issuerId = Deno.env.get("APPLE_IAP_ISSUER_ID");
  const privateKeyPem = Deno.env.get("APPLE_IAP_PRIVATE_KEY");
  const bundleId = Deno.env.get("APPLE_BUNDLE_ID");
  if (!keyId || !issuerId || !privateKeyPem || !bundleId) {
    throw new Error("Apple IAP server credentials are not configured");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const claims = { iss: issuerId, iat: now, exp: now + JWT_TTL_SECONDS, aud: "appstoreconnect-v1", bid: bundleId };

  const encoder = new TextEncoder();
  const signingInput = `${base64UrlEncode(encoder.encode(JSON.stringify(header)))}.${base64UrlEncode(encoder.encode(JSON.stringify(claims)))}`;

  const key = await importSigningKey(privateKeyPem);
  // Web Crypto's ECDSA signature for a P-256 key is already the raw r||s
  // (IEEE P1363) format JWS ES256 requires -- no DER conversion needed.
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(signingInput));

  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

function decodeJWSPayload<T>(jws: string): T {
  const parts = jws.split(".");
  if (parts.length !== 3) throw new Error("Malformed signed payload from Apple");
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1]))) as T;
}

interface AppleTransactionInfo {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  expiresDate?: number;
  environment: "Production" | "Sandbox";
  appAccountToken?: string;
}

interface AppleLastTransaction {
  status: number;
  signedTransactionInfo: string;
}

interface AppleSubscriptionStatusResponse {
  environment: "Production" | "Sandbox";
  bundleId: string;
  data?: { lastTransactions?: AppleLastTransaction[] }[];
}

// App Store Server API subscription status codes:
// 1 active, 2 expired, 3 in billing retry, 4 in billing grace period, 5 revoked.
const ENTITLED_STATUS_CODES = new Set([1, 4]);

export type AppleEntitlementStatus = "active" | "in_grace_period" | "expired" | "canceled" | "unknown";

export interface AppleEntitlement {
  entitled: boolean;
  status: AppleEntitlementStatus;
  productId: string;
  transactionId: string;
  originalTransactionId: string;
  expirationDate: string | null;
  environment: "Production" | "Sandbox";
  appAccountToken: string | null;
}

function mapStatusCode(code: number): AppleEntitlementStatus {
  switch (code) {
    case 1: return "active";
    case 4: return "in_grace_period";
    case 2: return "expired";
    case 5: return "canceled";
    default: return "unknown";
  }
}

async function fetchSubscriptionStatus(transactionId: string, jwt: string, base: string): Promise<Response> {
  return fetch(`${base}/inApps/v1/subscriptions/${encodeURIComponent(transactionId)}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
}

// Fails closed on every error path -- Apple unreachable, JWT generation
// failure, malformed response, transaction not found, bundle/product
// mismatch -- by returning entitled: false / status: "unknown" rather than
// throwing (a caller that forgot a try/catch must never accidentally grant
// access because an exception escaped).
export async function verifyAppleSubscription(transactionId: string): Promise<AppleEntitlement> {
  const notEntitled: AppleEntitlement = {
    entitled: false,
    status: "unknown",
    productId: APPLE_PRODUCT_ID,
    transactionId,
    originalTransactionId: "",
    expirationDate: null,
    environment: "Production",
    appAccountToken: null,
  };

  const bundleId = Deno.env.get("APPLE_BUNDLE_ID");
  if (!bundleId) return notEntitled;

  let jwt: string;
  try {
    jwt = await generateAppleJWT();
  } catch (err) {
    console.error("apple-subscription: JWT generation failed", err);
    return notEntitled;
  }

  let response: Response;
  try {
    response = await fetchSubscriptionStatus(transactionId, jwt, PRODUCTION_BASE);
    if (response.status === 404) {
      const body = await response.clone().json().catch(() => null);
      if (body?.errorCode === TRANSACTION_NOT_FOUND_ERROR_CODE) {
        response = await fetchSubscriptionStatus(transactionId, jwt, SANDBOX_BASE);
      }
    }
  } catch (err) {
    console.error("apple-subscription: App Store Server API unreachable", err);
    return notEntitled;
  }

  if (!response.ok) {
    console.error("apple-subscription: Apple returned", response.status, await response.text().catch(() => ""));
    return notEntitled;
  }

  let payload: AppleSubscriptionStatusResponse;
  try {
    payload = await response.json();
  } catch {
    return notEntitled;
  }

  if (payload.bundleId !== bundleId) {
    console.error("apple-subscription: bundle id mismatch");
    return notEntitled;
  }

  for (const group of payload.data ?? []) {
    for (const last of group.lastTransactions ?? []) {
      let info: AppleTransactionInfo;
      try {
        info = decodeJWSPayload<AppleTransactionInfo>(last.signedTransactionInfo);
      } catch {
        continue;
      }
      if (info.productId !== APPLE_PRODUCT_ID || info.bundleId !== bundleId) continue;

      return {
        entitled: ENTITLED_STATUS_CODES.has(last.status),
        status: mapStatusCode(last.status),
        productId: info.productId,
        transactionId: info.transactionId,
        originalTransactionId: info.originalTransactionId,
        expirationDate: info.expiresDate ? new Date(info.expiresDate).toISOString() : null,
        environment: payload.environment,
        appAccountToken: info.appAccountToken ?? null,
      };
    }
  }

  return notEntitled;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parsePremiumTestUserIds(raw: string | undefined | null): Set<string> {
  if (!raw) return new Set();
  const ids = new Set<string>();
  for (const part of raw.split(",")) {
    const candidate = part.trim().toLowerCase();
    // Silently drop anything that isn't a well-formed UUID rather than
    // throwing -- a malformed secret must degrade to "no test users" and
    // fall back to real Apple verification, never crash the request path.
    if (UUID_RE.test(candidate)) ids.add(candidate);
  }
  return ids;
}

// Internal test-only override, gated entirely by a server-side secret that
// is never sent to the client. `userId` must always come from
// supabase.auth.getUser() (the authenticated session), never from a request
// body -- otherwise a caller could self-grant Premium by claiming any UUID.
export function isPremiumTestUser(userId: string): boolean {
  const testUserIds = parsePremiumTestUserIds(Deno.env.get("PREMIUM_TEST_USER_IDS"));
  return testUserIds.has(userId.toLowerCase());
}

// Fast path for callers (coach-access, ai-coach) that just need a yes/no and
// don't need to re-verify with Apple on every call -- reads the cached
// result of the last verifyAppleSubscription() that apple-subscription or
// subscription-status wrote to public.subscriptions. That table has no
// client-facing insert/update policy (see schema.sql), so this can only ever
// reflect a write this module itself made.
export async function hasActivePremium(admin: SupabaseClient, userId: string): Promise<boolean> {
  if (isPremiumTestUser(userId)) return true;

  const { data } = await admin
    .from("subscriptions")
    .select("plan, status, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data || data.plan !== "premium") return false;
  if (data.status !== "active" && data.status !== "in_grace_period") return false;
  if (data.current_period_end && new Date(data.current_period_end).getTime() <= Date.now()) return false;
  return true;
}
