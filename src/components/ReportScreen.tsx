import { useEffect, useRef, useState } from 'react';
import { scenarioForCase } from '../domain/live.ts';
import { buildCopyText, buildRequest, presentedFindings, scopeText } from '../domain/report.ts';
import { CHECK_HEADERS, draftKey } from '../domain/types.ts';
import { TEXT_MAX } from '../domain/validation.ts';
import { formatDate, formatDateTime } from '../i18n/index.ts';
import { useWorkspace } from '../workspace.ts';
import { Evidence } from './FindingDetail.tsx';
import { DefinitionList, EmptyState, LiveMessage, ScreenHeading, Section } from './ui.tsx';

type CopyState = { kind: 'idle' } | { kind: 'copied' } | { kind: 'failed'; text: string };

export function ReportScreen() {
  const { d, lang, state, update, go } = useWorkspace();
  const [copy, setCopy] = useState<CopyState>({ kind: 'idle' });
  const manualRef = useRef<HTMLTextAreaElement>(null);
  const caseRecord = state.case!;
  const scenario = scenarioForCase(caseRecord);

  useEffect(() => setCopy({ kind: 'idle' }), [lang, scenario?.id]);

  useEffect(() => {
    if (copy.kind === 'failed') {
      manualRef.current?.focus();
      manualRef.current?.select();
    }
  }, [copy]);

  if (!scenario) {
    return (
      <>
        <ScreenHeading title={d.report.title} />
        <EmptyState>{d.report.needScenario}</EmptyState>
        <button type="button" className="btn btn-primary mt-6" onClick={() => go('findings')}>
          {d.report.goFindings}
        </button>
      </>
    );
  }

  const { priorities } = presentedFindings(caseRecord, scenario);
  const live = scenario.source === 'live';
  const noteOnly = live && caseRecord.siteControl !== 'charity';
  const key = draftKey(caseRecord.id, scenario.id, lang);
  const stored = state.drafts[key];
  const draft = stored ?? buildRequest(d, lang, caseRecord, scenario, priorities);
  const edited = stored !== undefined;

  const setDraft = (value: string) => {
    setCopy({ kind: 'idle' });
    update((prev) => ({ ...prev, drafts: { ...prev.drafts, [key]: value } }));
  };

  const resetDraft = () => {
    setCopy({ kind: 'idle' });
    update((prev) => {
      const drafts = { ...prev.drafts };
      delete drafts[key];
      return { ...prev, drafts };
    });
  };

  async function copyRequest() {
    const text = buildCopyText(d, lang, caseRecord, scenario!, draft);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      setCopy({ kind: 'copied' });
    } catch {
      setCopy({ kind: 'failed', text });
    }
  }

  return (
    <article>
      <ScreenHeading title={d.report.title} intro={scopeText(d, lang, caseRecord, scenario)} />

      <Section id="scope" title={d.report.scope} className="mt-0">
        <div className="panel print-plain">
          <DefinitionList
            items={[
              { term: d.report.charity, value: <span className="font-semibold">{caseRecord.displayName}</span> },
              {
                term: d.report.exampleUrl,
                value: (
                  <span className="font-mono text-[0.9375rem] break-all" translate="no" data-inert-url>
                    {caseRecord.exampleUrl}
                  </span>
                ),
              },
              { term: d.report.activities, value: d.list(caseRecord.activities.map((a) => d.activities[a])) },
              { term: d.report.siteControl, value: d.siteControl[caseRecord.siteControl] },
              {
                term: d.report.scenario,
                value:
                  scenario.source === 'live' && caseRecord.liveCheck
                    ? `${d.report.liveSource} · ${formatDateTime(caseRecord.liveCheck.checkedAt, lang)}`
                    : `${d.findings.fixtureTag} · ${scenario.organisation[lang]}`,
              },
              {
                term: d.report.samplePage,
                value: (
                  <>
                    {scenario.pageLabel[lang]} · <span className="font-mono text-[0.875rem]">{scenario.samplePage}</span>
                  </>
                ),
              },
              { term: d.report.prepared, value: formatDate(new Date().toISOString(), lang) },
            ]}
          />
        </div>
      </Section>

      <Section id="limitations" title={d.report.limitations}>
        {scenario.source === 'fixture' && <p className="mb-3">{d.report.fixtureAssumesControl}</p>}
        <ul className="list-disc pl-5 space-y-1">
          {(scenario.source === 'live' ? d.report.limitationsLive : d.report.limitationsFixture).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Section>

      <Section id="observations" title={d.report.observations}>
        <ul className="border-t border-line">
          {scenario.findings.map((finding) => (
            <li key={finding.id} className="border-b border-line py-3 keep-together">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-base">{CHECK_HEADERS[finding.check]}</h3>
                <span className="text-[0.875rem] font-semibold text-muted">{d.configuration[finding.configuration]}</span>
              </div>
              <div className="mt-1.5">
                <Evidence ranked={{ finding, matchedActivities: [] }} />
              </div>
              <p className="mt-1.5 text-[0.9375rem]">{finding.text[lang].meaning}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="report-priorities" title={live ? d.findings.questionsHeading : d.report.priorities}>
        {priorities.length === 0 ? (
          <EmptyState>
            {live
              ? caseRecord.siteControl === 'platform'
                ? d.findings.platformNone
                : caseRecord.siteControl === 'unsure'
                  ? d.findings.unsureNone
                  : d.findings.noLiveQuestions
              : d.report.noPriorities}
          </EmptyState>
        ) : (
          <ol className="space-y-3">
            {priorities.map((ranked, index) => (
              <li key={ranked.finding.id} className="panel print-plain keep-together">
                <p className="label">{live ? d.findings.questionLabel : d.findings.priorityLabel(index + 1)}</p>
                <h3 className="mt-1 text-base">{CHECK_HEADERS[ranked.finding.check]}</h3>
                <p className="mt-1.5">{ranked.finding.text[lang].meaning}</p>
                <p className="mt-1.5 text-ink-soft">{ranked.finding.text[lang].request}</p>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section id="request" title={noteOnly ? d.report.note : d.report.request}>
        <p id="request-hint" className="hint no-print -mt-1 mb-3">
          {noteOnly ? d.report.noteHint : d.report.requestHint}
        </p>
        <div className="flex items-baseline justify-between gap-3 no-print">
          <label htmlFor="request-draft" className="font-semibold">
            {noteOnly ? d.report.noteLabel : d.report.requestLabel}
          </label>
          <span className={`status ${edited ? '' : 'status-teal'}`}>{edited ? d.report.edited : d.report.generated}</span>
        </div>
        <textarea
          id="request-draft"
          className="field mt-2 min-h-[22rem] leading-relaxed no-print"
          value={draft}
          maxLength={TEXT_MAX * 4}
          aria-describedby="request-hint"
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="print-only draft-print" data-print-draft>
          {draft}
        </div>

        <div className="mt-4 flex flex-wrap gap-3 no-print">
          <button type="button" className="btn btn-primary" onClick={copyRequest}>
            {noteOnly ? d.report.copyNote : d.report.copy}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
            {d.report.print}
          </button>
          <button type="button" className="btn btn-secondary" onClick={resetDraft} disabled={!edited}>
            {d.report.reset}
          </button>
        </div>
        <div className="mt-3 no-print">
          <LiveMessage
            message={copy.kind === 'copied' ? (noteOnly ? d.report.copiedNote : d.report.copied) : copy.kind === 'failed' ? d.report.copyFailed : null}
          />
        </div>
        {copy.kind === 'failed' && (
          <div className="mt-2 no-print">
            <label htmlFor="manual-copy" className="font-semibold">
              {d.report.manualCopyLabel}
            </label>
            <textarea
              id="manual-copy"
              ref={manualRef}
              readOnly
              className="field mt-2 min-h-[16rem]"
              value={copy.text}
            />
          </div>
        )}
      </Section>
    </article>
  );
}
