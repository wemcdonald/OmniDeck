import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_KEY = "omnideck-theme";
const SIDEBAR_KEY = "omnideck-sidebar";
const COLLAPSE_BREAKPOINT = 1024;

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function getInitialSidebarCollapsed(): boolean {
  const stored = localStorage.getItem(SIDEBAR_KEY);
  if (stored !== null) return stored === "true";
  return window.innerWidth < COLLAPSE_BREAKPOINT;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(
    getInitialSidebarCollapsed
  );
  // Track whether the user has manually toggled the sidebar
  const [sidebarManual, setSidebarManual] = useState(
    () => localStorage.getItem(SIDEBAR_KEY) !== null
  );

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem(THEME_KEY, t);
    document.documentElement.classList.toggle("dark", t === "dark");
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  const setSidebarCollapsed = useCallback((v: boolean) => {
    setSidebarCollapsedState(v);
    setSidebarManual(true);
    localStorage.setItem(SIDEBAR_KEY, String(v));
  }, []);

  // Apply dark class on mount
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // Auto-collapse sidebar on resize when user hasn't manually overridden
  useEffect(() => {
    if (sidebarManual) return;

    const onResize = () => {
      setSidebarCollapsedState(window.innerWidth < COLLAPSE_BREAKPOINT);
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [sidebarManual]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, toggleTheme, sidebarCollapsed, setSidebarCollapsed }),
    [theme, setTheme, toggleTheme, sidebarCollapsed, setSidebarCollapsed]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
