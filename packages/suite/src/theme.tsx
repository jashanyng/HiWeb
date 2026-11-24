"use client";

import { createBrowserStore, type BrowserStore } from "@jashanyng/hiweb-store/browser-store";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

import { Button } from "./button.js";
import type { ResolvedTheme, ThemeMode } from "./theme-script.js";

interface ThemeContextValue {
  readonly mode: ThemeMode;
  readonly resolved: ResolvedTheme;
  readonly setMode: (mode: ThemeMode) => void;
  readonly cycleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemeMode(raw: unknown): raw is ThemeMode {
  return raw === "light" || raw === "dark" || raw === "system";
}

function getSystemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "light" || mode === "dark") return mode;
  return getSystemPrefersDark() ? "dark" : "light";
}

function applyThemeToDom(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.dataset.theme = resolved;
}

export interface ThemeProviderProps {
  readonly namespace: string;
  readonly storageKey?: string;
  readonly defaultMode?: ThemeMode;
  readonly children: ReactNode;
}

export function ThemeProvider({
  namespace,
  storageKey = "theme",
  defaultMode = "system",
  children,
}: ThemeProviderProps) {
  const store: BrowserStore = useMemo(() => createBrowserStore({ namespace }), [namespace]);

  const themeStore = useMemo(() => {
    const listeners = new Set<() => void>();
    const fullStorageKey = `${namespace.trim()}:${storageKey}`;
    const serverSnapshot = `${defaultMode}:0`;

    const notify = () => {
      for (const listener of listeners) {
        listener();
      }
    };

    return {
      getServerSnapshot: (): string => serverSnapshot,

      getSnapshot: (): string => {
        const saved = store.get(storageKey, (raw) => (isThemeMode(raw) ? raw : null));
        return `${saved ?? defaultMode}:${getSystemPrefersDark() ? "1" : "0"}`;
      },

      subscribe: (listener: () => void): (() => void) => {
        listeners.add(listener);
        if (typeof window === "undefined") {
          return () => {
            listeners.delete(listener);
          };
        }

        const mq = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
        const onMediaChange = () => notify();
        const onStorage = (event: StorageEvent) => {
          if (event.key === null || event.key === fullStorageKey) {
            notify();
          }
        };

        mq?.addEventListener("change", onMediaChange);
        window.addEventListener("storage", onStorage);
        return () => {
          listeners.delete(listener);
          mq?.removeEventListener("change", onMediaChange);
          window.removeEventListener("storage", onStorage);
        };
      },

      writeMode: (next: ThemeMode): void => {
        store.set(storageKey, next);
        applyThemeToDom(resolveTheme(next));
        notify();
      },
    };
  }, [store, namespace, storageKey, defaultMode]);

  const snapshot = useSyncExternalStore(themeStore.subscribe, themeStore.getSnapshot, themeStore.getServerSnapshot);
  const [rawMode, rawSystemDark] = snapshot.split(":");
  const mode: ThemeMode = isThemeMode(rawMode) ? rawMode : defaultMode;
  const systemDark = rawSystemDark === "1";

  const resolved: ResolvedTheme = mode === "system" ? (systemDark ? "dark" : "light") : mode;

  useEffect(() => {
    applyThemeToDom(resolved);
  }, [resolved]);

  const setMode = useCallback(
    (next: ThemeMode) => {
      themeStore.writeMode(next);
    },
    [themeStore],
  );

  const cycleMode = useCallback(() => {
    const next: ThemeMode = mode === "light" ? "dark" : mode === "dark" ? "system" : "light";
    setMode(next);
  }, [mode, setMode]);

  const value = useMemo(() => ({ mode, resolved, setMode, cycleMode }), [mode, resolved, setMode, cycleMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside a ThemeProvider");
  }
  return ctx;
}

export interface SuiteThemeToggleProps {
  readonly className?: string;
  readonly showLabel?: boolean;
  readonly labels?: Readonly<Record<ThemeMode, string>>;
  readonly ariaLabel?: string;
  readonly binaryOnly?: boolean;
}

const DEFAULT_THEME_LABELS: Readonly<Record<ThemeMode, string>> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

export function SuiteThemeToggle({
  className,
  showLabel = false,
  labels = DEFAULT_THEME_LABELS,
  ariaLabel = "Toggle theme",
  binaryOnly = false,
}: SuiteThemeToggleProps) {
  const { mode, resolved, setMode, cycleMode } = useTheme();
  const displayMode: ThemeMode = binaryOnly ? resolved : mode;

  const handleClick = () => {
    if (binaryOnly) {
      setMode(resolved === "dark" ? "light" : "dark");
    } else {
      cycleMode();
    }
  };

  const Icon = displayMode === "dark" ? MoonIcon : displayMode === "light" ? SunIcon : MonitorIcon;

  return (
    <Button
      type="button"
      variant="outline"
      size={showLabel ? "sm" : "icon-sm"}
      onClick={handleClick}
      aria-label={`${ariaLabel}: ${labels[displayMode]}`}
      title={labels[displayMode]}
      className={className}
    >
      <Icon aria-hidden="true" className="size-4" />
      {showLabel ? <span>{labels[displayMode]}</span> : null}
    </Button>
  );
}
