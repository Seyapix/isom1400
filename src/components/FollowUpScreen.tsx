import { useState } from 'react';
import type { FormEvent } from 'react';
import { emptyAction, isOutstanding, nextStepKey, normaliseAction } from '../domain/followup.ts';
import { scenarioForCase } from '../domain/live.ts';
import { prioritise } from '../domain/priority.ts';
import type { RankedFinding } from '../domain/priority.ts';
import { ACTION_STATUSES, actionKey, CHECK_HEADERS, handoverKey, RECHECK_OUTCOMES } from '../domain/types.ts';
import type { ActionRecord, ActionStatus, CaseRecord, HandoverRecord, RecheckOutcome } from '../domain/types.ts';
import { ACTION_FIELD_ORDER, localIsoDate, TEXT_MAX, validateAction } from '../domain/validation.ts';
import type { ActionError, ActionField } from '../domain/validation.ts';
import type { Dictionary } from '../i18n/index.ts';
import { formatDate, formatDateTime } from '../i18n/index.ts';
import { useWorkspace } from '../workspace.ts';
import { describedBy, EmptyState, FieldError, LiveMessage, ScreenHeading, Section } from './ui.tsx';

interface Tracked {
  ranked: RankedFinding;
  priority: number | null;
  key: string;
  saved: ActionRecord | undefined;
}

export function nextActionText(d: Dictionary, action: ActionRecord, caseRecord: CaseRecord): string {
  switch (action.status) {
    case 'awaiting':
      return d.followup.next.awaiting(d.nextSteps[nextStepKey(caseRecord.support)]);
    case 'accepted':
      return d.followup.next.accepted;
    case 'deferred':
      return d.followup.next.deferred(action.deferralReason);
    case 'implemented':
      return d.followup.next.implemented;
    case 'rechecked':
      return action.recheckOutcome === 'inconclusive' ? d.followup.next.inconclusive : d.followup.next.unchanged;
  }
}

export function FollowUpScreen() {
  const { d, lang, state, go } = useWorkspace();
  const caseRecord = state.case!;
  const scenario = scenarioForCase(caseRecord);

  if (!scenario) {
    return (
      <>
        <ScreenHeading title={d.followup.title} />
        <EmptyState>{d.report.needScenario}</EmptyState>
        <button type="button" className="btn btn-primary mt-6" onClick={() => go('findings')}>
          {d.report.goFindings}
        </button>
      </>
    );
  }

  const { priorities, others } = prioritise(scenario.findings, caseRecord.activities);
  const tracked: Tracked[] = [
    ...priorities.map((ranked, i) => ({ ranked, priority: i + 1 })),
    ...others.filter((r) => r.finding.reviewRequired).map((ranked) => ({ ranked, priority: null })),
  ].map((t) => {
    const key = actionKey(caseRecord.id, scenario.id, t.ranked.finding.id);
    return { ...t, key, saved: state.actions[key] };
  });
  const defaultRole = d.owners[caseRecord.changeManager];

  return (
    <>
      <ScreenHeading
        title={d.followup.title}
        intro={`${scenario.organisation[lang]} · ${scenario.pageLabel[lang]}`}
        aside={<p className="mt-3 panel bg-mist text-[0.9375rem]">{d.followup.simulated}</p>}
      />

      <section aria-labelledby="actions-heading" className="no-print">
        <h2 id="actions-heading" className="text-xl mb-3">
          {d.followup.actionsHeading}
        </h2>
        {tracked.length === 0 ? (
          <EmptyState>{d.followup.noActions}</EmptyState>
        ) : (
          <div className="space-y-5">
            {tracked.map((t) => (
              <ActionEditor key={t.key} tracked={t} defaultRole={defaultRole} />
            ))}
          </div>
        )}
      </section>

      <Handover tracked={tracked} caseRecord={caseRecord} defaultRole={defaultRole} />
    </>
  );
}

type ActionErrors = Partial<Record<ActionField, ActionError>>;

function ActionEditor({ tracked, defaultRole }: { tracked: Tracked; defaultRole: string }) {
  const { d, lang, update } = useWorkspace();
  const { ranked, priority, key, saved } = tracked;
  const [draft, setDraft] = useState<ActionRecord>(() => saved ?? emptyAction(''));
  const [roleEdited, setRoleEdited] = useState(Boolean(saved));
  const [errors, setErrors] = useState<ActionErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const id = (field: string) => `${ranked.finding.id}-${field}`;
  const form = roleEdited ? draft : { ...draft, role: defaultRole };

  const set = <K extends keyof ActionRecord>(field: K, value: ActionRecord[K]) => {
    const next = { ...form, [field]: value };
    if (field === 'role') setRoleEdited(true);
    setDraft(next);
    setMessage(null);
    if (attempted) setErrors(validateAction(next, localIsoDate()));
  };

  const errorText = (field: ActionField) => {
    const code = errors[field];
    return code ? d.actionErrors[code] : undefined;
  };

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setAttempted(true);
    const found = validateAction(form, localIsoDate());
    setErrors(found);
    const first = ACTION_FIELD_ORDER.find((f) => found[f]);
    if (first) {
      setMessage(d.followup.notSaved);
      document.getElementById(id(first))?.focus();
      return;
    }
    const record = normaliseAction(form, new Date().toISOString());
    setDraft(record);
    setRoleEdited(true);
    update((prev) => ({ ...prev, actions: { ...prev.actions, [key]: record } }));
    setMessage(d.followup.saved);
  }

  const savedStatus = saved?.status ?? 'awaiting';
  const inputProps = (field: ActionField, hint?: string) => ({
    id: id(field),
    'aria-invalid': Boolean(errors[field]),
    'aria-describedby': describedBy(hint, errors[field] && id(`${field}-error`)),
  });

  return (
    <form noValidate onSubmit={onSubmit} className="panel" data-action-for={ranked.finding.id}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="label">{priority ? d.followup.priorityTag(priority) : d.followup.otherTag}</p>
          <h3 className="mt-1 text-lg">{CHECK_HEADERS[ranked.finding.check]}</h3>
        </div>
        <span className="status" data-saved-status>
          {d.followup.statuses[savedStatus]}
          {saved?.status === 'rechecked' && saved.recheckOutcome ? ` · ${d.followup.outcomes[saved.recheckOutcome]}` : ''}
        </span>
      </div>
      <p className="mt-1 text-[0.875rem] text-muted">
        {saved?.updatedAt ? d.followup.lastSaved(formatDateTime(saved.updatedAt, lang)) : d.followup.neverSaved}
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={id('status')} className="font-semibold">
            {d.followup.status}
          </label>
          <select
            id={id('status')}
            className="field mt-1.5"
            value={form.status}
            onChange={(e) => set('status', e.target.value as ActionStatus)}
          >
            {ACTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {d.followup.statuses[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={id('role')} className="font-semibold">
            {d.followup.role}
          </label>
          <input
            {...inputProps('role')}
            className="field mt-1.5"
            type="text"
            maxLength={TEXT_MAX}
            value={form.role}
            onChange={(e) => set('role', e.target.value)}
          />
          <FieldError id={id('role-error')} message={errorText('role')} />
        </div>
      </div>

      {form.status === 'deferred' && (
        <div className="mt-4">
          <label htmlFor={id('deferralReason')} className="font-semibold">
            {d.followup.deferralReason}
          </label>
          <textarea
            {...inputProps('deferralReason')}
            className="field mt-1.5"
            maxLength={TEXT_MAX}
            value={form.deferralReason}
            onChange={(e) => set('deferralReason', e.target.value)}
          />
          <FieldError id={id('deferralReason-error')} message={errorText('deferralReason')} />
        </div>
      )}

      {form.status === 'rechecked' && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={id('recheckDate')} className="font-semibold">
              {d.followup.recheckDate}
            </label>
            <input
              {...inputProps('recheckDate')}
              className="field mt-1.5"
              type="date"
              max={localIsoDate()}
              value={form.recheckDate}
              onChange={(e) => set('recheckDate', e.target.value)}
            />
            <FieldError id={id('recheckDate-error')} message={errorText('recheckDate')} />
          </div>
          <div>
            <label htmlFor={id('recheckOutcome')} className="font-semibold">
              {d.followup.recheckOutcome}
            </label>
            <select
              {...inputProps('recheckOutcome')}
              className="field mt-1.5"
              value={form.recheckOutcome}
              onChange={(e) => set('recheckOutcome', e.target.value as RecheckOutcome | '')}
            >
              <option value="">{d.followup.outcomePlaceholder}</option>
              {RECHECK_OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {d.followup.outcomes[o]}
                </option>
              ))}
            </select>
            <FieldError id={id('recheckOutcome-error')} message={errorText('recheckOutcome')} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor={id('recheckEvidence')} className="font-semibold">
              {d.followup.recheckEvidence}
            </label>
            <p id={id('recheckEvidence-hint')} className="hint">
              {d.followup.recheckEvidenceHint}
            </p>
            <textarea
              {...inputProps('recheckEvidence', id('recheckEvidence-hint'))}
              className="field mt-1.5"
              maxLength={TEXT_MAX}
              value={form.recheckEvidence}
              onChange={(e) => set('recheckEvidence', e.target.value)}
            />
            <FieldError id={id('recheckEvidence-error')} message={errorText('recheckEvidence')} />
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={id('followUpDate')} className="font-semibold">
            {d.followup.followUpDate}
          </label>
          <input
            {...inputProps('followUpDate')}
            className="field mt-1.5"
            type="date"
            value={form.followUpDate}
            onChange={(e) => set('followUpDate', e.target.value)}
          />
          <FieldError id={id('followUpDate-error')} message={errorText('followUpDate')} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={id('notes')} className="font-semibold">
            {d.followup.notes}
          </label>
          <textarea
            {...inputProps('notes')}
            className="field mt-1.5"
            maxLength={TEXT_MAX}
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
          <FieldError id={id('notes-error')} message={errorText('notes')} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button type="submit" className="btn btn-primary">
          {d.followup.save}
        </button>
        <LiveMessage message={message} />
      </div>
    </form>
  );
}

function Handover({ tracked, caseRecord, defaultRole }: { tracked: Tracked[]; caseRecord: CaseRecord; defaultRole: string }) {
  const { d, lang, state, update } = useWorkspace();
  const key = handoverKey(caseRecord.id, caseRecord.scenarioId!);
  const saved = state.handover[key];
  const [form, setForm] = useState<HandoverRecord>(() => saved ?? { flowTester: '', recordKeeper: '' });
  const [message, setMessage] = useState<string | null>(null);

  const rows = tracked.map((t) => ({ ...t, action: t.saved ?? emptyAction(defaultRole) }));
  const outstanding = rows.filter((r) => isOutstanding(r.action));
  const completed = rows.filter((r) => !isOutstanding(r.action));

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const record = { flowTester: form.flowTester.trim(), recordKeeper: form.recordKeeper.trim() };
    setForm(record);
    update((prev) => ({ ...prev, handover: { ...prev.handover, [key]: record } }));
    setMessage(d.followup.handoverSaved);
  }

  return (
    <Section id="handover" title={d.followup.handoverHeading} className="mt-12">
      <p className="text-muted -mt-1 mb-5">{d.followup.handoverIntro}</p>

      <form noValidate onSubmit={onSubmit} className="panel no-print">
        <div className="grid gap-4">
          {(['flowTester', 'recordKeeper'] as const).map((field) => (
            <div key={field}>
              <label htmlFor={`handover-${field}`} className="font-semibold">
                {d.followup[field]}
              </label>
              <input
                id={`handover-${field}`}
                className="field mt-1.5"
                type="text"
                maxLength={TEXT_MAX}
                value={form[field]}
                onChange={(e) => {
                  setMessage(null);
                  setForm({ ...form, [field]: e.target.value });
                }}
              />
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button type="submit" className="btn btn-secondary">
            {d.followup.saveHandover}
          </button>
          <LiveMessage message={message} />
        </div>
      </form>

      <div className="mt-6 panel print-plain" data-handover>
        <dl className="dl-grid">
          <div className="!border-t-0 !pt-0">
            <dt>{d.followup.flowTester}</dt>
            <dd>{saved?.flowTester || d.followup.notRecorded}</dd>
          </div>
          <div>
            <dt>{d.followup.recordKeeper}</dt>
            <dd>{saved?.recordKeeper || d.followup.notRecorded}</dd>
          </div>
        </dl>

        <h3 className="mt-6 text-lg">{d.followup.outstanding}</h3>
        {outstanding.length === 0 ? (
          <p className="mt-2 text-muted">{d.followup.noOutstanding}</p>
        ) : (
          <ul className="mt-2 space-y-3" data-outstanding>
            {outstanding.map((r) => (
              <li key={r.key} className="border-t border-line pt-3" data-finding-id={r.ranked.finding.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h4 className="font-semibold">{CHECK_HEADERS[r.ranked.finding.check]}</h4>
                  <span className="status">
                    {d.followup.statuses[r.action.status]}
                    {r.action.recheckOutcome ? ` · ${d.followup.outcomes[r.action.recheckOutcome]}` : ''}
                  </span>
                </div>
                <dl className="mt-1 grid gap-x-4 gap-y-1 text-[0.9375rem] sm:grid-cols-[9rem_1fr]">
                  <dt className="text-muted font-semibold">{d.followup.owner}</dt>
                  <dd>{r.action.role}</dd>
                  <dt className="text-muted font-semibold">{d.followup.revisit}</dt>
                  <dd>{r.action.followUpDate ? formatDate(r.action.followUpDate, lang) : d.followup.noDate}</dd>
                  <dt className="text-muted font-semibold">{d.followup.nextAction}</dt>
                  <dd>{nextActionText(d, r.action, caseRecord)}</dd>
                  {r.action.status === 'rechecked' && (
                    <>
                      <dt className="text-muted font-semibold">{d.followup.recheckDate}</dt>
                      <dd>
                        {formatDate(r.action.recheckDate, lang)} · {r.action.recheckEvidence}
                      </dd>
                    </>
                  )}
                </dl>
              </li>
            ))}
          </ul>
        )}

        {completed.length > 0 && (
          <>
            <h3 className="mt-6 text-lg">{d.followup.completed}</h3>
            <ul className="mt-2 space-y-2">
              {completed.map((r) => (
                <li key={r.key} className="border-t border-line pt-2 text-[0.9375rem]">
                  <span className="font-semibold">{CHECK_HEADERS[r.ranked.finding.check]}</span> ·{' '}
                  {formatDate(r.action.recheckDate, lang)} · {r.action.recheckEvidence} · {r.action.role}
                </li>
              ))}
            </ul>
          </>
        )}

        <h3 className="mt-6 text-lg">{d.followup.maintenance}</h3>
        <ul className="mt-2 list-disc pl-5 space-y-1 text-[0.9375rem]">
          {d.followup.maintenanceItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="mt-5 text-[0.9375rem] text-ink-soft">{d.followup.storageNote}</p>
      </div>

      <button type="button" className="btn btn-secondary mt-5 no-print" onClick={() => window.print()}>
        {d.followup.print}
      </button>
    </Section>
  );
}
