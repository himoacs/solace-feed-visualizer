import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { TOPIC_PRESETS } from '../lib/topicPresets';

const STORAGE_KEY = 'feed-viz-selected-vertical';

interface VerticalContextValue {
  vertical: string;
  setVertical: (vertical: string) => void;
  verticals: string[];
}

const VerticalContext = createContext<VerticalContextValue | null>(null);

/** The list of verticals is code-defined (same as presets themselves) - the
 * unique `theme` values already present in TOPIC_PRESETS, not something a
 * presenter adds to at runtime. Today that's just "Financial Services". */
function availableVerticals(): string[] {
  return [...new Set(TOPIC_PRESETS.map((p) => p.theme))];
}

function loadStored(verticals: string[]): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && verticals.includes(stored)) return stored;
  } catch {
    // ignore
  }
  return verticals[0] ?? '';
}

export function VerticalProvider({ children }: { children: ReactNode }) {
  const verticals = useMemo(availableVerticals, []);
  const [vertical, setVerticalState] = useState<string>(() => loadStored(verticals));

  const setVertical = useCallback((next: string) => {
    setVerticalState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }
  }, []);

  return (
    <VerticalContext.Provider value={{ vertical, setVertical, verticals }}>{children}</VerticalContext.Provider>
  );
}

export function useVertical(): VerticalContextValue {
  const ctx = useContext(VerticalContext);
  if (!ctx) throw new Error('useVertical must be used within VerticalProvider');
  return ctx;
}
