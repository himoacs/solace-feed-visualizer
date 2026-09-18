import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { TopicTaxonomyVariable } from '@feed-viz/shared';
import { DEFAULT_TAXONOMY_VARIABLES } from '../lib/topicTaxonomy';

const STORAGE_KEY = 'feed-viz-taxonomy-variables';

interface TaxonomyContextValue {
  variables: TopicTaxonomyVariable[];
  upsertVariable: (variable: TopicTaxonomyVariable) => void;
  deleteVariable: (name: string) => void;
  resetToDefaults: () => void;
  replaceAll: (variables: TopicTaxonomyVariable[]) => void;
}

const TaxonomyContext = createContext<TaxonomyContextValue | null>(null);

function loadStored(): TopicTaxonomyVariable[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore
  }
  return DEFAULT_TAXONOMY_VARIABLES;
}

function persist(variables: TopicTaxonomyVariable[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(variables));
  } catch {
    // ignore storage errors
  }
}

export function TaxonomyProvider({ children }: { children: ReactNode }) {
  const [variables, setVariables] = useState<TopicTaxonomyVariable[]>(loadStored);

  const upsertVariable = useCallback((variable: TopicTaxonomyVariable) => {
    setVariables((prev) => {
      const next = prev.some((v) => v.name === variable.name)
        ? prev.map((v) => (v.name === variable.name ? variable : v))
        : [...prev, variable];
      persist(next);
      return next;
    });
  }, []);

  const deleteVariable = useCallback((name: string) => {
    setVariables((prev) => {
      const next = prev.filter((v) => v.name !== name);
      persist(next);
      return next;
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    setVariables(DEFAULT_TAXONOMY_VARIABLES);
    persist(DEFAULT_TAXONOMY_VARIABLES);
  }, []);

  /** Bulk-replace, e.g. when importing a saved scenario. */
  const replaceAll = useCallback((next: TopicTaxonomyVariable[]) => {
    setVariables(next);
    persist(next);
  }, []);

  return (
    <TaxonomyContext.Provider value={{ variables, upsertVariable, deleteVariable, resetToDefaults, replaceAll }}>
      {children}
    </TaxonomyContext.Provider>
  );
}

export function useTaxonomy(): TaxonomyContextValue {
  const ctx = useContext(TaxonomyContext);
  if (!ctx) throw new Error('useTaxonomy must be used within TaxonomyProvider');
  return ctx;
}
