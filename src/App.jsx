import { lazy, Suspense } from "react";
import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import BottomNav from "./components/BottomNav";
import ResetPasswordModal from "./components/ResetPasswordModal";
import { useAppStore } from "./store/useAppStore";
import { useThemeSync } from "./hooks/useThemeSync";

// Lazy-loaded so the initial page load only fetches/transforms the one
// route actually being shown, instead of every page in the app up front.
const SwipeDeckPage = lazy(() => import("./pages/SwipeDeckPage"));
const CartPage = lazy(() => import("./pages/CartPage"));
const RecipeDetailPage = lazy(() => import("./pages/RecipeDetailPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const OnboardingPage = lazy(() => import("./pages/OnboardingPage"));
const SocialPage = lazy(() => import("./pages/SocialPage"));
const PostDetailPage = lazy(() => import("./pages/PostDetailPage"));
const UserProfilePage = lazy(() => import("./pages/UserProfilePage"));
const CoachPage = lazy(() => import("./pages/CoachPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const MessagesPage = lazy(() => import("./pages/MessagesPage"));
const NewMessagePage = lazy(() => import("./pages/NewMessagePage"));
const ConversationPage = lazy(() => import("./pages/ConversationPage"));
const PrivacyPolicyPage = lazy(() => import("./pages/PrivacyPolicyPage"));

function RequireOnboarding({ children }) {
  const hasOnboarded = useAppStore((s) => s.hasOnboarded);
  const location = useLocation();
  if (!hasOnboarded) {
    return <Navigate to="/onboarding" replace state={{ from: location }} />;
  }
  return children;
}

export default function App() {
  useThemeSync();
  return (
    <HashRouter>
      <div className="flex flex-1 flex-col overflow-y-auto">
        <Suspense fallback={null}>
        <Routes>
          <Route path="/onboarding" element={<OnboardingPage />} />
          {/* Deliberately outside RequireOnboarding — the privacy policy
              must be reachable before any account/onboarding step. */}
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route
            path="/"
            element={
              <RequireOnboarding>
                <SocialPage />
              </RequireOnboarding>
            }
          />
          <Route
            path="/kesfet"
            element={
              <RequireOnboarding>
                <SwipeDeckPage />
              </RequireOnboarding>
            }
          />
          <Route
            path="/cart"
            element={
              <RequireOnboarding>
                <CartPage />
              </RequireOnboarding>
            }
          />
          <Route
            path="/recipe/:id"
            element={
              <RequireOnboarding>
                <RecipeDetailPage />
              </RequireOnboarding>
            }
          />
          <Route
            path="/post/:id"
            element={
              <RequireOnboarding>
                <PostDetailPage />
              </RequireOnboarding>
            }
          />
          <Route
            path="/user/:id"
            element={
              <RequireOnboarding>
                <UserProfilePage />
              </RequireOnboarding>
            }
          />
          <Route
            path="/coach"
            element={
              <RequireOnboarding>
                <CoachPage />
              </RequireOnboarding>
            }
          />
          <Route
            path="/profile"
            element={
              <RequireOnboarding>
                <ProfilePage />
              </RequireOnboarding>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireOnboarding>
                <SettingsPage />
              </RequireOnboarding>
            }
          />
          <Route
            path="/messages"
            element={
              <RequireOnboarding>
                <MessagesPage />
              </RequireOnboarding>
            }
          />
          <Route
            path="/messages/new"
            element={
              <RequireOnboarding>
                <NewMessagePage />
              </RequireOnboarding>
            }
          />
          <Route
            path="/messages/:id"
            element={
              <RequireOnboarding>
                <ConversationPage />
              </RequireOnboarding>
            }
          />
          <Route path="*" element={<CatchAll />} />
        </Routes>
        </Suspense>
      </div>
      <BottomNavGate />
      <ResetPasswordModal />
    </HashRouter>
  );
}

function BottomNavGate() {
  const hasOnboarded = useAppStore((s) => s.hasOnboarded);
  return hasOnboarded ? <BottomNav /> : null;
}

// Supabase's OAuth/password-recovery redirect lands as
// "#access_token=...&refresh_token=..." (or "#error=..."), which HashRouter
// reads as its own route path since it treats everything after # as one.
// Without a catch-all, React Router logs the *entire* unmatched location —
// full access/refresh tokens included — to the console via console.warn.
// Matching it here (instead of leaving it unmatched) silences that. Must
// render null rather than redirect: navigating away would overwrite
// location.hash before Supabase's async init gets to read the tokens out
// of it, breaking the login/recovery flow it's relying on (see useAuth.js's
// onAuthStateChange, which resyncs the router once Supabase is done).
function CatchAll() {
  const location = useLocation();
  const isAuthCallback = /access_token=|refresh_token=|error=|error_description=/.test(
    location.pathname
  );
  if (isAuthCallback) return null;
  return <Navigate to="/" replace />;
}
