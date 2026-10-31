"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { MotionConfig } from "motion/react";
import { DEFAULT_THEME, isThemeId, type ThemeId } from "@/lib/themes";

const MOTION_STORAGE_KEY = "clouddeck.reduce-motion";
const THEME_STORAGE_KEY = "clouddeck.theme";

interface PreferencesValue {
  theme: ThemeId;
  setTheme: (value: ThemeId) => void;
  reduceMotion: boolean;
  setReduceMotion: (value: boolean) => void;
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME);
  const [reduceMotion, setReduceMotionState] = useState(false);

  useEffect(() => {
    try {
      let storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (storedTheme === "clouddeck") {
        storedTheme = "daylight";
        window.localStorage.setItem(THEME_STORAGE_KEY, "daylight");
      }
      if (isThemeId(storedTheme)) setThemeState(storedTheme as ThemeId);
      setReduceMotionState(window.localStorage.getItem(MOTION_STORAGE_KEY) === "true");
    } catch {
      // Storage can be blocked; keep the defaults (Daylight, follow the OS setting).
    }
  }, []);

  const setTheme = useCallback((value: ThemeId) => {
    setThemeState(value);
    document.documentElement.dataset.theme = value;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, value);
    } catch {
      // The theme still applies to this page view.
    }
  }, []);

  const setReduceMotion = useCallback((value: boolean) => {
    setReduceMotionState(value);
    document.documentElement.dataset.reduceMotion = value ? "true" : "false";
    try {
      window.localStorage.setItem(MOTION_STORAGE_KEY, String(value));
    } catch {
      // The preference still applies to this page view.
    }
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, reduceMotion, setReduceMotion }),
    [theme, setTheme, reduceMotion, setReduceMotion],
  );

  return (
    <PreferencesContext.Provider value={value}>
      <MotionConfig reducedMotion={reduceMotion ? "always" : "user"}>{children}</MotionConfig>
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesValue {
  const value = useContext(PreferencesContext);
  if (!value) {
    throw new Error("usePreferences must be used inside PreferencesProvider");
  }
  return value;
}
