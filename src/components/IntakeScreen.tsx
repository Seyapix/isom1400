import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { withoutLive } from '../domain/live.ts';
import { ACTIVITIES, CHANGE_MANAGERS, LANGS, LIVE_SCENARIO_ID, SITE_CONTROLS, SUPPORT_LEVELS } from '../domain/types.ts';
import type { Activity, CaseRecord } from '../domain/types.ts';
import { INTAKE_FIELD_ORDER, NAME_MAX, URL_MAX, validateIntake } from '../domain/validation.ts';
import type { IntakeError, IntakeField, IntakeForm } from '../domain/validation.ts';
import { DICTIONARIES } from '../i18n/index.ts';
import { useWorkspace } from '../workspace.ts';
import { describedBy, FieldError, LiveMessage, ScreenHeading } from './ui.tsx';

type Errors = Partial<Record<IntakeField, IntakeError>>;

const FIRST_INPUT: Record<IntakeField, string> = {
  displayName: 'intake-displayName',
  exampleUrl: 'intake-exampleUrl',
  siteControl: 'intake-siteControl-0',
  language: 'intake-language-0',
  activities: 'intake-activities-0',
  changeManager: 'intake-changeManager-0',
  support: 'intake-support-0',
  acknowledged: 'intake-acknowledged',
};

function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `case-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function IntakeScreen() {
  const { d, lang, state, update, go } = useWorkspace();
  const existing = state.case;
  const [form, setForm] = useState<IntakeForm>(() =>
    existing
      ? {
          displayName: existing.displayName,
          exampleUrl: existing.exampleUrl,
          language: existing.language,
          activities: [...existing.activities],
          siteControl: existing.siteControl,
          changeManager: existing.changeManager,
          support: existing.support,
          acknowledged: true,
        }
      : {
          displayName: '',
          exampleUrl: '',
          language: lang,
          activities: [],
          siteControl: '',
          changeManager: '',
          support: '',
          acknowledged: false,
        },
  );
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const set = <K extends keyof IntakeForm>(key: K, value: IntakeForm[K]) => {
    const next = { ...form, [key]: value };
    setForm(next);
    setMessage(null);
    if (submitted) setErrors(validateIntake(next));
  };

  const errorText = (field: IntakeField) => {
    const code = errors[field];
    return code ? d.intakeErrors[code] : undefined;
  };

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const found = validateIntake(form);
    setErrors(found);
    setSubmitted(true);
    const first = INTAKE_FIELD_ORDER.find((f) => found[f]);
    if (first) {
      setMessage(null);
      document.getElementById(FIRST_INPUT[first])?.focus();
      return;
    }
    const fields = {
      displayName: form.displayName.trim(),
      exampleUrl: form.exampleUrl.trim(),
      language: form.language as CaseRecord['language'],
      activities: ACTIVITIES.filter((a) => form.activities.includes(a)),
      siteControl: form.siteControl as CaseRecord['siteControl'],
      changeManager: form.changeManager as CaseRecord['changeManager'],
      support: form.support as CaseRecord['support'],
    };
    if (existing) {
      update((prev) => {
        if (!prev.case) return prev;
        const urlChanged = prev.case.exampleUrl !== fields.exampleUrl;
        const controlChanged = prev.case.siteControl !== fields.siteControl;
        const base = urlChanged ? withoutLive(prev, prev.case.id) : prev;
        const liveDraft = `${prev.case.id}|${LIVE_SCENARIO_ID}|`;
        const drafts =
          controlChanged && !urlChanged
            ? Object.fromEntries(Object.entries(base.drafts).filter(([key]) => !key.startsWith(liveDraft)))
            : base.drafts;
        return {
          ...base,
          drafts,
          uiLanguage: fields.language,
          case: {
            ...prev.case,
            ...fields,
            ...(urlChanged
              ? {
                  liveCheck: null,
                  scenarioId: prev.case.scenarioId === LIVE_SCENARIO_ID ? null : prev.case.scenarioId,
                }
              : {}),
          },
        };
      });
      setMessage(DICTIONARIES[fields.language].intake.saved);
      return;
    }
    update((prev) => ({
      ...prev,
      uiLanguage: fields.language,
      case: { id: newId(), createdAt: new Date().toISOString(), acknowledged: true, scenarioId: null, liveCheck: null, ...fields },
    }));
    go('findings');
  }

  const errorList = INTAKE_FIELD_ORDER.filter((f) => errors[f]);

  return (
    <>
      <ScreenHeading title={d.intake.title} intro={existing ? d.intake.editIntro : d.intake.intro} />

      <form noValidate onSubmit={onSubmit} className="space-y-8">
        {errorList.length > 0 && (
          <div className="panel border-ink border-2" role="alert">
            <p className="font-semibold">{d.intake.errorSummary}</p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              {errorList.map((f) => (
                <li key={f}>{errorText(f)}</li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <label htmlFor="intake-displayName" className="font-semibold">
            {d.intake.displayName}
          </label>
          <p id="intake-displayName-hint" className="hint">
            {d.intake.displayNameHint}
          </p>
          <input
            id="intake-displayName"
            className="field mt-2"
            type="text"
            autoComplete="off"
            maxLength={NAME_MAX + 20}
            value={form.displayName}
            aria-invalid={Boolean(errors.displayName)}
            aria-describedby={describedBy('intake-displayName-hint', errors.displayName && 'intake-displayName-error')}
            onChange={(e) => set('displayName', e.target.value)}
          />
          <FieldError id="intake-displayName-error" message={errorText('displayName')} />
        </div>

        <div>
          <label htmlFor="intake-exampleUrl" className="font-semibold">
            {d.intake.exampleUrl}
          </label>
          <p id="intake-exampleUrl-hint" className="hint">
            {d.intake.exampleUrlHint}
          </p>
          <input
            id="intake-exampleUrl"
            className="field mt-2 font-mono text-[0.9375rem]"
            type="text"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            maxLength={URL_MAX + 50}
            value={form.exampleUrl}
            aria-invalid={Boolean(errors.exampleUrl)}
            aria-describedby={describedBy('intake-exampleUrl-hint', errors.exampleUrl && 'intake-exampleUrl-error')}
            onChange={(e) => set('exampleUrl', e.target.value)}
          />
          <FieldError id="intake-exampleUrl-error" message={errorText('exampleUrl')} />
        </div>

        <ChoiceGroup
          legend={d.intake.siteControl}
          hint={d.intake.siteControlHint}
          name="siteControl"
          error={errorText('siteControl')}
        >
          {SITE_CONTROLS.map((value, i) => (
            <Choice
              key={value}
              id={`intake-siteControl-${i}`}
              type="radio"
              name="siteControl"
              checked={form.siteControl === value}
              invalid={Boolean(errors.siteControl)}
              onChange={() => set('siteControl', value)}
            >
              {d.siteControl[value]}
            </Choice>
          ))}
        </ChoiceGroup>

        <ChoiceGroup legend={d.intake.language} name="language" error={errorText('language')}>
          {LANGS.map((code, i) => (
            <Choice
              key={code}
              id={`intake-language-${i}`}
              type="radio"
              name="language"
              checked={form.language === code}
              invalid={Boolean(errors.language)}
              onChange={() => set('language', code)}
              lang={DICTIONARIES[code].htmlLang}
            >
              {DICTIONARIES[code].langName}
            </Choice>
          ))}
        </ChoiceGroup>

        <ChoiceGroup
          legend={d.intake.activities}
          hint={d.intake.activitiesHint}
          name="activities"
          error={errorText('activities')}
        >
          {ACTIVITIES.map((activity: Activity, i) => (
            <Choice
              key={activity}
              id={`intake-activities-${i}`}
              type="checkbox"
              name="activities"
              checked={form.activities.includes(activity)}
              invalid={Boolean(errors.activities)}
              onChange={(checked) =>
                set('activities', checked ? [...form.activities, activity] : form.activities.filter((a) => a !== activity))
              }
            >
              {d.activities[activity]}
            </Choice>
          ))}
        </ChoiceGroup>

        <ChoiceGroup
          legend={d.intake.changeManager}
          hint={d.intake.changeManagerHint}
          name="changeManager"
          error={errorText('changeManager')}
        >
          {CHANGE_MANAGERS.map((value, i) => (
            <Choice
              key={value}
              id={`intake-changeManager-${i}`}
              type="radio"
              name="changeManager"
              checked={form.changeManager === value}
              invalid={Boolean(errors.changeManager)}
              onChange={() => set('changeManager', value)}
            >
              {d.changeManagers[value]}
            </Choice>
          ))}
        </ChoiceGroup>

        <ChoiceGroup legend={d.intake.support} name="support" error={errorText('support')}>
          {SUPPORT_LEVELS.map((value, i) => (
            <Choice
              key={value}
              id={`intake-support-${i}`}
              type="radio"
              name="support"
              checked={form.support === value}
              invalid={Boolean(errors.support)}
              onChange={() => set('support', value)}
            >
              {d.support[value]}
            </Choice>
          ))}
        </ChoiceGroup>

        <fieldset
          className="panel bg-mist"
          aria-describedby={describedBy('intake-not-collected', errors.acknowledged && 'intake-acknowledged-error')}
        >
          <legend className="label px-1">{d.intake.acknowledgement}</legend>
          <p id="intake-not-collected" className="text-[0.9375rem] text-ink-soft">
            {d.intake.notCollected}
          </p>
          <div className="choice mt-3">
            <input
              id="intake-acknowledged"
              type="checkbox"
              checked={form.acknowledged}
              disabled={Boolean(existing)}
              aria-invalid={Boolean(errors.acknowledged)}
              onChange={(e) => set('acknowledged', e.target.checked)}
            />
            <label htmlFor="intake-acknowledged" className="font-semibold">
              {d.intake.ack}
            </label>
          </div>
          <FieldError id="intake-acknowledged-error" message={errorText('acknowledged')} />
        </fieldset>

        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" className="btn btn-primary">
            {existing ? d.intake.submitEdit : d.intake.submitNew}
          </button>
          <LiveMessage message={message} />
        </div>
      </form>
    </>
  );
}

function ChoiceGroup({
  legend,
  hint,
  name,
  error,
  children,
}: {
  legend: string;
  hint?: string;
  name: string;
  error?: string;
  children: ReactNode;
}) {
  const hintId = `intake-${name}-hint`;
  const errorId = `intake-${name}-error`;
  return (
    <fieldset aria-describedby={describedBy(hint && hintId, error && errorId)}>
      <legend className="font-semibold">{legend}</legend>
      {hint && (
        <p id={hintId} className="hint">
          {hint}
        </p>
      )}
      <div className="mt-1.5">{children}</div>
      <FieldError id={errorId} message={error} />
    </fieldset>
  );
}

function Choice({
  id,
  type,
  name,
  checked,
  invalid,
  onChange,
  lang,
  children,
}: {
  id: string;
  type: 'radio' | 'checkbox';
  name: string;
  checked: boolean;
  invalid: boolean;
  onChange: (checked: boolean) => void;
  lang?: string;
  children: ReactNode;
}) {
  return (
    <div className="choice">
      <input
        id={id}
        type={type}
        name={`intake-${name}`}
        checked={checked}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label htmlFor={id} lang={lang}>
        {children}
      </label>
    </div>
  );
}
