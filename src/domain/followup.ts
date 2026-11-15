import type { ActionRecord, SupportLevel } from './types.ts';

export function emptyAction(role: string): ActionRecord {
  return {
    status: 'awaiting',
    role,
    notes: '',
    followUpDate: '',
    deferralReason: '',
    recheckDate: '',
    recheckEvidence: '',
    recheckOutcome: '',
    updatedAt: '',
  };
}

/** Status and verification outcome are separate: only a recheck that observed the change closes an item. */
export function isOutstanding(action: ActionRecord): boolean {
  return !(action.status === 'rechecked' && action.recheckOutcome === 'changed');
}

/** Clears fields that do not belong to the chosen status so stale evidence is never saved. */
export function normaliseAction(action: ActionRecord, updatedAt: string): ActionRecord {
  return {
    ...action,
    role: action.role.trim(),
    notes: action.notes.trim(),
    deferralReason: action.status === 'deferred' ? action.deferralReason.trim() : '',
    recheckDate: action.status === 'rechecked' ? action.recheckDate : '',
    recheckEvidence: action.status === 'rechecked' ? action.recheckEvidence.trim() : '',
    recheckOutcome: action.status === 'rechecked' ? action.recheckOutcome : '',
    updatedAt,
  };
}

export type NextStepKey = 'providerDirected' | 'contract' | 'inhouse';

/** Support level changes who acts and what they depend on, never the technical severity. */
export function nextStepKey(support: SupportLevel): NextStepKey {
  if (support === 'none' || support === 'occasional') return 'providerDirected';
  return support;
}
