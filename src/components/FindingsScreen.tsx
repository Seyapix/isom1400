import { useState } from 'react';
import { SCENARIOS } from '../domain/fixtures.ts';
import { scenarioForCase } from '../domain/live.ts';
import { requestLiveCheck } from '../domain/liveClient.ts';
import { prioritise } from '../domain/priority.ts';
import { reasonLines } from '../domain/report.ts';
import { CHECK_HEADERS, LIVE_SCENARIO_ID } from '../domain/types.ts';
import type { CaseRecord, LiveCheckError, ScenarioId } from '../domain/types.ts';
import { formatDateTime } from '../i18n/index.ts';
import { useWorkspace } from '../workspace.ts';
import { FindingDetail, Evidence } from './FindingDetail.tsx';
import { DefinitionList, EmptyState, LiveMessage, ScreenHeading, Section } from './ui.tsx';

export function CaseSummary({ caseRecord }: { caseRecord: CaseRecord }) {
  const { d } = useWorkspace();
  return (
    <div className="panel">
      <p className="label">{d.findings.caseHeading}</p>
      <DefinitionList
        items={[
          { term: d.findings.charity, value: <span className="font-semibold">{caseRecord.displayName}</span> },
          {
            term: d.findings.exampleUrl,
            value: (
              <span className="font-mono text-[0.9375rem] break-all" translate="no" data-inert-url>
                {caseRecord.exampleUrl}
              </span>
            ),
          },
          { term: d.findings.activities, value: d.list(caseRecord.activities.map((a) => d.activities[a])) },
          { term: d.findings.owner, value: d.changeManagers[caseRecord.changeManager] },
          { term: d.findings.support, value: d.support[caseRecord.support] },
        ]}
      />
    </div>
  );
}

type CheckUi = { kind: 'idle' } | { kind: 'running' } | { kind: 'done' } | { kind: 'error'; error: LiveCheckError };

function LiveCheckPanel({ caseRecord }: { caseRecord: CaseRecord }) {
  const { d, lang, update } = useWorkspace();
  const [ui, setUi] = useState<CheckUi>({ kind: 'idle' });
  const check = caseRecord.liveCheck;
  const running = ui.kind === 'running';

  async function run() {
    if (running) return;
    const url = caseRecord.exampleUrl;
    setUi({ kind: 'running' });
    const outcome = await requestLiveCheck(url);
    if (!outcome.ok) {
      setUi({ kind: 'error', error: outcome.error });
      return;
    }
    update((prev) =>
      prev.case?.exampleUrl === url
        ? { ...prev, case: { ...prev.case, liveCheck: outcome.result, scenarioId: LIVE_SCENARIO_ID } }
        : prev,
    );
    setUi({ kind: 'done' });
  }

  return (
    <section aria-labelledby="live-check-heading" className="mt-8 panel" data-live-check>
      <h2 id="live-check-heading" className="text-xl">
        {d.findings.live.heading}
      </h2>
      <p className="mt-1 text-muted">{d.findings.live.intro}</p>
      {check ? (
        <div className="mt-3">
          <p className="text-[0.9375rem] font-semibold" data-checked-at>
            {d.findings.live.checked(formatDateTime(check.checkedAt, lang))}
          </p>
          <DefinitionList
            items={[
              {
                term: d.findings.live.finalUrl,
                value: (
                  <span className="font-mono text-[0.9375rem] break-all" translate="no" data-final-url>
                    {check.finalUrl}
                  </span>
                ),
              },
              { term: d.findings.live.status, value: String(check.status) },
              { term: d.findings.live.redirects, value: String(check.redirects) },
            ]}
          />
        </div>
      ) : (
        <p className="mt-3 text-[0.9375rem] text-ink-soft">{d.findings.live.notChecked}</p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" onClick={run} disabled={running} aria-describedby="live-check-status">
          {running ? d.findings.live.checking : check ? d.findings.live.again : d.findings.live.button}
        </button>
      </div>
      <div id="live-check-status" className="mt-3">
        {ui.kind === 'error' ? (
          <p role="alert" className="error" data-live-error={ui.error}>
            {d.findings.live.errors[ui.error]}
          </p>
        ) : (
          <LiveMessage
            message={running ? d.findings.live.checking : ui.kind === 'done' ? d.findings.live.done : null}
          />
        )}
      </div>
    </section>
  );
}

export function FindingsScreen() {
  const { d, lang, state, update, go } = useWorkspace();
  const caseRecord = state.case!;
  const scenario = scenarioForCase(caseRecord);
  const result = scenario ? prioritise(scenario.findings, caseRecord.activities) : null;

  const choose = (id: ScenarioId) =>
    update((prev) => ({ ...prev, case: prev.case && { ...prev.case, scenarioId: id } }));

  return (
    <>
      <ScreenHeading title={d.findings.title} />
      <CaseSummary caseRecord={caseRecord} />
      <LiveCheckPanel caseRecord={caseRecord} />

      <fieldset className="mt-8" aria-describedby="scenario-hint">
        <legend className="text-xl font-semibold">{d.findings.scenarioLegend}</legend>
        <p id="scenario-hint" className="hint">
          {d.findings.scenarioHint}
        </p>
        <div className="mt-3 grid gap-2">
          <label
            htmlFor={`scenario-${LIVE_SCENARIO_ID}`}
            className={`choice panel py-3 ${
              !caseRecord.liveCheck
                ? 'cursor-not-allowed text-muted'
                : caseRecord.scenarioId === LIVE_SCENARIO_ID
                  ? 'cursor-pointer border-teal bg-wash'
                  : 'cursor-pointer hover:border-muted'
            }`}
          >
            <input
              id={`scenario-${LIVE_SCENARIO_ID}`}
              type="radio"
              name="scenario"
              checked={caseRecord.scenarioId === LIVE_SCENARIO_ID && caseRecord.liveCheck !== null}
              disabled={!caseRecord.liveCheck}
              onChange={() => choose(LIVE_SCENARIO_ID)}
            />
            <span>
              <span className="block font-semibold">{d.findings.liveOption}</span>
              <span className="block text-[0.9375rem] text-muted">
                {caseRecord.liveCheck ? (
                  <span className="font-mono text-[0.875rem] break-all">{caseRecord.liveCheck.finalUrl}</span>
                ) : (
                  d.findings.liveOptionMissing
                )}
              </span>
            </span>
          </label>
          {SCENARIOS.map((s) => {
            const checked = caseRecord.scenarioId === s.id;
            return (
              <label
                key={s.id}
                htmlFor={`scenario-${s.id}`}
                className={`choice panel cursor-pointer py-3 ${checked ? 'border-teal bg-wash' : 'hover:border-muted'}`}
              >
                <input
                  id={`scenario-${s.id}`}
                  type="radio"
                  name="scenario"
                  checked={checked}
                  onChange={() => choose(s.id)}
                />
                <span>
                  <span className="block font-semibold">
                    {s.organisation[lang]} <span className="status ml-1">{d.findings.fixtureTag}</span>
                  </span>
                  <span className="block text-[0.9375rem] text-muted">
                    {s.pageLabel[lang]} · <span className="font-mono text-[0.875rem]">{s.samplePage}</span>
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {!scenario || !result ? (
        <div className="mt-10">
          <EmptyState>{d.findings.chooseScenario}</EmptyState>
        </div>
      ) : (
        <>
          <Section id="priorities" title={d.findings.prioritiesHeading}>
            <p className="text-muted -mt-1 mb-4">{d.findings.prioritiesIntro}</p>
            {result.priorities.length === 0 ? (
              <EmptyState>{d.findings.noPriorities}</EmptyState>
            ) : (
              <ol className="space-y-4" data-priority-list>
                {result.priorities.map((ranked, index) => {
                  const text = ranked.finding.text[lang];
                  return (
                    <li key={ranked.finding.id} className="panel" data-finding-id={ranked.finding.id}>
                      <p className="label">{d.findings.priorityLabel(index + 1)}</p>
                      <h3 className="mt-1 text-lg">{CHECK_HEADERS[ranked.finding.check]}</h3>
                      <p className="mt-1">
                        <span className="status">{d.configuration[ranked.finding.configuration]}</span>
                      </p>
                      <p className="mt-3">{text.meaning}</p>
                      <h4 className="mt-4 text-[0.9375rem] font-semibold">{d.findings.whySelected}</h4>
                      <ul className="mt-1 list-disc pl-5 text-[0.9375rem] text-ink-soft space-y-0.5">
                        {reasonLines(d, ranked).map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                      <details className="mt-4 border-t border-line pt-3">
                        <summary className="font-semibold text-teal">{d.findings.details}</summary>
                        <div className="mt-2">
                          <FindingDetail ranked={ranked} caseRecord={caseRecord} />
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ol>
            )}
            {result.overflow > 0 && <p className="mt-4 text-[0.9375rem] font-semibold">{d.findings.overflow(result.overflow)}</p>}
          </Section>

          <details className="mt-10 panel" open={result.priorities.length === 0} data-other-observations>
            <summary className="text-lg font-semibold">{d.findings.othersHeading(result.others.length)}</summary>
            <p className="mt-2 text-muted">{d.findings.othersIntro}</p>
            <ul className="mt-4 space-y-6">
              {result.others.map((ranked) => (
                <li key={ranked.finding.id} className="border-t border-line pt-4" data-finding-id={ranked.finding.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-base">{CHECK_HEADERS[ranked.finding.check]}</h3>
                    <span className={`status ${ranked.finding.reviewRequired ? '' : 'status-teal'}`}>
                      {ranked.finding.reviewRequired ? d.findings.outsideShortlist : d.findings.routine}
                    </span>
                  </div>
                  <div className="mt-2">
                    <Evidence ranked={ranked} />
                  </div>
                  <p className="mt-2">{ranked.finding.text[lang].meaning}</p>
                  <details className="mt-2">
                    <summary className="font-semibold text-teal">{d.findings.details}</summary>
                    <div className="mt-2">
                      <FindingDetail ranked={ranked} caseRecord={caseRecord} />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </details>

          <div className="mt-10">
            <button type="button" className="btn btn-primary" onClick={() => go('report')}>
              {d.findings.toReport}
            </button>
          </div>
        </>
      )}
    </>
  );
}
