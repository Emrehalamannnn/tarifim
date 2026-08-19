import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";

// Applies the store's theme preference to <html data-theme="…">, which
// index.css's :root[data-theme="dark"|"light"] rules key off. "system"
// clears the attribute entirely so the prefers-color-scheme media query
// in index.css takes over instead.
export function useThemeSync() {
  const theme = useAppStore((s) => s.theme);

  useEffect(() => {
    if (theme === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = theme;
    }
  }, [theme]);
}
