import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import BottomNav from "./components/BottomNav";
import SwipeDeckPage from "./pages/SwipeDeckPage";
import CartPage from "./pages/CartPage";
import RecipeDetailPage from "./pages/RecipeDetailPage";
import ProfilePage from "./pages/ProfilePage";
import OnboardingPage from "./pages/OnboardingPage";
import SocialPage from "./pages/SocialPage";
import PostDetailPage from "./pages/PostDetailPage";
import UserProfilePage from "./pages/UserProfilePage";
import CoachPage from "./pages/CoachPage";
import SettingsPage from "./pages/SettingsPage";
import { useAppStore } from "./store/useAppStore";
import { useThemeSync } from "./hooks/useThemeSync";

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
        <Routes>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route
            path="/"
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
            path="/social"
            element={
              <RequireOnboarding>
                <SocialPage />
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
        </Routes>
      </div>
      <BottomNavGate />
    </HashRouter>
  );
}

function BottomNavGate() {
  const hasOnboarded = useAppStore((s) => s.hasOnboarded);
  return hasOnboarded ? <BottomNav /> : null;
}
