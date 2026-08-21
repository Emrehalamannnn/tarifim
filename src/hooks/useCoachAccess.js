// Pre-StoreKit gate for the AI coach: there's no purchasable entitlement
// yet, so access is hardcoded to a single allowed account instead of a real
// subscription check (see useSubscription). This is a UI-only convenience —
// the ai-coach Edge Function re-checks the same allowlist server-side
// against the caller's verified session, so this hook can never itself grant
// access to the API. Swap the body for a subscriptions-table lookup once
// purchases ship; every call site here only ever reads the single boolean.
const COACH_ALLOWED_EMAILS = ["dunyasiemh@gmail.com"];

export function useCoachAccess(user) {
  const email = user?.email?.toLowerCase().trim();
  return !!email && COACH_ALLOWED_EMAILS.includes(email);
}
