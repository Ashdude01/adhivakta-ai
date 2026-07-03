'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export const THEMES = [
  { id: 'light',     name: 'Light',     swatches: ['#5B4BE6', '#F2A33C', '#FAF8F4', '#FFFFFF'] },
  { id: 'dark',      name: 'Dark',      swatches: ['#8B7CFF', '#F4B05A', '#121020', '#1B1830'] },
  { id: 'aqua',      name: 'Aqua',      swatches: ['#0EA5A5', '#F59E5B', '#F1FAFA', '#FFFFFF'] },
  { id: 'magenta',   name: 'Magenta',   swatches: ['#D6238C', '#7C5CFC', '#FCF5FA', '#FFFFFF'] },
  { id: 'evergreen', name: 'Evergreen', swatches: ['#2F8F4E', '#E0A22B', '#F4F8F1', '#FFFFFF'] },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];
const STORAGE_KEY = 'adhivakta-theme';

type Ctx = { theme: ThemeId; setTheme: (t: ThemeId) => void };
const ThemeContext = createContext<Ctx>({ theme: 'light', setTheme: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>('light');

  useEffect(() => {
    const saved = (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY)) as ThemeId | null;
    if (saved) setThemeState(saved);
  }, []);

  const setTheme = (t: ThemeId) => {
    setThemeState(t);
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(STORAGE_KEY, t); } catch {}
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
