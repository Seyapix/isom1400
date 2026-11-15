import { useState } from 'react';
import type { ReactNode } from 'react';
import type { LoadIssue } from '../domain/storage.ts';
import { LANGS, SCREENS } from '../domain/types.ts';
import { DICTIONARIES } from '../i18n/index.ts';
import { useWorkspace } from '../workspace.ts';
import type { StorageStatus } from '../App.tsx';
interface ShellProps {
  storageStatus: StorageStatus;
  loadIssue: LoadIssue;
  flash: string | null;
  onClear: () => void;
  children: ReactNode;
}

export function Shell({ storageStatus, loadIssue, flash, onClear, children }: ShellProps) {
  const { d, lang, state, go, setLanguage } = useWorkspace();
  const [confirming, setConfirming] = useState(false);
  const hasCase = state.case !== null;
  const current = hasCase ? state.screen : 'intake';

  const notices = [
    storageStatus === 'memory' && d.storage.memory,
    storageStatus === 'failed' && d.storage.writeFailed,
    loadIssue === 'unreadable' && d.storage.unreadable,
  ].filter((n): n is string => Boolean(n));

  return (
    <div className="min-h-screen flex flex-col">
      <a href="#main" className="skip-link no-print">
        {d.skipLink}
      </a>

      <p className="print-only mx-auto max-w-[42rem] px-5 font-semibold">
        Parapet · {d.appTitle}
      </p>

      <header className="bg-ink text-white on-dark no-print">
        <div className="mx-auto max-w-[42rem] px-5 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[0.9375rem] leading-5 font-bold tracking-[0.12em]">
              Parapet
              <span aria-hidden="true" className="block mt-1 h-[3px] w-9 rounded-full bg-teal-light" />
            </p>
            <p className="mt-1.5 text-[0.9375rem] leading-5 text-white/85 truncate">{d.appTitle}</p>
          </div>
          <div role="group" aria-label={d.languageLabel} className="flex flex-none gap-1.5 no-print">
            {LANGS.map((code) => (
              <button
                key={code}
                type="button"
                lang={DICTIONARIES[code].htmlLang}
                aria-pressed={lang === code}
                onClick={() => setLanguage(code)}
                className={`min-h-[2.5rem] rounded-md border px-3 text-sm font-semibold ${
                  lang === code ? 'bg-white text-ink border-white' : 'border-white/45 text-white hover:border-white'
                }`}
              >
                {DICTIONARIES[code].langName}
              </button>
            ))}
          </div>
        </div>
      </header>

      <nav aria-label={d.nav.label} className="border-b border-line no-print">
        <ol className="mx-auto max-w-[42rem] px-3 grid grid-cols-2 sm:grid-cols-4">
          {SCREENS.map((screen, index) => {
            const enabled = hasCase || screen === 'intake';
            const active = current === screen;
            return (
              <li key={screen}>
                <button
                  type="button"
                  disabled={!enabled}
                  aria-current={active ? 'step' : undefined}
                  title={enabled ? d.nav.full[screen] : d.nav.locked}
                  onClick={() => go(screen)}
                  className={`w-full text-left px-2 py-3 border-b-[3px] text-[0.9375rem] leading-5 whitespace-nowrap disabled:cursor-not-allowed disabled:text-muted/60 ${
                    active ? 'border-teal font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'
                  }`}
                >
                  <span className={`block text-xs font-semibold ${active ? 'text-teal' : ''}`}>{index + 1}</span>
                  {d.nav[screen]}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {(notices.length > 0 || flash) && (
        <div className="mx-auto w-full max-w-[42rem] px-5 pt-6 space-y-3">
          {notices.map((text) => (
            <p key={text} role="alert" className="panel bg-mist text-[0.9375rem]">
              {text}
            </p>
          ))}
          {flash && (
            <p role="status" className="panel bg-wash text-[0.9375rem] font-semibold">
              {flash}
            </p>
          )}
        </div>
      )}

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[42rem] px-5 pt-8 pb-16 flex-1">
        {children}
      </main>

      <footer className="border-t border-line no-print">
        <div className="mx-auto max-w-[42rem] px-5 py-6 flex flex-wrap items-start justify-between gap-4 text-sm text-muted">
          <p className="max-w-[26rem]">{d.footer}</p>
          {confirming ? (
            <div className="panel w-full sm:w-auto sm:max-w-[22rem] text-ink" role="group" aria-label={d.clear.button}>
              <p className="text-[0.9375rem]">{d.clear.confirm}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setConfirming(false);
                    onClear();
                  }}
                >
                  {d.clear.yes}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)}>
                  {d.clear.cancel}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={() => setConfirming(true)}>
              {d.clear.button}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
