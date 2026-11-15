import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createStorage, initialState } from './domain/storage.ts';
import type { LoadIssue } from './domain/storage.ts';
import type { AppState, Lang, Screen } from './domain/types.ts';
import { DICTIONARIES } from './i18n/index.ts';
import { Shell } from './components/Shell.tsx';
import { IntakeScreen } from './components/IntakeScreen.tsx';
import { FindingsScreen } from './components/FindingsScreen.tsx';
import { ReportScreen } from './components/ReportScreen.tsx';
import { FollowUpScreen } from './components/FollowUpScreen.tsx';
import { WorkspaceContext } from './workspace.ts';
import type { Workspace } from './workspace.ts';

export type StorageStatus = 'local' | 'memory' | 'failed';

function boot() {
  const adapter = createStorage(() => window.localStorage);
  const loaded = adapter.load();
  return { adapter, loaded };
}

export function App() {
  const [{ adapter, loaded }] = useState(boot);
  const [state, setState] = useState<AppState>(loaded.state);
  const [storageStatus, setStorageStatus] = useState<StorageStatus>(adapter.mode);
  const [loadIssue, setLoadIssue] = useState<LoadIssue>(loaded.issue);
  const [flash, setFlash] = useState<string | null>(null);
  const dirty = useRef(false);
  const [focusRequest, setFocusRequest] = useState(0);

  const lang = state.uiLanguage;
  const d = DICTIONARIES[lang];

  useEffect(() => {
    if (!dirty.current || storageStatus !== 'local') return;
    if (!adapter.save(state)) setStorageStatus('failed');
  }, [adapter, state, storageStatus]);

  useEffect(() => {
    document.documentElement.lang = d.htmlLang;
    document.title = `${d.appTitle} · Parapet`;
  }, [d]);

  useEffect(() => {
    if (focusRequest > 0) document.getElementById('screen-heading')?.focus();
  }, [focusRequest]);

  const update = useCallback((recipe: (prev: AppState) => AppState) => {
    dirty.current = true;
    setFlash(null);
    setState(recipe);
  }, []);

  const go = useCallback(
    (screen: Screen) => {
      update((prev) => ({ ...prev, screen: prev.case || screen === 'intake' ? screen : 'intake' }));
      setFocusRequest((n) => n + 1);
    },
    [update],
  );

  const setLanguage = useCallback((next: Lang) => update((prev) => ({ ...prev, uiLanguage: next })), [update]);

  const clearAll = useCallback(() => {
    adapter.clear();
    dirty.current = false;
    setFocusRequest((n) => n + 1);
    setLoadIssue(null);
    setState(initialState(lang));
    setFlash(DICTIONARIES[lang].clear.done);
  }, [adapter, lang]);

  const workspace = useMemo<Workspace>(
    () => ({ state, lang, d, update, go, setLanguage }),
    [state, lang, d, update, go, setLanguage],
  );

  const screen = state.case ? state.screen : 'intake';

  return (
    <WorkspaceContext.Provider value={workspace}>
      <Shell storageStatus={storageStatus} loadIssue={loadIssue} flash={flash} onClear={clearAll}>
        {screen === 'intake' && <IntakeScreen key={state.case?.id ?? 'new'} />}
        {screen === 'findings' && <FindingsScreen />}
        {screen === 'report' && <ReportScreen />}
        {screen === 'followup' && <FollowUpScreen />}
      </Shell>
    </WorkspaceContext.Provider>
  );
}
