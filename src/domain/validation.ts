import { ACTIVITIES, CHANGE_MANAGERS, LANGS, SUPPORT_LEVELS } from './types.ts';
import type { ActionRecord, Activity, ChangeManager, Lang, SupportLevel } from './types.ts';

export const NAME_MAX = 80;
export const URL_MAX = 200;
export const TEXT_MAX = 2000;

export type UrlError = 'urlRequired' | 'urlTooLong' | 'urlMalformed' | 'urlScheme' | 'urlCredentials';

/** The value is displayed as text and never navigated to. Only the local header check requests it, with its own guards. */
export function validateExampleUrl(raw: string): UrlError | null {
  const value = raw.trim();
  if (!value) return 'urlRequired';
  if (value.length > URL_MAX) return 'urlTooLong';
  if (/\s/.test(value)) return 'urlMalformed';
  const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(value);
  if (!schemeMatch) return 'urlMalformed';
  const scheme = schemeMatch[1]!.toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') return 'urlScheme';
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return 'urlMalformed';
  }
  if (!/^https?:\/\//i.test(value) || !parsed.hostname) return 'urlMalformed';
  if (parsed.username || parsed.password || /^https?:\/\/[^/?#]*@/i.test(value)) return 'urlCredentials';
  return null;
}

export interface IntakeForm {
  displayName: string;
  exampleUrl: string;
  language: Lang | '';
  activities: Activity[];
  changeManager: ChangeManager | '';
  support: SupportLevel | '';
  acknowledged: boolean;
}

export type IntakeField = 'displayName' | 'exampleUrl' | 'language' | 'activities' | 'changeManager' | 'support' | 'acknowledged';
export type IntakeError =
  | 'nameRequired'
  | 'nameTooLong'
  | UrlError
  | 'languageRequired'
  | 'activitiesRequired'
  | 'changeManagerRequired'
  | 'supportRequired'
  | 'acknowledgementRequired';

export const INTAKE_FIELD_ORDER: readonly IntakeField[] = [
  'displayName',
  'exampleUrl',
  'language',
  'activities',
  'changeManager',
  'support',
  'acknowledged',
];

export function validateIntake(form: IntakeForm): Partial<Record<IntakeField, IntakeError>> {
  const errors: Partial<Record<IntakeField, IntakeError>> = {};
  const name = form.displayName.trim();
  if (!name) errors.displayName = 'nameRequired';
  else if (name.length > NAME_MAX) errors.displayName = 'nameTooLong';
  const urlError = validateExampleUrl(form.exampleUrl);
  if (urlError) errors.exampleUrl = urlError;
  if (!LANGS.includes(form.language as Lang)) errors.language = 'languageRequired';
  if (form.activities.length === 0 || !form.activities.every((a) => ACTIVITIES.includes(a))) {
    errors.activities = 'activitiesRequired';
  }
  if (!CHANGE_MANAGERS.includes(form.changeManager as ChangeManager)) errors.changeManager = 'changeManagerRequired';
  if (!SUPPORT_LEVELS.includes(form.support as SupportLevel)) errors.support = 'supportRequired';
  if (!form.acknowledged) errors.acknowledged = 'acknowledgementRequired';
  return errors;
}

export type ActionField = 'role' | 'followUpDate' | 'deferralReason' | 'recheckDate' | 'recheckEvidence' | 'recheckOutcome' | 'notes';
export type ActionError =
  | 'roleRequired'
  | 'dateInvalid'
  | 'deferralReasonRequired'
  | 'recheckDateRequired'
  | 'recheckDateFuture'
  | 'recheckEvidenceRequired'
  | 'recheckOutcomeRequired'
  | 'textTooLong';

export const ACTION_FIELD_ORDER: readonly ActionField[] = [
  'role',
  'notes',
  'followUpDate',
  'deferralReason',
  'recheckDate',
  'recheckEvidence',
  'recheckOutcome',
];

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** `today` is a local yyyy-mm-dd date so a recheck cannot be dated in the future. */
export function validateAction(action: ActionRecord, today: string): Partial<Record<ActionField, ActionError>> {
  const errors: Partial<Record<ActionField, ActionError>> = {};
  if (!action.role.trim()) errors.role = 'roleRequired';
  for (const field of ['role', 'notes', 'deferralReason', 'recheckEvidence'] as const) {
    if (action[field].length > TEXT_MAX) errors[field] = 'textTooLong';
  }
  if (action.followUpDate && !isIsoDate(action.followUpDate)) errors.followUpDate = 'dateInvalid';
  if (action.status === 'deferred' && !action.deferralReason.trim()) errors.deferralReason = 'deferralReasonRequired';
  if (action.status === 'rechecked') {
    if (!action.recheckDate) errors.recheckDate = 'recheckDateRequired';
    else if (!isIsoDate(action.recheckDate)) errors.recheckDate = 'dateInvalid';
    else if (action.recheckDate > today) errors.recheckDate = 'recheckDateFuture';
    if (!action.recheckEvidence.trim()) errors.recheckEvidence = 'recheckEvidenceRequired';
    if (!action.recheckOutcome) errors.recheckOutcome = 'recheckOutcomeRequired';
  }
  return errors;
}

export function localIsoDate(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
