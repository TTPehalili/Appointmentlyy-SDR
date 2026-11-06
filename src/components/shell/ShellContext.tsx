'use client';

import * as React from 'react';

interface ShellState {
  collapsed: boolean;
  toggleCollapsed: () => void;
  copilotOpen: boolean;
  setCopilotOpen: (open: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
}

const ShellContext = React.createContext<ShellState | null>(null);

const COLLAPSE_KEY = 'sdr_sidebar_collapsed';
const COPILOT_KEY = 'appy_copilot_open';

function isTypingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [copilotOpen, setCopilotOpenState] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  // Restore persisted UI prefs after mount (localStorage is client-only).
  React.useEffect(() => {
    const saved = localStorage.getItem(COLLAPSE_KEY);
    // No saved choice yet: start as an icon rail on tablet widths (768-1023px).
    const c = saved === null ? window.innerWidth < 1024 : saved === 'true';
    const o = localStorage.getItem(COPILOT_KEY) === 'true';
    if (c || o) {
      queueMicrotask(() => {
        setCollapsed(c);
        setCopilotOpenState(o);
      });
    }
  }, []);

  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((prev) => {
      localStorage.setItem(COLLAPSE_KEY, String(!prev));
      return !prev;
    });
  }, []);

  const setCopilotOpen = React.useCallback((open: boolean) => {
    localStorage.setItem(COPILOT_KEY, String(open));
    setCopilotOpenState(open);
  }, []);

  // Global shortcuts: ⌘K palette, ⌘J Copilot, [ collapse sidebar.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (mod && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setCopilotOpenState((o) => {
          localStorage.setItem(COPILOT_KEY, String(!o));
          return !o;
        });
      } else if (!mod && !e.altKey && e.key === '[' && !isTypingTarget(e.target)) {
        e.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleCollapsed]);

  const value = React.useMemo(
    () => ({ collapsed, toggleCollapsed, copilotOpen, setCopilotOpen, paletteOpen, setPaletteOpen }),
    [collapsed, toggleCollapsed, copilotOpen, setCopilotOpen, paletteOpen],
  );
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell() {
  const ctx = React.useContext(ShellContext);
  if (!ctx) throw new Error('useShell must be used inside <ShellProvider>');
  return ctx;
}
