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

const STORAGE_KEY = "clouddeck.reduce-motion";

interface PreferencesValue {
  reduceMotion: boolean;
  setReduceMotion: (value: boolean) => void;
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [reduceMotion, setReduceMotionState] = useState(false);

  useEffect(() => {
    try {
      setReduceMotionState(window.localStorage.getItem(STORAGE_KEY) === "true");
    } catch {
      // Storage can be blocked; keep the default (follow the OS setting).
    }
  }, []);

  const setReduceMotion = useCallback((value: boolean) => {
    setReduceMotionState(value);
    document.documentElement.dataset.reduceMotion = value ? "true" : "false";
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    } catch {
      // The preference still applies to this page view.
    }
  }, []);

  const value = useMemo(
    () => ({ reduceMotion, setReduceMotion }),
    [reduceMotion, setReduceMotion],
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
