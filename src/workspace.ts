import { createContext, useContext } from 'react';
import type { AppState, Lang, Screen } from './domain/types.ts';
import type { Dictionary } from './i18n/index.ts';

export interface Workspace {
  state: AppState;
  lang: Lang;
  d: Dictionary;
  update: (recipe: (prev: AppState) => AppState) => void;
  go: (screen: Screen) => void;
  setLanguage: (lang: Lang) => void;
}

export const WorkspaceContext = createContext<Workspace | null>(null);

export function useWorkspace(): Workspace {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('Workspace context is missing');
  return value;
}
